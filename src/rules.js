/**
 * 规则解压:从 gzip + base64 压缩的规则模板还原
 */

// 在构建时由 scripts/build.js 注入
// 格式: gzip 压缩后 base64 编码的规则文本
export const RULES_B64 = '__RULES_B64__';

/**
 * 解压规则
 * @returns {Promise<string>}
 */
export async function decodeRules() {
  const binary = atob(RULES_B64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const stream = new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'));
  const result = await new Response(stream).text();
  return result;
}