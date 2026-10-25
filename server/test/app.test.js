import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import test from "node:test";

process.env.NODE_ENV = "test";

const { app } = await import("../src/app.js");

function postScan(port, body, origin) {
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
          ...(origin ? { Origin: origin } : {}),
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
            headers: response.headers,
            data: JSON.parse(responseBody),
          });
        });
      }
    );

    clientRequest.on("error", reject);
    clientRequest.end(requestBody);
  });
}

function preflight(port, origin) {
  return new Promise((resolve, reject) => {
    const clientRequest = request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/scans",
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type",
        },
      },
      (response) => {
        resolve({
          status: response.statusCode,
          headers: response.headers,
        });
      }
    );

    clientRequest.on("error", reject);
    clientRequest.end();
  });
}

test("allows configured frontend origins to preflight scan requests", async () => {
  const server = createServer(app);

  try {
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    for (const origin of [
      "https://digital-shadow-ai.netlify.app",
      "http://localhost:5173",
      "http://localhost:5176",
    ]) {
      const response = await preflight(port, origin);

      assert.equal(response.status, 204);
      assert.equal(response.headers["access-control-allow-origin"], origin);
      assert.match(response.headers["access-control-allow-methods"], /POST/);
      assert.match(
        response.headers["access-control-allow-headers"],
        /Content-Type/i
      );
    }
  } finally {
    server.close();
  }
});

test("validates GitHub usernames and includes CORS headers on POST", async () => {
  const originalFetch = globalThis.fetch;
  const server = createServer(app);
  const origin = "https://digital-shadow-ai.netlify.app";

  globalThis.fetch = async () =>
    new Response(JSON.stringify([]), { status: 200 });

  try {
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();

    for (const username of ["-user", "user-", "user_name", "a".repeat(40)]) {
      const response = await postScan(port, { username }, origin);

      assert.equal(response.status, 400);
      assert.equal(response.data.error.code, "INVALID_USERNAME");
      assert.equal(response.headers["access-control-allow-origin"], origin);
    }

    const validResponse = await postScan(port, { username: "a" }, origin);
    assert.equal(validResponse.status, 200);
    assert.equal(
      validResponse.headers["access-control-allow-origin"],
      origin
    );
  } finally {
    server.close();
    globalThis.fetch = originalFetch;
  }
});

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
