/**
 * hysteria2:// 链接解析
 * 从 hysteria2://password@host:port/?params#name 格式解析为 node 对象
 */

/**
 * @param {string} link - hysteria2:// 链接
 * @returns {object|null} { name, host, port, password, sni, pinSHA256, mport }
 */
export function parseHysteria2(link) {
  const m = link.match(/^hysteria2:\/\/([^@]+)@([^:/?#]+):(\d+)(?:[\/?#](.*))?$/);
  if (!m) return null;

  const password = decodeURIComponent(m[1]);
  const host = m[2];
  const port = m[3];

  let query = '';
  let name = '';
  const rest = m[4] || '';
  const hashIdx = rest.indexOf('#');
  if (hashIdx >= 0) {
    name = rest.slice(hashIdx + 1);
    query = rest.slice(0, hashIdx);
  } else {
    query = rest;
  }

  const params = new URLSearchParams(query);

  return {
    name: decodeURIComponent(name) || `${host}:${port}`,
    host,
    port: parseInt(port, 10),
    password,
    sni: params.get('sni') || '',
    pinSHA256: params.get('pinSHA256') || '',
    mport: params.get('mport') || '',
  };
}

/**
 * 从订阅文本中提取所有 hysteria2 节点
 * @param {string} text - 原始订阅文本 (base64 或明文)
 * @param {string} [passwordFilter] - 可选,只保留此密码的节点
 * @returns {object[]}
 */
export function extractNodes(text, passwordFilter) {
  let decoded;
  try {
    decoded = atob(text.replace(/\s/g, ''));
  } catch {
    decoded = text;
  }

  const lines = decoded.split(/\r?\n/);
  const nodes = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('hysteria2://')) {
      const node = parseHysteria2(t);
      if (!node) continue;
      if (passwordFilter && node.password !== passwordFilter) continue;
      nodes.push(node);
    }
  }
  return nodes;
}

/**
 * 从订阅文本中提取订阅信息 (如剩余流量、到期时间等)
 * 这些信息以 vless:// 等非 hysteria2 节点的名字形式出现
 * @param {string} text - 原始订阅文本 (base64 或明文)
 * @returns {string} - 信息内容,如 "剩余流量:975.26 GB\n套餐到期:长期有效"
 */
export function extractSubscribeInfo(text) {
  let decoded;
  try {
    decoded = atob(text.replace(/\s/g, ''));
  } catch {
    decoded = text;
  }

  const lines = decoded.split(/\r?\n/);
  const infoItems = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('hysteria2://')) continue;

    const hashIdx = t.indexOf('#');
    if (hashIdx < 0) continue;

    const name = t.slice(hashIdx + 1);
    if (!name) continue;

    let decodedName;
    try {
      decodedName = decodeURIComponent(name);
    } catch {
      continue;
    }

    // 提取信息标签: 剩余流量、上传流量、下载流量、套餐流量、套餐到期、到期时间
    if (
      decodedName.startsWith('剩余流量') ||
      decodedName.startsWith('上传流量') ||
      decodedName.startsWith('下载流量') ||
      decodedName.startsWith('套餐流量') ||
      decodedName.startsWith('套餐到期') ||
      decodedName.startsWith('到期时间')
    ) {
      const normalized = decodedName.replace(/：/g, ':');
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

  return unique.join('\\n');
}