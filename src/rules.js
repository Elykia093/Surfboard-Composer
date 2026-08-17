/**
 * 规则解压:从生成的 gzip + base64 规则数据还原。
 */
import { RULES_B64 } from "./rules-data.js";

export async function decodeRules() {
  const binary = atob(RULES_B64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const stream = new Response(bytes).body.pipeThrough(
    new DecompressionStream("gzip"),
  );
  return new Response(stream).text();
}
