import { scanRepositories } from "./scanner.js";
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
    ],
  })
);
app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "digital-shadow-api",
  });
});

app.post("/api/scans", async (req, res) => {
  const rawUsername = req.body?.username;

  if (typeof rawUsername !== "string") {
    return res.status(400).json({
      error: "Enter a valid GitHub username.",
    });
  }

  const username = rawUsername.trim();
  const validUsername =
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username);

  if (!validUsername) {
    return res.status(400).json({
      error: "Enter a valid GitHub username.",
    });
  }

  try {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=10&sort=updated`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Digital-Shadow-AI",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (response.status === 404) {
      return res.status(404).json({
        error: "GitHub user not found.",
      });
    }

    if (response.status === 403 || response.status === 429) {
      return res.status(429).json({
        error: "GitHub rate limit reached. Try again later.",
      });
    }

    if (!response.ok) {
      return res.status(502).json({
        error: "GitHub could not provide repository data.",
      });
    }

    const repos = await response.json();
    const scan = await scanRepositories(username, repos);
    const highSeverityFindings = scan.findings.filter(
      (finding) => finding.severity === "high"
    ).length;
    const mediumSeverityFindings = scan.findings.filter(
      (finding) => finding.severity === "medium"
    ).length;
    const score = Math.max(
      0,
      100 - highSeverityFindings * 25 - mediumSeverityFindings * 10
    );

    return res.json({
      scanId: `scan-${Date.now()}`,
      username,
      status: "completed",
      summary: {
        score,
        riskLevel:
          highSeverityFindings > 0
            ? "high"
            : mediumSeverityFindings > 0
              ? "medium"
              : "low",
        repositoriesScanned: scan.repositoriesInspected,
        filesInspected: scan.filesInspected,
        findingsCount: scan.findings.length,
        truncated: scan.truncated,
      },
      repositories: repos.map((repo) => ({
        name: repo.name,
        description: repo.description,
        url: repo.html_url,
        updatedAt: repo.updated_at,
        isPrivate: repo.private,
      })),
      findings: scan.findings,
      demo: false,
      message:
        "Public repository metadata retrieved and selected repository files were scanned for potential exposures.",
    });
  } catch (error) {
    console.error("GitHub request failed:", error.message);

    return res.status(502).json({
      error: "Unable to retrieve GitHub data. Please try again.",
    });
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
