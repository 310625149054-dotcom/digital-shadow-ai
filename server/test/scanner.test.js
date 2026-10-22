import assert from "node:assert/strict";
import test from "node:test";

import { MAX_FINDINGS, scanRepositories, scanText } from "../src/scanner.js";

const context = {
  repository: "synthetic-repository",
  filePath: "config.js",
  repositoryUrl: "https://github.com/example/synthetic-repository",
  defaultBranch: "main",
};

test("detects every supported secret pattern", () => {
  const samples = [
    `github_pat_${"A".repeat(20)}`,
    `AKIA${"A".repeat(16)}`,
    "-----BEGIN RSA PRIVATE KEY-----",
    'api_key = "synthetic-value-1234"',
  ];

  for (const sample of samples) {
    const result = scanText(sample, context);

    assert.equal(result.findings.length, 1);
    assert.equal(result.truncated, false);
  }
});

test("redacts matched values in finding evidence", () => {
  const secret = `github_pat_${"B".repeat(20)}`;
  const result = scanText(`token = ${secret}`, context);

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].evidence, "Possible GitHub personal access token: [REDACTED]");
  assert.ok(!result.findings[0].evidence.includes(secret));
});

test("reports the one-based line number of a finding", () => {
  const secret = `AKIA${"C".repeat(16)}`;
  const result = scanText(`first line\nsecond line\nkey = ${secret}`, context);

  assert.equal(result.findings[0].lineNumber, 3);
  assert.match(result.findings[0].sourceUrl, /#L3$/);
});

test("stops at the maximum findings limit", () => {
  const secret = `github_pat_${"D".repeat(20)}`;
  const text = `${Array(MAX_FINDINGS + 1).fill(secret).join("\n")}`;
  const result = scanText(text, context);

  assert.equal(result.findings.length, MAX_FINDINGS);
  assert.equal(result.truncated, true);
});

test("constructs tree and raw-file URLs from the repository default branch", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url) => {
    requests.push(String(url));

    if (String(url).includes("/git/trees/")) {
      return new Response(
        JSON.stringify({
          truncated: false,
          tree: [
            {
              type: "blob",
              path: "README.md",
              size: 12,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("safe content", { status: 200 });
  };

  try {
    const result = await scanRepositories("example-user", [
      {
        name: "example-repository",
        default_branch: "feature/security",
        html_url: "https://github.com/example-user/example-repository",
      },
    ]);

    assert.equal(result.repositoriesInspected, 1);
    assert.equal(result.filesInspected, 1);
    assert.match(
      requests[0],
      /\/git\/trees\/feature%2Fsecurity\?recursive=1$/
    );
    assert.match(
      requests[1],
      /raw\.githubusercontent\.com\/example-user\/example-repository\/feature\/security\/README\.md$/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("marks invalid repositories as skipped", async () => {
  const result = await scanRepositories("example-user", [
    {
      name: "missing-branch",
      html_url: "https://github.com/example-user/missing-branch",
    },
  ]);

  assert.equal(result.repositoriesInspected, 0);
  assert.equal(result.repositoriesSkipped, 1);
  assert.equal(result.filesSkipped, 0);
});

test("marks repository and file limits as incomplete coverage", async () => {
  const originalFetch = globalThis.fetch;
  let treeRequests = 0;

  globalThis.fetch = async (url) => {
    if (String(url).includes("/git/trees/")) {
      treeRequests++;
      return new Response(
        JSON.stringify({
          truncated: false,
          tree: Array.from({ length: 21 }, (_, index) => ({
            type: "blob",
            path: `file-${index}.js`,
            size: 12,
          })),
        }),
        { status: 200 }
      );
    }

    return new Response("safe content", { status: 200 });
  };

  try {
    const repositories = Array.from({ length: 6 }, (_, index) => ({
      name: `repository-${index}`,
      default_branch: "main",
      html_url: `https://github.com/example-user/repository-${index}`,
    }));
    const result = await scanRepositories("example-user", repositories);

    assert.equal(treeRequests, 5);
    assert.equal(result.repositoriesInspected, 5);
    assert.equal(result.filesInspected, 100);
    assert.equal(result.filesSkipped, 5);
    assert.equal(result.truncated, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("counts file fetch failures as skipped files", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = async (url) => {
    requestCount++;

    if (String(url).includes("/git/trees/")) {
      return new Response(
        JSON.stringify({
          truncated: false,
          tree: [
            { type: "blob", path: "unavailable.js", size: 12 },
          ],
        }),
        { status: 200 }
      );
    }

    throw new Error("synthetic file fetch failure");
  };

  try {
    const result = await scanRepositories("example-user", [
      {
        name: "repository",
        default_branch: "main",
        html_url: "https://github.com/example-user/repository",
      },
    ]);

    assert.equal(requestCount, 2);
    assert.equal(result.filesInspected, 0);
    assert.equal(result.filesSkipped, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("marks truncated GitHub trees as incomplete coverage", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (String(url).includes("/git/trees/")) {
      return new Response(
        JSON.stringify({
          truncated: true,
          tree: [],
        }),
        { status: 200 }
      );
    }

    return new Response("safe content", { status: 200 });
  };

  try {
    const result = await scanRepositories("example-user", [
      {
        name: "repository",
        default_branch: "main",
        html_url: "https://github.com/example-user/repository",
      },
    ]);

    assert.equal(result.truncated, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
