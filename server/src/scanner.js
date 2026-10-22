
const MAX_REPOSITORIES = 5;
const MAX_FILES_PER_REPOSITORY = 20;
const MAX_FILE_BYTES = 100_000;
export const MAX_FINDINGS = 100;

const SKIP_EXTENSIONS =
  /\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|gz|woff2?|ttf|mp4|mp3)$/i;

const isDevelopment = process.env.NODE_ENV !== "production";

function logDiagnostic(event, details) {
  if (isDevelopment) {
    console.warn(`[scanner] ${event}`, details);
  }
}

const SECRET_RULES = [
  {
    id: "github-token",
    category: "potential_secret",
    severity: "high",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    description: "Possible GitHub personal access token",
  },
  {
    id: "aws-access-key",
    category: "potential_secret",
    severity: "high",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    description: "Possible AWS access key ID",
  },
  {
    id: "private-key",
    category: "private_key",
    severity: "high",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    description: "Private key marker detected",
  },
  {
    id: "credential-assignment",
    category: "potential_secret",
    severity: "medium",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?([A-Za-z0-9_./+=-]{12,})["']?/gi,
    description: "Possible hardcoded credential assignment",
  },
];

async function githubGet(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Digital-Shadow-AI",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    logDiagnostic("GitHub API request failed", {
      status: response.status,
      url: new URL(url).pathname,
    });
    const error = new Error("GitHub API request failed.");
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export function scanText(
  text,
  { repository, filePath, repositoryUrl, defaultBranch },
  remainingFindings = MAX_FINDINGS
) {
  const findings = [];

  for (const rule of SECRET_RULES) {
    // Reset global regex state before scanning each file.
    rule.pattern.lastIndex = 0;

    let match;

    while ((match = rule.pattern.exec(text)) !== null) {
      const lineNumber =
        text.slice(0, match.index).split("\n").length;

      findings.push({
        id: `${repository}:${filePath}:${lineNumber}:${rule.id}`,
        ruleId: rule.id,
        title: rule.description,
        category: rule.category,
        severity: rule.severity,
        confidence: "medium",
        description:
          "A pattern associated with a possible exposed credential was detected. Its validity has not been verified.",
        repository,
        filePath,
        lineNumber,
        evidence: `${rule.description}: [REDACTED]`,
        sourceUrl:
          `${repositoryUrl}/blob/${defaultBranch}/` +
          `${filePath.split("/").map(encodeURIComponent).join("/")}` +
          `#L${lineNumber}`,
        remediation:
          "Review the source. If a genuine credential was exposed, " +
          "revoke or rotate it, then remove it from the source and " +
          "repository history as appropriate.",
      });

      if (findings.length >= remainingFindings) {
        return { findings, truncated: true };
      }

      if (match[0].length === 0) {
        rule.pattern.lastIndex++;
      }
    }
  }

  return { findings, truncated: false };
}

export async function scanRepositories(username, repositories) {
  const findings = [];
  let filesInspected = 0;
  let repositoriesInspected = 0;
  let filesSkipped = 0;
  let repositoriesSkipped = 0;
  let truncated = false;

  const selectedRepositories = repositories.slice(0, MAX_REPOSITORIES);

  if (repositories.length > MAX_REPOSITORIES) {
    truncated = true;
  }

  for (const repo of selectedRepositories) {
    try {
      if (!repo.default_branch || !repo.name || !repo.html_url) {
        repositoriesSkipped++;
        continue;
      }

      const treeUrl =
        `https://api.github.com/repos/${encodeURIComponent(username)}/` +
        `${encodeURIComponent(repo.name)}/git/trees/` +
        `${encodeURIComponent(repo.default_branch)}?recursive=1`;

      const tree = await githubGet(treeUrl);
      repositoriesInspected++;

      if (tree.truncated) {
        truncated = true;
      }

      const allFiles = (tree.tree || []).filter(
        (item) =>
          item.type === "blob" &&
          item.size > 0 &&
          item.size <= MAX_FILE_BYTES &&
          !SKIP_EXTENSIONS.test(item.path)
      );

      const files = allFiles.slice(0, MAX_FILES_PER_REPOSITORY);
      filesSkipped += allFiles.length - files.length;

      for (const file of files) {
        const rawUrl =
          `https://raw.githubusercontent.com/${encodeURIComponent(username)}/` +
          `${encodeURIComponent(repo.name)}/` +
          `${repo.default_branch.split("/").map(encodeURIComponent).join("/")}/` +
          file.path.split("/").map(encodeURIComponent).join("/");

        let response;

        try {
          response = await fetch(rawUrl, {
            signal: AbortSignal.timeout(8000),
          });
        } catch (error) {
          logDiagnostic("Raw file request failed", {
            repository: repo.name,
            filePath: file.path,
            error: error?.name || "UnknownError",
          });
          filesSkipped++;
          continue;
        }

        if (!response.ok) {
          logDiagnostic("Raw file request returned an error", {
            repository: repo.name,
            filePath: file.path,
            status: response.status,
          });
          filesSkipped++;
          continue;
        }

        const text = await response.text();

        if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) {
          filesSkipped++;
          continue;
        }

        filesInspected++;

        const scan = scanText(
          text,
          {
            repository: repo.name,
            filePath: file.path,
            repositoryUrl: repo.html_url,
            defaultBranch: repo.default_branch,
          },
          MAX_FINDINGS - findings.length
        );

        findings.push(...scan.findings);

        if (scan.truncated) {
          return {
            findings,
            filesInspected,
            repositoriesInspected,
            filesSkipped,
            repositoriesSkipped,
            truncated: true,
          };
        }
      }
    } catch (error) {
      logDiagnostic("Repository scan failed", {
        repository: repo.name || "unknown",
        error: error?.name || "UnknownError",
        status: error?.status,
      });
      repositoriesSkipped++;
    }
  }

  return {
    findings,
    filesInspected,
    repositoriesInspected,
    filesSkipped,
    repositoriesSkipped,
    truncated,
  };
}
