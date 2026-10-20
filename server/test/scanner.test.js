import assert from "node:assert/strict";
import test from "node:test";

import { MAX_FINDINGS, scanText } from "../src/scanner.js";

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
