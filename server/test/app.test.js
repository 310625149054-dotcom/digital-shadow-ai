import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import test from "node:test";

process.env.NODE_ENV = "test";

const { app } = await import("../src/app.js");

function postScan(port, body) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify(body);
    const clientRequest = request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/scans",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
        },
      },
      (response) => {
        let responseBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode,
            data: JSON.parse(responseBody),
          });
        });
      }
    );

    clientRequest.on("error", reject);
    clientRequest.end(requestBody);
  });
}

test("returns partial status and coverage note when a repository is skipped", async () => {
  const originalFetch = globalThis.fetch;
  const server = createServer(app);

  globalThis.fetch = async (url) => {
    if (String(url).includes("/users/example-user/repos")) {
      return new Response(
        JSON.stringify([
          {
            name: "valid-repository",
            default_branch: "main",
            html_url: "https://github.com/example-user/valid-repository",
          },
          {
            name: "skipped-repository",
            html_url: "https://github.com/example-user/skipped-repository",
          },
        ]),
        { status: 200 }
      );
    }

    if (String(url).includes("/git/trees/")) {
      return new Response(
        JSON.stringify({
          truncated: false,
          tree: [
            { type: "blob", path: "config.js", size: 32 },
          ],
        }),
        { status: 200 }
      );
    }

    return new Response(
      `const token = "github_pat_${"X".repeat(20)}";`,
      { status: 200 }
    );
  };

  try {
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    const response = await postScan(port, { username: "example-user" });
    const data = response.data;

    assert.equal(response.status, 200);
    assert.equal(data.status, "partial");
    assert.match(data.summary.coverageNote, /Partial coverage/);
    assert.equal(data.summary.repositoriesSkipped, 1);
    assert.equal(data.findings[0].evidence, "Possible GitHub personal access token: [REDACTED]");
    assert.ok(!JSON.stringify(data).includes(`github_pat_${"X".repeat(20)}`));
  } finally {
    server.close();
    globalThis.fetch = originalFetch;
  }
});
