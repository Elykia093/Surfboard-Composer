/**
 * Shared Fetch handler for Cloudflare Workers and Vercel Edge.
 */
import { buildManagedConfigLine, getConfig } from "./config.js";
import { GENERAL_TEMPLATE } from "./general.js";
import { extractNodes, extractSubscribeInfo } from "./parser.js";
import { buildProxySection, buildWireGuardSections } from "./transform.js";
import { buildGroups } from "./groups.js";
import { decodeRules } from "./rules.js";

const UPSTREAM_TIMEOUT_MS = 15_000;
const MAX_UPSTREAM_BYTES = 5 * 1024 * 1024;

class UpstreamError extends Error {
  constructor(message) {
    super(message);
    this.name = "UpstreamError";
  }
}

class UpstreamTimeoutError extends Error {
  constructor() {
    super("Subscription provider timeout");
    this.name = "UpstreamTimeoutError";
  }
}

class ConfigurationError extends Error {
  constructor() {
    super("Invalid subscription configuration");
    this.name = "ConfigurationError";
  }
}

class PayloadTooLargeError extends Error {
  constructor() {
    super("Subscription payload too large");
    this.name = "PayloadTooLargeError";
  }
}

function textResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function readRoute(url) {
  const publicPath = url.pathname;
  const match = publicPath.match(/^\/sub\/([^/]+)$/);
  if (!match) return null;

  try {
    const token = decodeURIComponent(match[1]);
    if (!token || token.includes("/")) return null;
    return { token, publicPath };
  } catch {
    return null;
  }
}

async function tokensMatch(left, right) {
  if (!left || !right) return false;
  if (!globalThis.crypto?.subtle) return false;

  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    globalThis.crypto.subtle.digest("SHA-256", encoder.encode(left)),
    globalThis.crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function readLimitedText(response) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_UPSTREAM_BYTES) throw new PayloadTooLargeError();

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_UPSTREAM_BYTES) {
      throw new PayloadTooLargeError();
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_UPSTREAM_BYTES) {
        await reader.cancel();
        throw new PayloadTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchSubscription(subscriptionUrl) {
  let parsed;
  try {
    parsed = new URL(subscriptionUrl);
  } catch {
    throw new ConfigurationError();
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConfigurationError();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(parsed, {
      signal: controller.signal,
    });
    if (!response.ok)
      throw new UpstreamError("Subscription provider unavailable");
    return await readLimitedText(response);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) throw error;
    if (error instanceof ConfigurationError) throw error;
    if (error instanceof UpstreamError) throw error;
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw new UpstreamTimeoutError();
    }
    throw new UpstreamError("Subscription provider unavailable");
  } finally {
    clearTimeout(timer);
  }
}

async function buildConfigBody(publicUrl, subscriptionText, passwordFilter) {
  const nodes = extractNodes(subscriptionText, passwordFilter);
  if (nodes.length === 0) throw new UpstreamError("No supported nodes found");

  const rules = await decodeRules();
  const subscribeInfo = extractSubscribeInfo(subscriptionText);
  const sections = [
    `[General]\n${GENERAL_TEMPLATE}`,
    subscribeInfo
      ? `[Panel]\nSubscribeInfo = title=订阅信息, content=${subscribeInfo}, style=info`
      : null,
    `[Proxy]\n${buildProxySection(nodes)}`,
    buildWireGuardSections(nodes),
    buildGroups(nodes),
    `[Rule]\n${rules}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const managedConfigLine = buildManagedConfigLine(publicUrl);
  return managedConfigLine ? `${managedConfigLine}\n${sections}` : sections;
}

/**
 * @param {Request} request
 * @param {Record<string, string | undefined>} env
 */
export async function handleRequest(request, env = {}) {
  const requestUrl = new URL(request.url);
  if (request.method !== "GET") return textResponse("Not found.", 404);
  const route = readRoute(requestUrl);
  if (!route) return textResponse("Not found.", 404);

  const { accessToken, subscriptionUrl, passwordFilter } = getConfig(env);
  if (!accessToken) return textResponse("Service unavailable.", 503);
  if (!(await tokensMatch(route.token, accessToken)))
    return textResponse("Not found.", 404);
  if (!subscriptionUrl) return textResponse("Service unavailable.", 503);

  const publicUrl = new URL(requestUrl);
  publicUrl.pathname = route.publicPath;
  publicUrl.search = "";

  try {
    const subscriptionText = await fetchSubscription(subscriptionUrl);
    const body = await buildConfigBody(
      publicUrl,
      subscriptionText,
      passwordFilter,
    );
    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": 'attachment; filename="surfboard.conf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return textResponse("Service unavailable.", 503);
    }
    if (error instanceof UpstreamTimeoutError) {
      return textResponse("Subscription provider timeout.", 504);
    }
    if (error instanceof PayloadTooLargeError) {
      return textResponse("Subscription payload too large.", 502);
    }
    if (
      error instanceof UpstreamError &&
      error.message === "No supported nodes found"
    ) {
      return textResponse(
        "No Surfboard-supported nodes found in subscription.",
        502,
      );
    }
    return textResponse("Subscription provider unavailable.", 502);
  }
}
