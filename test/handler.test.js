import assert from "node:assert/strict";
import { handleRequest } from "../src/handler.js";

const originalFetch = globalThis.fetch;
const subscription = "hysteria2://pw@node.example:443/#HK-01";
const subscriptionWithInfo = [
  subscription,
  "vless://uuid@info.example:443/#%E5%89%A9%E4%BD%99%E6%B5%81%E9%87%8F%EF%BC%9A954.73%20GB",
  "vless://uuid@expire.example:443/#%E5%A5%97%E9%A4%90%E5%88%B0%E6%9C%9F%EF%BC%9A%E9%95%BF%E6%9C%9F%E6%9C%89%E6%95%88",
].join("\n");
const env = {
  ACCESS_TOKEN: "test-token",
  SUBSCRIPTION_URL: "https://provider.example/subscription",
};

function profileRequest(path, init) {
  return new Request(`https://profile.example${path}`, init);
}

async function useFetch(mock, callback) {
  globalThis.fetch = mock;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

let fetchCalls = 0;
await useFetch(
  async (_url, options) => {
    fetchCalls += 1;
    assert.equal(options.headers, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(subscriptionWithInfo, {
      headers: {
        "subscription-userinfo":
          "download=200; upload=100; total=300; expire=4102444800; reset_day=1",
        "content-disposition":
          "attachment; filename*=UTF-8''%E8%89%AF%E5%BF%83%E4%BA%91",
      },
    });
  },
  async () => {
    const hiddenPaths = [
      "/",
      "/sub",
      "/sub/test-token/extra",
      "/sub/test%2Ftoken",
      "/api/sub/test-token",
    ];
    for (const path of hiddenPaths) {
      const response = await handleRequest(profileRequest(path), env);
      assert.equal(response.status, 404, path);
    }

    const wrongMethod = await handleRequest(
      profileRequest("/sub/test-token", { method: "POST" }),
      env,
    );
    assert.equal(wrongMethod.status, 404);

    const wrongToken = await handleRequest(profileRequest("/sub/wrong"), env);
    assert.equal(wrongToken.status, 404);
    assert.equal(fetchCalls, 0);

    const response = await handleRequest(
      profileRequest("/sub/test-token?download=1"),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(
      response.headers.get("subscription-userinfo"),
      "upload=100; download=200; total=300; expire=4102444800",
    );
    assert.equal(
      response.headers.get("content-disposition"),
      "attachment; filename=\"Surfboard.conf\"; filename*=UTF-8''%E8%89%AF%E5%BF%83%E4%BA%91",
    );
    assert.match(
      await response.text(),
      /^#!MANAGED-CONFIG https:\/\/profile\.example\/sub\/test-token interval=86400 strict=false/,
    );
    assert.equal(fetchCalls, 1);

    const missingToken = await handleRequest(
      profileRequest("/sub/test-token"),
      { SUBSCRIPTION_URL: env.SUBSCRIPTION_URL },
    );
    assert.equal(missingToken.status, 503);

    const missingSubscription = await handleRequest(
      profileRequest("/sub/test-token"),
      { ACCESS_TOKEN: env.ACCESS_TOKEN },
    );
    assert.equal(missingSubscription.status, 503);

    const invalidSubscription = await handleRequest(
      profileRequest("/sub/test-token"),
      { ...env, SUBSCRIPTION_URL: "file:///private/subscription" },
    );
    assert.equal(invalidSubscription.status, 503);
    assert.equal(fetchCalls, 1);
  },
);

await useFetch(
  async () => new Response(subscriptionWithInfo),
  async () => {
    const response = await handleRequest(
      profileRequest("/sub/test-token"),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("subscription-userinfo"),
      "upload=0; download=0; total=1025133531627; expire=0",
    );
    assert.equal(
      response.headers.get("content-disposition"),
      'attachment; filename="Surfboard.conf"',
    );
  },
);

await useFetch(
  async () =>
    new Response(subscription, {
      headers: {
        "subscription-userinfo": "upload=100; download=invalid; total=300",
        "content-disposition": 'attachment; filename="../private.conf"',
      },
    }),
  async () => {
    const response = await handleRequest(
      profileRequest("/sub/test-token"),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("subscription-userinfo"), null);
    assert.equal(
      response.headers.get("content-disposition"),
      'attachment; filename="Surfboard.conf"',
    );
  },
);

await useFetch(
  async () =>
    new Response(null, {
      headers: { "content-length": String(5 * 1024 * 1024 + 1) },
    }),
  async () => {
    const response = await handleRequest(
      profileRequest("/sub/test-token"),
      env,
    );
    assert.equal(response.status, 502);
    assert.equal(await response.text(), "Subscription payload too large.");
  },
);

await useFetch(
  async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1)),
  async () => {
    const response = await handleRequest(
      profileRequest("/sub/test-token"),
      env,
    );
    assert.equal(response.status, 502);
    assert.equal(await response.text(), "Subscription payload too large.");
  },
);

await useFetch(
  async () => {
    throw new Error(
      `upstream failed: ${env.SUBSCRIPTION_URL} ${env.ACCESS_TOKEN}`,
    );
  },
  async () => {
    const response = await handleRequest(
      profileRequest("/sub/test-token"),
      env,
    );
    const body = await response.text();
    assert.equal(response.status, 502);
    assert.equal(body, "Subscription provider unavailable.");
    assert.ok(!body.includes(env.ACCESS_TOKEN));
    assert.ok(!body.includes(env.SUBSCRIPTION_URL));
  },
);

await useFetch(
  async () => {
    const error = new Error(
      `timeout: ${env.SUBSCRIPTION_URL} ${env.ACCESS_TOKEN}`,
    );
    error.name = "AbortError";
    throw error;
  },
  async () => {
    const response = await handleRequest(
      profileRequest("/sub/test-token"),
      env,
    );
    const body = await response.text();
    assert.equal(response.status, 504);
    assert.equal(body, "Subscription provider timeout.");
    assert.ok(!body.includes(env.ACCESS_TOKEN));
    assert.ok(!body.includes(env.SUBSCRIPTION_URL));
  },
);

console.log(
  "\n# shared handler\n  ✓ public route, fail-closed auth, limits, and sanitized upstream failures",
);
