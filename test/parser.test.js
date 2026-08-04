/**
 * parser 单元测试
 */
import { describe, it, assert } from './helpers.js';

// 手动导入 parser 函数 (通用测试环境)
async function setup() {
  const mod = await import('../src/parser.js');
  return mod;
}

// 内联测试
const { parseHysteria2, extractNodes } = await setup();

describe('parseHysteria2', () => {
  it('parses full link with port hopping', () => {
    const link = 'hysteria2://pass123@server.example:60000/?insecure=false&sni=test.example.com&pinSHA256=abc123&mport=60000-65530#%F0%9F%87%AD%F0%9F%87%B0%E9%A6%99%E6%B8%AF%E4%B8%93%E7%BA%BF01%7CBGP%7C%E4%BD%8F%E5%AE%85IP';
    const node = parseHysteria2(link);
    assert(node !== null, 'should parse');
    assert(node.host === 'server.example', 'host');
    assert(node.port === 60000, 'port');
    assert(node.password === 'pass123', 'password');
    assert(node.sni === 'test.example.com', 'sni');
    assert(node.pinSHA256 === 'abc123', 'pinSHA256');
    assert(node.mport === '60000-65530', 'mport');
    assert(node.name.includes('香港'), 'name decoded');
  });

  it('parses simple link without port hopping', () => {
    const link = 'hysteria2://pass@host.com:443/#Name';
    const node = parseHysteria2(link);
    assert(node !== null, 'should parse');
    assert(node.host === 'host.com', 'host');
    assert(node.port === 443, 'port');
    assert(node.name === 'Name', 'name');
    assert(node.mport === '', 'no mport');
  });

  it('returns null for non-hysteria2', () => {
    assert(parseHysteria2('vless://...') === null, 'vless rejected');
    assert(parseHysteria2('not a url') === null, 'garbage rejected');
  });
});

describe('extractNodes', () => {
  it('extracts from base64 encoded subscription', () => {
    // base64 of "hysteria2://pw@a.com:443/#Node1\nvless://...\nhysteria2://pw@b.com:443/#Node2"
    const b64 = 'aHlzdGVyaWEyOi8vcHdAYS5jb206NDQzLyNOb2RlMQp2bGVzczovLy4uLgpoeXN0ZXJpYTI6Ly9wd0BiLmNvbTo0NDMvI05vZGUy';
    const nodes = extractNodes(b64);
    assert(nodes.length === 2, 'found 2 nodes');
    assert(nodes[0].name === 'Node1', 'first node');
    assert(nodes[1].name === 'Node2', 'second node');
  });

  it('filters by password', () => {
    const b64 = 'aHlzdGVyaWEyOi8vcHcxQGEuY29tOjQ0My8jTjEKaHlzdGVyaWEyOi8vcHcyQGIuY29tOjQ0My8jTjI=';
    const nodes = extractNodes(b64, 'pw2');
    assert(nodes.length === 1, 'filtered to 1');
    assert(nodes[0].name === 'N2', 'filtered node');
  });

  it('handles plain text', () => {
    const text = 'hysteria2://pw@a.com:443/#N1\nhysteria2://pw@b.com:443/#N2';
    const nodes = extractNodes(text);
    assert(nodes.length === 2, 'found 2 from plain text');
  });
});