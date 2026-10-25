import express from "express";
import cors from "cors";
import { scanRepositories } from "./scanner.js";
import { calculateRisk } from "./risk.js";

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = [
  "https://digital-shadow-ai.netlify.app",
  "http://localhost:5173",
  "http://localhost:5176",
  ...(process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : []),
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json({ limit: "10kb" }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "digital-shadow-api",
  });
});

// Start a scan of public GitHub repositories
app.post("/api/scans", async (req, res) => {
  const rawUsername = req.body?.username;

  if (typeof rawUsername !== "string") {
    return res.status(400).json({
      error: {
        code: "INVALID_USERNAME",
        message: "Enter a valid GitHub username.",
      },
    });
  }

  const username = rawUsername.trim();

  // GitHub usernames are 1–39 characters and cannot start or end with a hyphen.
  const validUsername =
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username);

  if (!validUsername) {
    return res.status(400).json({
      error: {
        code: "INVALID_USERNAME",
        message: "Enter a valid GitHub username.",
      },
    });
  }

  try {
    const githubResponse = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Digital-Shadow-AI",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (githubResponse.status === 404) {
      return res.status(404).json({
        error: {
          code: "GITHUB_USER_NOT_FOUND",
          message: "GitHub user not found.",
        },
      });
    }

    if (
      githubResponse.status === 403 ||
      githubResponse.status === 429
    ) {
      const rateLimited =
        githubResponse.headers.get("x-ratelimit-remaining") === "0" ||
        githubResponse.status === 429;

      return res.status(rateLimited ? 429 : 502).json({
        error: {
          code: rateLimited
            ? "GITHUB_RATE_LIMIT"
            : "GITHUB_REQUEST_FORBIDDEN",
          message: rateLimited
            ? "GitHub rate limit reached. Please try again later."
            : "GitHub refused the request. Please try again later.",
        },
      });
    }

    if (!githubResponse.ok) {
      return res.status(502).json({
        error: {
          code: "GITHUB_UPSTREAM_ERROR",
          message: "GitHub could not provide repository data.",
        },
      });
    }

    const repositories = await githubResponse.json();

    if (!Array.isArray(repositories)) {
      return res.status(502).json({
        error: {
          code: "INVALID_GITHUB_RESPONSE",
          message: "GitHub returned an unexpected response.",
        },
      });
    }

    // Scan repositories and calculate a deterministic risk indicator.
    const scan = await scanRepositories(username, repositories);
    const risk = calculateRisk(scan.findings);

    const repositoryLimitReached =
      repositories.length >= 100 ||
      repositories.length > 5;

    const partial =
      scan.truncated === true ||
      repositoryLimitReached ||
      (scan.filesSkipped ?? 0) > 0 ||
      (scan.repositoriesSkipped ?? 0) > 0;

    return res.json({
      scanId: `scan-${Date.now()}`,
      username,
      status: partial ? "partial" : "completed",

      summary: {
        ...risk,
        repositoriesReturned: repositories.length,
        repositoriesScanned: scan.repositoriesInspected,
        filesInspected: scan.filesInspected,
        filesSkipped: scan.filesSkipped ?? 0,
        repositoriesSkipped: scan.repositoriesSkipped ?? 0,
        findingsCount: scan.findings.length,
        truncated: scan.truncated ?? false,
        coverageNote: partial
          ? "Partial coverage: some resources may not have been inspected. This result does not represent a complete account scan."
          : "Selected public resources were inspected. No findings does not prove the account is secure.",
      },

      repositories: repositories.map((repo) => ({
        name: repo.name,
        description: repo.description,
        url: repo.html_url,
        updatedAt: repo.updated_at,
      })),

      findings: scan.findings,

      message:
        "Selected public GitHub repositories and files were inspected for potential exposure indicators.",
    });
  } catch (error) {
    const timedOut =
      error?.name === "TimeoutError" ||
      error?.name === "AbortError";

    // Do not send internal exception details to the frontend.
    if (process.env.NODE_ENV !== "production") {
      console.error("GitHub scan failed during request handling.", {
        error: error?.name || "UnknownError",
        status: error?.status,
      });
    } else {
      console.error(
        timedOut
          ? "GitHub request timed out."
          : "GitHub request failed."
      );
    }

    return res.status(502).json({
      error: {
        code: timedOut ? "GITHUB_TIMEOUT" : "GITHUB_UNAVAILABLE",
        message: timedOut
          ? "GitHub took too long to respond. Please try again."
          : "Unable to retrieve GitHub data. Please try again.",
      },
    });
  }
});

// Consistent response for unknown API routes.
app.use("/api", (_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "API endpoint not found.",
    },
  });
});

export { app };

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`API running at http://localhost:${PORT}`);
  });
}
