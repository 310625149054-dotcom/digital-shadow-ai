
const MAX_REPOSITORIES = 5;
const MAX_FILES_PER_REPOSITORY = 20;
const MAX_FILE_BYTES = 100_000;
export const MAX_FINDINGS = 100;

const SKIP_EXTENSIONS =
  /\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|gz|woff2?|ttf|mp4|mp3)$/i;

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
    const error = new Error(`GitHub returned HTTP ${response.status}`);
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
    rule.pattern.lastIndex = 0;

    let match;
    while ((match = rule.pattern.exec(text)) !== null) {
      const lineNumber = text.slice(0, match.index).split("\n").length;

      findings.push({
        id: `${repository}:${filePath}:${lineNumber}:${rule.id}`,
        category: rule.category,
        severity: rule.severity,
        confidence: "medium",
        description: rule.description,
        repository,
        filePath,
        lineNumber,
        evidence: `${rule.description}: [REDACTED]`,
        sourceUrl:
          `${repositoryUrl}/blob/${defaultBranch}/` +
          `${filePath.split("/").map(encodeURIComponent).join("/")}` +
          `#L${lineNumber}`,
        remediation:
          "Verify the finding. If it is a genuine credential, revoke " +
          "and rotate it, then move secrets to environment variables.",
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

  for (const repo of repositories.slice(0, MAX_REPOSITORIES)) {
    try {
      const treeUrl =
        `https://api.github.com/repos/${encodeURIComponent(username)}/` +
        `${encodeURIComponent(repo.name)}/git/trees/` +
        `${encodeURIComponent(repo.default_branch)}?recursive=1`;

      const tree = await githubGet(treeUrl);
      repositoriesInspected++;

      const files = (tree.tree || [])
        .filter(
          (item) =>
            item.type === "blob" &&
            item.size > 0 &&
            item.size <= MAX_FILE_BYTES &&
            !SKIP_EXTENSIONS.test(item.path)
        )
        .slice(0, MAX_FILES_PER_REPOSITORY);

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
        } catch {
          continue;
        }

        if (!response.ok) continue;

        const text = await response.text();
        if (text.length > MAX_FILE_BYTES) continue;

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
            truncated: true,
          };
        }
      }
    } catch (error) {
      console.warn(
        `Skipped repository ${repo.name}: ${error.message}`
      );
    }
  }

  return {
    findings,
    filesInspected,
    repositoriesInspected,
    truncated: false,
  };
}
