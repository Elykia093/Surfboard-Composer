/**
 * 节点 → Surfboard [Proxy] 行转换
 * 按协议生成对应格式 (参考 Surfboard 官方文档)
 */
import { buildUniqueNodeNames, sanitizeNodeName } from "./names.js";

/**
 * @param {object} node - 解析后的节点对象
 * @returns {string} - Surfboard 代理行
 */
export function toSurfboardProxy(node) {
  switch (node.type) {
    case "hysteria2":
      return formatHysteria2(node);
    case "ss":
      return formatSS(node);
    case "vmess":
      return formatVMess(node);
    case "trojan":
      return formatTrojan(node);
    case "http":
    case "https":
      return formatHTTP(node);
    case "socks5":
    case "socks5-tls":
      return formatSOCKS5(node);
    case "snell":
      return formatSnell(node);
    case "anytls":
      return formatAnyTLS(node);
    case "tuic":
      return formatTUIC(node);
    case "wireguard":
      return formatWireGuard(node);
    default:
      return null;
  }
}

function formatName(node) {
  return sanitizeNodeName(node.name, `${node.host}:${node.port}`);
}

function formatHysteria2(node) {
  const fields = [
    "hysteria2",
    node.host,
    node.port,
    `password=${node.password}`,
  ];
  if (node.mport) {
    fields.push(`port-hopping="${node.mport}"`);
  }
  if (node.portHoppingInterval)
    fields.push(`port-hopping-interval=${node.portHoppingInterval}`);
  if (node.downloadBandwidth)
    fields.push(`download-bandwidth=${node.downloadBandwidth}`);
  if (node.salamanderPassword)
    fields.push(`salamander-password=${node.salamanderPassword}`);
  fields.push(`skip-cert-verify=${node.skipCert ? "true" : "false"}`);
  if (node.sni) fields.push(`sni=${node.sni}`);
  if (node.pinSHA256)
    fields.push(`server-cert-fingerprint-sha256=${node.pinSHA256}`);
  fields.push("udp-relay=true");
  return `${formatName(node)} = ${fields.join(", ")}`;
}

function formatSS(node) {
  const fields = ["ss", node.host, node.port];
  if (node.encryptMethod) fields.push(`encrypt-method=${node.encryptMethod}`);
  fields.push(`password=${node.password}`);
  if (node.obfs) fields.push(`obfs=${node.obfs}`);
  if (node.obfsHost) fields.push(`obfs-host=${node.obfsHost}`);
  if (node.obfsUri) fields.push(`obfs-uri=${node.obfsUri}`);
  fields.push("udp-relay=true");
  return `${formatName(node)} = ${fields.join(", ")}`;
}

function formatVMess(node) {
  const fields = ["vmess", node.host, node.port];
  fields.push(`username=${node.uuid || ""}`);
  if (node.ws) fields.push("ws=true");
  if (node.wsPath && node.wsPath !== "/") fields.push(`ws-path=${node.wsPath}`);
  if (node.wsHost) fields.push(`ws-headers=Host:${node.wsHost}`);
  if (node.wsHeaders) fields.push(`ws-headers=${node.wsHeaders}`);
  if (node.tls) fields.push("tls=true");
  if (node.sni) fields.push(`sni=${node.sni}`);
  if (node.pinSHA256)
    fields.push(`server-cert-fingerprint-sha256=${node.pinSHA256}`);
  if (node.aead) fields.push("vmess-aead=true");
  if (node.skipCert) fields.push("skip-cert-verify=true");
  fields.push("udp-relay=true");
  return `${formatName(node)} = ${fields.join(", ")}`;
}

function formatTrojan(node) {
  const fields = ["trojan", node.host, node.port, `password=${node.password}`];
  if (node.ws) fields.push("ws=true");
  if (node.wsPath && node.wsPath !== "/") fields.push(`ws-path=${node.wsPath}`);
  if (node.wsHost) fields.push(`ws-headers=Host:${node.wsHost}`);
  if (node.sni) fields.push(`sni=${node.sni}`);
  if (node.pinSHA256)
    fields.push(`server-cert-fingerprint-sha256=${node.pinSHA256}`);
  if (node.skipCert) fields.push("skip-cert-verify=true");
  fields.push("udp-relay=true");
  return `${formatName(node)} = ${fields.join(", ")}`;
}

function formatHTTP(node) {
  const fields = [node.type, node.host, node.port];
  if (node.username) fields.push(node.username);
  if (node.password) fields.push(node.password);
  if (node.type === "https") {
    if (node.sni) fields.push(`sni=${node.sni}`);
    if (node.pinSHA256)
      fields.push(`server-cert-fingerprint-sha256=${node.pinSHA256}`);
    if (node.skipCert) fields.push("skip-cert-verify=true");
  }
  return `${formatName(node)} = ${fields.join(", ")}`;
}

