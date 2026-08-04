/**
 * 节点 → Surfboard [Proxy] 行转换
 */

/**
 * @param {object} node - { name, host, port, password, sni, pinSHA256, mport }
 * @returns {string} - Surfboard 代理行
 */
export function toSurfboardProxy(node) {
  const fields = [
    'hysteria2',
    node.host,
    node.port,
    `password=${node.password}`,
  ];

  if (node.mport) {
    fields.push(`port-hopping="${node.mport}"`);
  }

  fields.push('skip-cert-verify=false');

  if (node.sni) {
    fields.push(`sni=${node.sni}`);
  }
  if (node.pinSHA256) {
    fields.push(`server-cert-fingerprint-sha256=${node.pinSHA256}`);
  }

  fields.push('udp-relay=true');

  return `${node.name} = ${fields.join(', ')}`;
}

/**
 * 生成 [Proxy] 节全部内容
 * @param {object[]} nodes
 * @returns {string}
 */
export function buildProxySection(nodes) {
  const lines = ['DIRECT = direct'];
  for (const node of nodes) {
    lines.push(toSurfboardProxy(node));
  }
  return lines.join('\n');
}