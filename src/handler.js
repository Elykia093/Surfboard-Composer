/**
 * Shared Fetch handler for Cloudflare Workers and Vercel Edge.
 */
import { buildManagedConfigLine, getConfig } from "./config.js";
import { GENERAL_TEMPLATE } from "./general.js";
import {
  extractNodes,
  extractRemainingTrafficBytes,
  extractRemainingTrafficLabel,
  extractSubscribeInfo,
} from "./parser.js";
import { buildProxySection, buildWireGuardSections } from "./transform.js";
import { buildGroups } from "./groups.js";
import { decodeRules } from "./rules.js";

const UPSTREAM_TIMEOUT_MS = 15_000;
const MAX_UPSTREAM_BYTES = 5 * 1024 * 1024;
const MAX_UPSTREAM_HEADER_LENGTH = 1024;
const DEFAULT_PROFILE_FILENAME = "Surfboard.conf";
const SUBSCRIPTION_USERINFO_KEYS = ["upload", "download", "total", "expire"];

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

function sanitizeSubscriptionUserinfo(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_UPSTREAM_HEADER_LENGTH ||
    /[\r\n]/.test(value)
  ) {
    return null;
  }

  const fields = new Map();
  for (const part of value.split(";")) {
    const field = part.trim();
    if (!field) continue;

    const match = field.match(/^([a-z][a-z0-9_-]*)\s*=\s*([^\s;]+)$/i);
    if (!match) return null;

    const key = match[1].toLowerCase();
    if (!SUBSCRIPTION_USERINFO_KEYS.includes(key)) continue;
    if (!/^\d{1,20}$/.test(match[2]) || fields.has(key)) return null;
    fields.set(key, match[2]);
  }

  const normalized = SUBSCRIPTION_USERINFO_KEYS.filter((key) => fields.has(key))
    .map((key) => `${key}=${fields.get(key)}`)
    .join("; ");
  return normalized || null;
}

function buildSubscriptionUserinfo(subscription) {
  if (subscription.subscriptionUserinfo) {
    return subscription.subscriptionUserinfo;
  }

  const remainingBytes = extractRemainingTrafficBytes(subscription.text);
  return remainingBytes
    ? `upload=0; download=0; total=${remainingBytes}; expire=0`
    : null;
}

function unwrapDispositionValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return trimmed;
}

function sanitizeProfileFilename(value) {
  if (typeof value !== "string") return null;

  const filename = value.normalize("NFC").trim();
  if (
    !filename ||
    filename === "." ||
    filename === ".." ||
    /[\u0000-\u001f\u007f-\u009f/\\<>:"|?*]/.test(filename) ||
    new TextEncoder().encode(filename).byteLength > 180
  ) {
    return null;
  }
  return filename;
}

function extractProfileFilename(contentDisposition) {
  if (
    typeof contentDisposition !== "string" ||
    contentDisposition.length === 0 ||
    contentDisposition.length > MAX_UPSTREAM_HEADER_LENGTH ||
    /[\r\n]/.test(contentDisposition)
  ) {
    return null;
  }

  const extended = contentDisposition.match(
    /(?:^|;)\s*filename\*\s*=\s*("(?:\\.|[^"])*"|[^;]*)/i,
  );
  if (extended) {
    const value = unwrapDispositionValue(extended[1]);
    const encoded = value.match(/^utf-8'[^']*'(.*)$/i);
    if (encoded) {
      try {
        const filename = sanitizeProfileFilename(
          decodeURIComponent(encoded[1]),
        );
        if (filename) return filename;
      } catch {
        // Fall through to the basic filename parameter.
      }
    }
  }

  const basic = contentDisposition.match(
    /(?:^|;)\s*filename\s*=\s*("(?:\\.|[^"])*"|[^;]*)/i,
  );
  if (!basic) return null;

  let value = unwrapDispositionValue(basic[1]);
  if (/%[0-9a-f]{2}/i.test(value)) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return sanitizeProfileFilename(value);
}

function encodeDispositionFilename(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function buildContentDisposition(filename) {
  if (!filename) return `attachment; filename="${DEFAULT_PROFILE_FILENAME}"`;

  const fallback = /^[\x20-\x7e]+$/.test(filename)
    ? filename
    : DEFAULT_PROFILE_FILENAME;
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeDispositionFilename(filename)}`;
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
    return {
      text: await readLimitedText(response),
      subscriptionUserinfo: sanitizeSubscriptionUserinfo(
        response.headers.get("subscription-userinfo"),
      ),
      filename: extractProfileFilename(
        response.headers.get("content-disposition"),
      ),
    };
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
  const trafficLabel = extractRemainingTrafficLabel(subscriptionText);
  const sections = [
    `[General]\n${GENERAL_TEMPLATE}`,
    subscribeInfo
      ? `[Panel]\nSubscribeInfo = title=订阅信息, content=${subscribeInfo}, style=info`
      : null,
    `[Proxy]\n${buildProxySection(nodes)}`,
    buildWireGuardSections(nodes),
    buildGroups(nodes, trafficLabel),
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
    const subscription = await fetchSubscription(subscriptionUrl);
    const body = await buildConfigBody(
      publicUrl,
      subscription.text,
      passwordFilter,
    );
    const headers = {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": buildContentDisposition(subscription.filename),
      "Cache-Control": "no-store",
    };
    const subscriptionUserinfo = buildSubscriptionUserinfo(subscription);
    if (subscriptionUserinfo) {
      headers["Subscription-Userinfo"] = subscriptionUserinfo;
    }
    return new Response(body, {
      headers,
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
