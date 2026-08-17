/**
 * 订阅链接解析
 * 识别并解析 Surfboard 支持的所有代理协议链接
 *
 * Surfboard 支持的协议:
 *   hysteria2, ss, vmess, trojan, http, https, socks5, socks5-tls, snell, anytls,
 *   tuic-v5, wireguard
 * 不支持的协议 (跳过):
 *   vless
 */

// 协议 scheme → Surfboard 类型名
const SUPPORTED_PROTOCOLS = {
  hysteria2: "hysteria2",
  hy2: "hysteria2",
  ss: "ss",
  shadowsocks: "ss",
  vmess: "vmess",
  trojan: "trojan",
  "trojan-go": "trojan",
  http: "http",
  https: "https",
  socks5: "socks5",
  "socks5-tls": "socks5-tls",
  "socks-over-tls": "socks5-tls",
  snell: "snell",
  anytls: "anytls",
  tuic: "tuic",
  "tuic-v5": "tuic",
  wireguard: "wireguard",
};

/** 从 uri 片段安全解码 (处理 UTF-8 中文节点名) */
function safeDecode(s) {
  if (!s) return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** 解码标准或 URL-safe Base64 文本,失败返回 null。 */
function decodeBase64Text(value) {
  const compact = String(value)
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (
    !compact ||
    compact.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)
  ) {
    return null;
  }

  try {
    const binary = atob(compact.padEnd(Math.ceil(compact.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** 尝试 Base64 解码,失败返回 null。 */
function tryBase64(s) {
  try {
    const decoded = decodeBase64Text(s);
    if (decoded === null) return null;
    // 校验解码结果是可打印文本(排除误判)
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function hasUnsafeControl(value) {
  return typeof value === "string" && /[\x00-\x1f\x7f]/.test(value);
}

function isValidNode(node) {
  if (!node || typeof node !== "object") return false;
  if (
    typeof node.type !== "string" ||
    typeof node.name !== "string" ||
    typeof node.host !== "string" ||
    !node.name ||
    !node.host ||
    !Number.isInteger(node.port) ||
    node.port < 1 ||
    node.port > 65535
  ) {
    return false;
  }

  for (const value of Object.values(node)) {
    if (
      (typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean") ||
      hasUnsafeControl(value)
    ) {
      return false;
    }
  }

  switch (node.type) {
    case "hysteria2":
    case "trojan":
    case "anytls":
      return Boolean(node.password);
    case "ss":
      return Boolean(node.encryptMethod && node.password);
    case "vmess":
      return Boolean(node.uuid);
    case "snell":
      return Boolean(node.psk);
    case "tuic":
      return Boolean(node.uuid && node.password);
    case "wireguard":
      return Boolean(
        node.privateKey && node.selfIp && node.dnsServer && node.publicKey,
      );
    default:
      return true;
  }
}

/** 从链接中分离 fragment / query / authority */
function splitLink(link) {
  // 去掉 scheme
  const m = link.match(/^([a-z][a-z0-9-]*):\/\/(.*)$/i);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  let rest = m[2];

  // 分离 #fragment
  let fragment = "";
  let hashIdx = rest.indexOf("#");
  if (hashIdx >= 0) {
    fragment = rest.slice(hashIdx + 1);
    rest = rest.slice(0, hashIdx);
  }

  // 分离 ?query
  let query = "";
  let qIdx = rest.indexOf("?");
  if (qIdx >= 0) {
    query = rest.slice(qIdx + 1);
    rest = rest.slice(0, qIdx);
  }

  return { scheme, rest, query, fragment };
}

/** 解析 host[:port] (容忍尾部斜杠) */
function parsePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 0;
}

function parseHostPort(str) {
  const s = str.replace(/\/+$/, "");
  const m = s.match(/^\[([^\]]+)\]:(\d+)$/) || s.match(/^([^:\[\]]+):(\d+)$/);
  if (!m) return null;
  const port = parsePort(m[2]);
  if (!port) return null;
  return { host: m[1], port };
}

/**
 * 解析 hysteria2 链接
 * hysteria2://password@host:port/?params#name
 */
function parseHysteria2(link) {
  const parts = splitLink(link);
  if (!parts || (parts.scheme !== "hysteria2" && parts.scheme !== "hy2"))
    return null;

  const atIdx = parts.rest.lastIndexOf("@");
  if (atIdx < 0) return null;
  const password = safeDecode(parts.rest.slice(0, atIdx));
  const hp = parseHostPort(parts.rest.slice(atIdx + 1));
  if (!hp) return null;

  const params = new URLSearchParams(parts.query);
  return {
    type: "hysteria2",
    name: safeDecode(parts.fragment) || `${hp.host}:${hp.port}`,
    host: hp.host,
    port: hp.port,
    password,
    sni: params.get("sni") || "",
    pinSHA256:
      params.get("pinSHA256") ||
      params.get("server-cert-fingerprint-sha256") ||
      "",
    mport: params.get("mport") || "",
    portHoppingInterval: params.get("port-hopping-interval") || "",
    downloadBandwidth: params.get("download-bandwidth") || "",
    salamanderPassword: params.get("salamander-password") || "",
    skipCert:
      params.get("skip-cert-verify") === "true" ||
      params.get("insecure") === "1" ||
      params.get("insecure") === "true",
  };
}

/**
 * 解析 ss 链接 (SIP002)
 * ss://BASE64(method:password)@host:port#name
 * ss://BASE64(method:password@host:port)#name
 * ss://method:password@host:port#name
 */
function parseSS(link) {
  const parts = splitLink(link);
  if (!parts || (parts.scheme !== "ss" && parts.scheme !== "shadowsocks"))
    return null;

  const params = new URLSearchParams(parts.query);
  const plugin = parseSSPlugin(params.get("plugin") || "");
  if (plugin === null) return null;
  let method = "";
  let password = "";
  let host = "";
  let port = 0;

  const atIdx = parts.rest.lastIndexOf("@");
  if (atIdx >= 0) {
    // userinfo@host:port 形式
    const userinfo = parts.rest.slice(0, atIdx);
    const hp = parseHostPort(parts.rest.slice(atIdx + 1));
    if (!hp) return null;
    host = hp.host;
    port = hp.port;
    const info = tryBase64(userinfo) || userinfo;
    const colon = info.indexOf(":");
    if (colon >= 0) {
      method = info.slice(0, colon);
      password = safeDecode(info.slice(colon + 1));
    } else {
      method = info;
    }
  } else {
    // 整个 authority 是 base64(method:password@host:port)
    const info = tryBase64(parts.rest);
    if (!info) return null;
    const at2 = info.lastIndexOf("@");
    if (at2 < 0) return null;
    const hp = parseHostPort(info.slice(at2 + 1));
    if (!hp) return null;
    host = hp.host;
    port = hp.port;
    const colon = info.indexOf(":");
    if (colon >= 0) {
      method = info.slice(0, colon);
      password = safeDecode(info.slice(colon + 1, at2));
    }
  }

  if (!host || !port) return null;

  return {
    type: "ss",
    name: safeDecode(parts.fragment) || `${host}:${port}`,
    host,
    port,
    password,
    encryptMethod:
      params.get("encrypt-method") || params.get("method") || method,
    obfs: params.get("obfs") || plugin.obfs,
    obfsHost:
      params.get("obfs-host") || params.get("{obfs-host}") || plugin.obfsHost,
    obfsUri:
      params.get("obfs-uri") || params.get("{obfs-uri}") || plugin.obfsUri,
  };
}

/**
 * 将 SIP002 plugin 参数映射为 Surfboard 的 simple-obfs 字段。
 * Surfboard 没有通用 plugin= 字段，未知插件不能安全生成代理行。
 */
function parseSSPlugin(raw) {
  if (!raw) return { obfs: "", obfsHost: "", obfsUri: "" };
  const parts = safeDecode(raw).split(";");
  const pluginName = (parts.shift() || "").toLowerCase();
  if (!["obfs-local", "simple-obfs", "obfs"].includes(pluginName)) return null;

  const options = {};
  for (const item of parts) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    const key = item.slice(0, separator).toLowerCase();
    options[key] = safeDecode(item.slice(separator + 1));
  }
  return {
    obfs: options.obfs || "",
    obfsHost: options["obfs-host"] || options.host || "",
    obfsUri: options["obfs-uri"] || options.uri || "",
  };
}

/**
 * 解析 vmess 链接
 * vmess://BASE64(JSON)
 * vmess://uuid@host:port?params#name
 */
function parseVMess(link) {
  const parts = splitLink(link);
  if (!parts || parts.scheme !== "vmess") return null;

  let uuid = "";
  let host = "";
  let port = 0;
  let name = safeDecode(parts.fragment) || "";
  let ws = false;
  let wsPath = "";
  let wsHost = "";
  let tls = false;
  let sni = "";
  let skipCert = false;
  let aead = true;

  const atIdx = parts.rest.lastIndexOf("@");
  if (atIdx >= 0) {
    // 参数形式: uuid@host:port
    uuid = safeDecode(parts.rest.slice(0, atIdx));
    const hp = parseHostPort(parts.rest.slice(atIdx + 1));
    if (!hp) return null;
    host = hp.host;
    port = hp.port;
    const params = new URLSearchParams(parts.query);
    ws = params.get("ws") === "true" || params.get("type") === "ws";
    wsPath = params.get("ws-path") || params.get("path") || "";
    wsHost = params.get("ws-host") || params.get("host") || "";
    tls = params.get("tls") === "true" || params.get("security") === "tls";
    sni = params.get("sni") || "";
    skipCert = ["1", "true"].includes(params.get("skip-cert-verify"));
    aead = params.get("vmess-aead") !== "false";
  } else {
    // base64 JSON 形式
    const json = tryBase64(parts.rest);
    if (!json) return null;
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      return null;
    }
    host = data.add || "";
    port = parsePort(data.port);
    uuid = data.id || "";
    name = safeDecode(data.ps) || safeDecode(parts.fragment) || "";
    ws = data.net === "ws";
    wsPath = data.path || "";
    wsHost = data.host || "";
    tls = data.tls === "tls" || data.security === "tls";
    sni = data.sni || "";
    // vmess 默认 aead=true
    aead = true;
  }

  if (!host || !port) return null;

  return {
    type: "vmess",
    name: name || `${host}:${port}`,
    host,
    port,
    uuid,
    ws,
    wsPath,
    wsHost,
    tls,
    sni,
    pinSHA256: "",
    skipCert,
    aead,
  };
}

/**
 * 解析 trojan 链接
 * trojan://password@host:port?params#name
 */
function parseTrojan(link) {
  const parts = splitLink(link);
  if (!parts || (parts.scheme !== "trojan" && parts.scheme !== "trojan-go"))
    return null;

  const atIdx = parts.rest.lastIndexOf("@");
  if (atIdx < 0) return null;
  const password = safeDecode(parts.rest.slice(0, atIdx));
  const hp = parseHostPort(parts.rest.slice(atIdx + 1));
  if (!hp) return null;

  const params = new URLSearchParams(parts.query);
  return {
    type: "trojan",
    name: safeDecode(parts.fragment) || `${hp.host}:${hp.port}`,
    host: hp.host,
    port: hp.port,
    password,
    sni: params.get("sni") || "",
    pinSHA256:
      params.get("pinSHA256") ||
      params.get("server-cert-fingerprint-sha256") ||
      "",
    ws: params.get("ws") === "true" || params.get("type") === "ws",
    wsPath: params.get("ws-path") || params.get("path") || "",
    wsHost: params.get("ws-host") || params.get("host") || "",
    skipCert:
      ["1", "true"].includes(params.get("allowInsecure")) ||
      ["1", "true"].includes(params.get("skip-cert-verify")),
  };
}

/** 解析 http/https/socks5/socks5-tls 链接 */
function parseSimple(link) {
  const parts = splitLink(link);
  if (!parts) return null;
  const type = SUPPORTED_PROTOCOLS[parts.scheme];
  if (!type) return null;

  const atIdx = parts.rest.lastIndexOf("@");
  let username = "";
  let password = "";
  let hostPortStr = parts.rest;
  if (atIdx >= 0) {
    const userinfo = parts.rest.slice(0, atIdx);
    const colon = userinfo.indexOf(":");
    if (colon >= 0) {
      username = safeDecode(userinfo.slice(0, colon));
      password = safeDecode(userinfo.slice(colon + 1));
    } else {
      username = safeDecode(userinfo);
    }
    hostPortStr = parts.rest.slice(atIdx + 1);
  }
  const hp = parseHostPort(hostPortStr);
  if (!hp) return null;

  const params = new URLSearchParams(parts.query);
  const isTLS = type === "https" || type === "socks5-tls";
  return {
    type,
    name: safeDecode(parts.fragment) || `${hp.host}:${hp.port}`,
    host: hp.host,
    port: hp.port,
    username,
    password,
    sni: params.get("sni") || "",
    pinSHA256:
      params.get("pinSHA256") ||
      params.get("server-cert-fingerprint-sha256") ||
      "",
    skipCert:
      ["1", "true"].includes(params.get("skip-cert-verify")) ||
      (isTLS && ["1", "true"].includes(params.get("insecure"))),
  };
}

/**
 * 解析 snell 链接
 * snell://psk@host:port?params#name
 */
function parseSnell(link) {
  const parts = splitLink(link);
  if (!parts || parts.scheme !== "snell") return null;

  const atIdx = parts.rest.lastIndexOf("@");
  if (atIdx < 0) return null;
  const psk = safeDecode(parts.rest.slice(0, atIdx));
  const hp = parseHostPort(parts.rest.slice(atIdx + 1));
  if (!hp) return null;

  const params = new URLSearchParams(parts.query);
  return {
    type: "snell",
    name: safeDecode(parts.fragment) || `${hp.host}:${hp.port}`,
    host: hp.host,
    port: hp.port,
    psk,
    version: params.get("version") || "",
    obfs: params.get("obfs") || "",
    obfsHost: params.get("obfs-host") || "",
    obfsUri: params.get("obfs-uri") || "",
  };
}

/**
 * 解析 anytls 链接
 * anytls://password@host:port?params#name
 */
function parseAnyTLS(link) {
  const parts = splitLink(link);
  if (!parts || parts.scheme !== "anytls") return null;

  const atIdx = parts.rest.lastIndexOf("@");
  if (atIdx < 0) return null;
  const password = safeDecode(parts.rest.slice(0, atIdx));
  const hp = parseHostPort(parts.rest.slice(atIdx + 1));
  if (!hp) return null;

  const params = new URLSearchParams(parts.query);
  return {
    type: "anytls",
    name: safeDecode(parts.fragment) || `${hp.host}:${hp.port}`,
    host: hp.host,
    port: hp.port,
    password,
    sni: params.get("sni") || "",
    pinSHA256:
      params.get("pinSHA256") ||
      params.get("server-cert-fingerprint-sha256") ||
      "",
    skipCert:
      ["1", "true"].includes(params.get("skip-cert-verify")) ||
      ["1", "true"].includes(params.get("insecure")),
    reuse: params.get("reuse") === "true",
  };
}

/** 解析 TUIC v5 URI: tuic://uuid:password@host:port?params#name */
function parseTUIC(link) {
  const parts = splitLink(link);
  if (!parts || (parts.scheme !== "tuic" && parts.scheme !== "tuic-v5"))
    return null;

  const atIdx = parts.rest.lastIndexOf("@");
  if (atIdx < 0) return null;
  const userinfo = safeDecode(parts.rest.slice(0, atIdx));
  const hp = parseHostPort(parts.rest.slice(atIdx + 1));
  if (!hp) return null;

  const params = new URLSearchParams(parts.query);
  const colon = userinfo.indexOf(":");
  const uuid =
    params.get("uuid") || (colon >= 0 ? userinfo.slice(0, colon) : userinfo);
  const password =
    params.get("password") || (colon >= 0 ? userinfo.slice(colon + 1) : "");
  if (!uuid || !password) return null;

  return {
    type: "tuic",
    name: safeDecode(parts.fragment) || `${hp.host}:${hp.port}`,
    host: hp.host,
    port: hp.port,
    uuid,
    password,
    alpn: params.get("alpn") || "",
    portHopping: params.get("port-hopping") || params.get("mport") || "",
    portHoppingInterval: params.get("port-hopping-interval") || "",
    sni: params.get("sni") || "",
    pinSHA256:
      params.get("pinSHA256") ||
      params.get("server-cert-fingerprint-sha256") ||
      "",
    skipCert:
      ["1", "true"].includes(params.get("skip-cert-verify")) ||
      ["1", "true"].includes(params.get("insecure")),
    udpRelay: params.get("udp-relay") !== "false",
  };
}

/**
 * 解析 WireGuard URI。首版约定：wireguard://private-key@endpoint:port?query#name。
 * 查询参数支持 private-key、public-key、address/self-ip、dns/dns-server、allowed-ips、mtu、keepalive。
 */
function parseWireGuard(link) {
  const parts = splitLink(link);
  if (!parts || parts.scheme !== "wireguard") return null;

  const atIdx = parts.rest.lastIndexOf("@");
  const privateKey = atIdx >= 0 ? safeDecode(parts.rest.slice(0, atIdx)) : "";
  const endpoint = atIdx >= 0 ? parts.rest.slice(atIdx + 1) : parts.rest;
  const hp = parseHostPort(endpoint);
  if (!hp) return null;

  // URLSearchParams treats "+" as a space, but WireGuard Base64 keys may
  // contain literal plus signs even in subscriptions that did not encode them.
  const params = new URLSearchParams(parts.query.replace(/\+/g, "%2B"));
  const value = (...keys) => {
    for (const key of keys) {
      const item = params.get(key);
      if (item) return item;
    }
    return "";
  };
  const node = {
    type: "wireguard",
    name: safeDecode(parts.fragment) || `${hp.host}:${hp.port}`,
    host: hp.host,
    port: hp.port,
    privateKey: privateKey || value("private-key", "private_key"),
    selfIp: value("self-ip", "self_ip", "address"),
    selfIpV6: value("self-ip-v6", "self_ip_v6", "address-v6"),
    dnsServer: value("dns-server", "dns", "dns-server-ip"),
    mtu: value("mtu"),
    publicKey: value("public-key", "public_key", "peer-public-key"),
    allowedIps: value("allowed-ips", "allowed_ips") || "0.0.0.0/0, ::/0",
    keepalive: value("keepalive", "persistent-keepalive"),
  };
  if (!node.privateKey || !node.selfIp || !node.dnsServer || !node.publicKey)
    return null;
  return node;
}

/**
 * 解析任意代理链接为通用 node 对象
 * @param {string} link - 完整代理链接
 * @returns {object|null} { type, name, host, port, ... }
 */
export function parseNode(link) {
  if (typeof link !== "string") return null;
  const m = link.match(/^([a-z][a-z0-9-]*):\/\//i);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  if (!SUPPORTED_PROTOCOLS[scheme]) return null;

  let node;
  switch (SUPPORTED_PROTOCOLS[scheme]) {
    case "hysteria2":
      node = parseHysteria2(link);
      break;
    case "ss":
      node = parseSS(link);
      break;
    case "vmess":
      node = parseVMess(link);
      break;
    case "trojan":
      node = parseTrojan(link);
      break;
    case "snell":
      node = parseSnell(link);
      break;
    case "anytls":
      node = parseAnyTLS(link);
      break;
    case "tuic":
      node = parseTUIC(link);
      break;
    case "wireguard":
      node = parseWireGuard(link);
      break;
    default:
      node = parseSimple(link);
  }
  return isValidNode(node) ? node : null;
}

/**
 * 从订阅文本中提取所有 Surfboard 支持的节点
 * @param {string} text - 原始订阅文本 (base64 或明文)
 * @param {string} [passwordFilter] - 可选,只保留此密码的节点
 * @returns {object[]}
 */
export function extractNodes(text, passwordFilter) {
  const decoded = decodeBase64Text(text) || text;

  const lines = decoded.split(/\r?\n/);
  const nodes = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const node = parseNode(t);
    if (!node) continue;
    if (passwordFilter && node.password !== passwordFilter) continue;
    nodes.push(node);
  }
  return nodes;
}

/**
 * 从订阅文本中提取订阅信息 (如剩余流量、到期时间等)
 * 这些信息以非 hysteria2 节点的 #名字 形式出现
 * @param {string} text - 原始订阅文本 (base64 或明文)
 * @returns {string} - 信息内容,如 "剩余流量:975.26 GB\n套餐到期:长期有效"
 */
function extractSubscribeInfoItems(text) {
  const decoded = decodeBase64Text(text) || text;

  const lines = decoded.split(/\r?\n/);
  const infoItems = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // 跳过 Surfboard 支持的协议节点 (它们的 #名字 是真实节点名,不是订阅信息)
    const schemeMatch = t.match(/^([a-z][a-z0-9-]*):\/\//i);
    if (schemeMatch && SUPPORTED_PROTOCOLS[schemeMatch[1].toLowerCase()])
      continue;

    const hashIdx = t.indexOf("#");
    if (hashIdx < 0) continue;

    const name = t.slice(hashIdx + 1);
    if (!name) continue;

    const decodedName = safeDecode(name)
      .replace(/[\x00-\x1f\x7f]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/,/g, "，")
      .trim();

    // 提取信息标签: 剩余流量、上传流量、下载流量、套餐流量、套餐到期、到期时间
    if (
      decodedName.startsWith("剩余流量") ||
      decodedName.startsWith("上传流量") ||
      decodedName.startsWith("下载流量") ||
      decodedName.startsWith("套餐流量") ||
      decodedName.startsWith("套餐到期") ||
      decodedName.startsWith("到期时间")
    ) {
      const normalized = decodedName.replace(/：/g, ":");
      infoItems.push(normalized);
    }
  }

  // 去重
  const seen = new Set();
  const unique = [];
  for (const item of infoItems) {
    if (!seen.has(item)) {
      seen.add(item);
      unique.push(item);
    }
  }

  return unique;
}

export function extractSubscribeInfo(text) {
  return extractSubscribeInfoItems(text).join("\\n");
}

/**
 * 从订阅信息节点中提取剩余流量并换算为 bytes。
 * @param {string} text - 原始订阅文本 (base64 或明文)
 * @returns {string|null} - 十进制 bytes 字符串
 */
export function extractRemainingTrafficBytes(text) {
  const units = {
    b: 1n,
    kb: 1024n,
    mb: 1024n ** 2n,
    gb: 1024n ** 3n,
    tb: 1024n ** 4n,
    pb: 1024n ** 5n,
  };

  for (const item of extractSubscribeInfoItems(text)) {
    const match = item.match(
      /^剩余流量\s*:\s*(\d{1,12})(?:\.(\d{1,6}))?\s*(B|KB|MB|GB|TB|PB)\b/i,
    );
    if (!match) continue;

    const fraction = match[2] || "";
    const divisor = 10n ** BigInt(fraction.length);
    const scaledValue = BigInt(`${match[1]}${fraction}`);
    const bytes = (
      (scaledValue * units[match[3].toLowerCase()]) /
      divisor
    ).toString();
    if (bytes.length <= 20) return bytes;
  }

  return null;
}
