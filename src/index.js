/**
 * Worker 入口
 * 把订阅链接实时转换为 Surfboard 完整配置
 */
import { getConfig } from './config';
import { extractNodes } from './parser';
import { buildProxySection } from './transform';
import { buildGroups } from './groups';
import { decodeRules } from './rules';

// 模板在构建时注入
const GENERAL_TEMPLATE = `__GENERAL_TEMPLATE__`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/' && url.pathname !== '/sub') {
      return new Response('LX Surfboard worker. Use / or /sub', { status: 404 });
    }

    const { subscriptionUrl, passwordFilter } = getConfig(env);
    if (!subscriptionUrl) {
      return new Response(
        'SUBSCRIPTION_URL env var not configured.',
        { status: 500 },
      );
    }

    try {
      const resp = await fetch(subscriptionUrl);
      if (!resp.ok) {
        return new Response(`Upstream subscription failed: ${resp.status}`, { status: 502 });
      }
      const text = await resp.text();

      const nodes = extractNodes(text, passwordFilter);
      if (nodes.length === 0) {
        return new Response('No hysteria2 nodes found in subscription', { status: 502 });
      }

      const rules = await decodeRules();
      const conf = [
        `[General]\n${GENERAL_TEMPLATE}`,
        `[Proxy]\n${buildProxySection(nodes)}`,
        buildGroups(nodes),
        `[Rule]\n${rules}`,
      ].join('\n\n');

      return new Response(conf, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="surfboard.conf"',
          'Cache-Control': 'no-store',
        },
      });
    } catch (e) {
      return new Response(`Worker error: ${e.message}`, { status: 500 });
    }
  },
};