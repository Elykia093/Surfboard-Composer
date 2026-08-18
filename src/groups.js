/**
 * 代理组构建
 * Proxies 顺序:Auto、Fallback、地区组、Traffic 虚拟组、节点。
 * 地区顺序固定 HK, SG, JP, KR, TW, UK, US。
 */
import { buildUniqueNodeNames, sanitizeNodeName } from "./names.js";

// 地区分组顺序
export const REGION_ORDER = ["HK", "SG", "JP", "KR", "TW", "UK", "US"];
const HEALTH_CHECK_URL = "http://www.gstatic.com/generate_204";
const HEALTH_CHECK_INTERVAL = 600;

// 服务分组 (不带 DIRECT)
const STREAMING_GROUPS = [
  "YouTube",
  "Disney",
  "Hbomax",
  "Netflix",
  "Telegram",
  "Google",
  "OpenAI",
];

// 服务分组 (带 DIRECT 兜底)
const DIRECT_GROUPS = ["Spotify", "Steam", "Microsoft", "PayPal", "Apple"];

/**
 * 根据节点名判断地区
 * @param {string} name
 * @returns {string}
 */
export function regionOf(name) {
  if (name.includes("香港")) return "HK";
  if (name.includes("新加坡")) return "SG";
  if (name.includes("日本")) return "JP";
  if (name.includes("韩国")) return "KR";
  if (name.includes("台湾")) return "TW";
  if (name.includes("伦敦") || name.includes("英国")) return "UK";
  return "US";
}

/**
 * 按地区分组
 * @param {object[]} nodes
 * @returns {{ region: string, names: string[] }[]} 按 REGION_ORDER 排序,未识别的追加
 */
export function groupByRegion(
  nodes,
  resolvedNames = nodes.map((node) => node.name),
) {
  const byRegion = {};
  for (const [index, node] of nodes.entries()) {
    const r = regionOf(node.name);
    if (!byRegion[r]) byRegion[r] = [];
    byRegion[r].push(resolvedNames[index]);
  }

  const known = REGION_ORDER.filter((r) => byRegion[r]);
  const unknown = Object.keys(byRegion).filter(
    (r) => !REGION_ORDER.includes(r),
  );
  return known.concat(unknown).map((r) => ({ region: r, names: byRegion[r] }));
}

function sanitizeTrafficLabel(value) {
  if (typeof value !== "string") return null;
  const label = value.trim();
  return /^Traffic: \d{1,12}(?:\.\d{1,6})? (?:B|KB|MB|GB|TB|PB)$/.test(label)
    ? label
    : null;
}

/**
 * 生成 [Proxy Group] 节
 * @param {object[]} nodes
 * @param {string|null} [trafficLabel]
 * @returns {string}
 */
export function buildGroups(nodes, trafficLabel = null) {
  const names = buildUniqueNodeNames(nodes);
  const groups = groupByRegion(nodes, names);
  const regionList = groups.map((g) => g.region).join(",");
  const safeTrafficLabel = sanitizeTrafficLabel(trafficLabel);
  const nodeList = names.join(",");

  const lines = ["[Proxy Group]", ""];
  // Proxies: 自动/故障转移组在前,地区组随后,Traffic 紧随 US,节点在后
  const proxyEntries = [
    "Auto",
    "Fallback",
    regionList,
    safeTrafficLabel,
    nodeList,
  ]
    .filter(Boolean)
    .join(",");
  lines.push(`Proxies = select,${proxyEntries}`);
  lines.push(
    `Auto = url-test,${nodeList},url=${HEALTH_CHECK_URL},interval=${HEALTH_CHECK_INTERVAL}`,
  );
  lines.push(
    `Fallback = fallback,${nodeList},url=${HEALTH_CHECK_URL},interval=${HEALTH_CHECK_INTERVAL}`,
  );
  if (safeTrafficLabel) {
    lines.push(`${safeTrafficLabel} = select,Auto`);
  }

  // 服务分组
  for (const g of STREAMING_GROUPS) {
    lines.push(`${g} = select,Proxies,${regionList}`);
  }
  for (const g of DIRECT_GROUPS) {
    lines.push(`${g} = select,Proxies,DIRECT,${regionList}`);
  }
  const preferredRegions = ["HK", "TW"].filter((region) =>
    groups.some((group) => group.region === region),
  );
  const preferredSuffix = preferredRegions.length
    ? `,${preferredRegions.join(",")}`
    : "";
  lines.push(`Bahamut = select,Proxies${preferredSuffix}`);
  lines.push(`Bilibili = select,DIRECT${preferredSuffix}`);
  lines.push("Final = select,Proxies,DIRECT");

  // 地区分组
  for (const g of groups) {
    lines.push(
      `${g.region} = select,${g.names.map((name) => sanitizeNodeName(name)).join(",")}`,
    );
  }

  return lines.join("\n");
}