function formatSOCKS5(node) {
  const fields = [node.type, node.host, node.port];
  if (node.username) fields.push(node.username);
  if (node.password) fields.push(node.password);
  if (node.type === "socks5-tls") {
    if (node.sni) fields.push(`sni=${node.sni}`);
    if (node.pinSHA256)
      fields.push(`server-cert-fingerprint-sha256=${node.pinSHA256}`);
    if (node.skipCert) fields.push("skip-cert-verify=true");
  }
  return `${formatName(node)} = ${fields.join(", ")}`;
}

function formatSnell(node) {
  const fields = ["snell", node.host, node.port];
  if (node.psk) fields.push(`psk=${node.psk}`);
  if (node.version) fields.push(`version=${node.version}`);
  if (node.obfs) fields.push(`obfs=${node.obfs}`);
  if (node.obfsHost) fields.push(`obfs-host=${node.obfsHost}`);
  if (node.obfsUri) fields.push(`obfs-uri=${node.obfsUri}`);
  fields.push("udp-relay=true");
  return `${formatName(node)} = ${fields.join(", ")}`;
}

function formatAnyTLS(node) {
  const fields = ["anytls", node.host, node.port];
  if (node.password) fields.push(node.password);
  if (node.sni) fields.push(`sni=${node.sni}`);
  if (node.pinSHA256)
    fields.push(`server-cert-fingerprint-sha256=${node.pinSHA256}`);
  if (node.skipCert) fields.push("skip-cert-verify=true");
  if (node.reuse) fields.push("reuse=true");
  return `${formatName(node)} = ${fields.join(", ")}`;
}

function formatTUIC(node) {
  const fields = [
    "tuic-v5",
    node.host,
    node.port,
    `uuid=${node.uuid}`,
    `password=${node.password}`,
  ];
  if (node.alpn) fields.push(`alpn=${node.alpn}`);
  if (node.portHopping) fields.push(`port-hopping="${node.portHopping}"`);
  if (node.portHoppingInterval)
    fields.push(`port-hopping-interval=${node.portHoppingInterval}`);
  fields.push(`skip-cert-verify=${node.skipCert ? "true" : "false"}`);
  if (node.sni) fields.push(`sni=${node.sni}`);
  if (node.pinSHA256)
    fields.push(`server-cert-fingerprint-sha256=${node.pinSHA256}`);
  fields.push(`udp-relay=${node.udpRelay ? "true" : "false"}`);
  return `${formatName(node)} = ${fields.join(", ")}`;
}

function formatWireGuard(node) {
  const sectionName = sanitizeNodeName(node.name, `${node.host}:${node.port}`);
  return `${sectionName} = wireguard, section-name = ${sectionName}`;
}

/**
 * 生成 [Proxy] 节全部内容
 * @param {object[]} nodes
 * @param {string|null} [directProxyName] - 额外的直连代理名称
 * @returns {string}
 */
export function buildProxySection(nodes, directProxyName = null) {
  const lines = ["DIRECT = direct"];
  if (directProxyName) {
    lines.push(`${sanitizeNodeName(directProxyName)} = direct`);
  }
  const names = buildUniqueNodeNames(nodes);
  for (const [index, node] of nodes.entries()) {
    const line = toSurfboardProxy({ ...node, name: names[index] });
    if (line) lines.push(line);
  }
  return lines.join("\n");
}

/** 生成 WireGuard 原生配置段，供 [Proxy] 中的 section-name 引用。 */
export function buildWireGuardSections(nodes) {
  const names = buildUniqueNodeNames(nodes);
  return nodes
    .map((node, index) => ({ node, name: names[index] }))
    .filter(({ node }) => node.type === "wireguard")
    .map(({ node, name: sectionName }) => {
      const endpointHost = node.host.includes(":")
        ? `[${node.host}]`
        : node.host;
      const fields = [
        `[WireGuard ${sectionName}]`,
        `private-key = ${node.privateKey}`,
        `self-ip = ${node.selfIp}`,
        node.selfIpV6 ? `self-ip-v6 = ${node.selfIpV6}` : null,
        `dns-server = ${node.dnsServer}`,
        `mtu = ${node.mtu || 1280}`,
        `peer = (public-key = ${node.publicKey}, allowed-ips = "${node.allowedIps}", endpoint = ${endpointHost}:${node.port}${node.keepalive ? `, keepalive = ${node.keepalive}` : ""})`,
      ].filter(Boolean);
      return fields.join("\n");
    })
    .join("\n\n");
}
