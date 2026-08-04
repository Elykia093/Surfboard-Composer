/**
 * 代理组构建
 * Proxies 顺序:地区组在前,节点在后。地区顺序固定 HK, SG, JP, KR, TW, UK, US。
 */

// 地区分组顺序
export const REGION_ORDER = ['HK', 'SG', 'JP', 'KR', 'TW', 'UK', 'US'];

// 服务分组 (不带 DIRECT)
const STREAMING_GROUPS = ['YouTube', 'Disney', 'Hbomax', 'Netflix', 'Telegram', 'Google', 'OpenAI'];

// 服务分组 (带 DIRECT 兜底)
const DIRECT_GROUPS = ['Spotify', 'Steam', 'Microsoft', 'PayPal', 'Apple'];

/**
 * 根据节点名判断地区
 * @param {string} name
 * @returns {string}
 */
export function regionOf(name) {
  if (name.includes('香港')) return 'HK';
  if (name.includes('新加坡')) return 'SG';
  if (name.includes('日本')) return 'JP';
  if (name.includes('韩国')) return 'KR';
  if (name.includes('台湾')) return 'TW';
  if (name.includes('伦敦') || name.includes('英国')) return 'UK';
  return 'US';
}

/**
 * 按地区分组
 * @param {object[]} nodes
 * @returns {{ region: string, names: string[] }[]} 按 REGION_ORDER 排序,未识别的追加
 */
export function groupByRegion(nodes) {
  const byRegion = {};
  for (const node of nodes) {
    const r = regionOf(node.name);
    if (!byRegion[r]) byRegion[r] = [];
    byRegion[r].push(node.name);
  }

  const known = REGION_ORDER.filter((r) => byRegion[r]);
  const unknown = Object.keys(byRegion).filter((r) => !REGION_ORDER.includes(r));
  return known.concat(unknown).map((r) => ({ region: r, names: byRegion[r] }));
}

/**
 * 生成 [Proxy Group] 节
 * @param {object[]} nodes
 * @returns {string}
 */
export function buildGroups(nodes) {
  const groups = groupByRegion(nodes);
  const regionList = groups.map((g) => g.region).join(',');
  const allNames = nodes.map((n) => n.name);

  const lines = ['[Proxy Group]', ''];
  // Proxies: 地区组在前,节点在后
  lines.push(`Proxies = select,${regionList},${allNames.join(',')}`);

  // 服务分组
  for (const g of STREAMING_GROUPS) {
    lines.push(`${g} = select,Proxies,${regionList}`);
  }
  for (const g of DIRECT_GROUPS) {
    lines.push(`${g} = select,Proxies,DIRECT,${regionList}`);
  }
  lines.push('Bahamut = select,Proxies,HK,TW');
  lines.push('Bilibili = select,DIRECT,HK,TW');
  lines.push('Final = select,Proxies,DIRECT');

  // 地区分组
  for (const g of groups) {
    lines.push(`${g.region} = select,${g.names.join(',')}`);
  }

  return lines.join('\n');
}