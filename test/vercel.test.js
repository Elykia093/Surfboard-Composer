import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vercelHandler, { config as edgeConfig } from "../api/sub/[token].js";

const vercelConfig = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);
const [rewrite] = vercelConfig.rewrites;

assert.equal(edgeConfig.runtime, "edge");
assert.equal(vercelConfig.functions, undefined);
assert.equal(rewrite.source, "/sub/:token");
assert.equal(rewrite.destination, "/api/sub/:token");
assert.deepEqual(rewrite.transforms, [
  {
    type: "request.path",
    op: "set",
    args: "/sub/:token",
  },
]);

const originalFetch = globalThis.fetch;
const envKeys = ["ACCESS_TOKEN", "SUBSCRIPTION_URL", "PASSWORD_FILTER"];
const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
);

try {
  process.env.ACCESS_TOKEN = "test-token";
  process.env.SUBSCRIPTION_URL = "https://provider.example/subscription";
  delete process.env.PASSWORD_FILTER;
  globalThis.fetch = async () =>
    new Response("hysteria2://password@node.example:443/#HK-01");

  const response = await vercelHandler(
    new Request("https://profile.example/sub/test-token"),
  );
  assert.equal(response.status, 200);
  assert.match(
    await response.text(),
    /^#!MANAGED-CONFIG https:\/\/profile\.example\/sub\/test-token interval=86400 strict=false/,
  );

  const internalResponse = await vercelHandler(
    new Request("https://profile.example/api/sub/test-token"),
  );
  assert.equal(internalResponse.status, 404);
} finally {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}

console.log(
  "\n# Vercel contract\n  ✓ rewrite, Edge runtime, adapter env mapping, and public route smoke test",
);
