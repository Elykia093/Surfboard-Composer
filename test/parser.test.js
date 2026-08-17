/**
 * parser 单元测试
 */
import { describe, it, assert, assertEq } from "./helpers.js";

const { parseNode, extractNodes, extractSubscribeInfo } =
  await import("../src/parser.js");

describe("parseNode - hysteria2", () => {
  it("parses full link with port hopping", () => {
    const link =
      "hysteria2://pass123@server.example:60000/?insecure=false&sni=test.example.com&pinSHA256=abc123&mport=60000-65530#%F0%9F%87%AD%F0%9F%87%B0%E9%A6%99%E6%B8%AF%E4%B8%93%E7%BA%BF01%7CBGP%7C%E4%BD%8F%E5%AE%85IP";
    const node = parseNode(link);
    assert(node.type === "hysteria2", "should be hysteria2");
    assert(node.host === "server.example", "host");
    assert(node.port === 60000, "port");
    assert(node.password === "pass123", "password");
    assert(node.sni === "test.example.com", "sni");
    assert(node.pinSHA256 === "abc123", "pinSHA256");
    assert(node.mport === "60000-65530", "mport");
    assert(
      node.skipCert === false,
      "insecure=false keeps certificate verification",
    );
    assert(node.name.includes("香港"), "name decoded");
  });

  it("parses simple link without port hopping", () => {
    const node = parseNode("hysteria2://pass@host.com:443/#Name");
    assert(node.host === "host.com", "host");
    assert(node.port === 443, "port");
    assert(node.name === "Name", "name");
    assert(node.mport === "", "no mport");
  });
});

describe("parseNode - hysteria2 security and external protocols", () => {
  it("maps insecure=true to skip-cert-verify", () => {
    const node = parseNode("hy2://pw@host.com:443?insecure=1#HY2");
    assert(node.skipCert === true, "insecure enabled");
  });

  it("rejects decoded control characters", () => {
    assert(
      parseNode("hysteria2://pw%0A%5BRule%5D@host.com:443#HY2") === null,
      "control characters cannot enter generated config",
    );
  });

  it("parses TUIC v5 URI fields", () => {
    const node = parseNode(
      "tuic://uuid-1:pw-1@tuic.example:443?alpn=h3&sni=tuic.example&port-hopping=5000-6000#TUIC",
    );
    assert(node.type === "tuic", "type");
    assert(node.uuid === "uuid-1", "uuid");
    assert(node.password === "pw-1", "password");
    assert(node.portHopping === "5000-6000", "port hopping");
  });

  it("parses WireGuard URI and query fields", () => {
    const node = parseNode(
      "wireguard://private-key@wg.example:51820?public-key=peer-key&address=10.0.2.2&dns=1.1.1.1&allowed-ips=0.0.0.0%2F0%2C%20%3A%3A%2F0&mtu=1280&keepalive=25#WG",
    );
    assert(node.type === "wireguard", "type");
    assert(node.privateKey === "private-key", "private key");
    assert(node.selfIp === "10.0.2.2", "self ip");
    assert(node.publicKey === "peer-key", "peer key");
    assert(node.keepalive === "25", "keepalive");
  });

  it("preserves WireGuard Base64 plus signs and parses IPv6 endpoints", () => {
    const node = parseNode(
      "wireguard://[2001:db8::1]:51820?private-key=private+key%3D%3D&public-key=peer%2Bkey%3D%3D&address=10.0.2.2&dns=1.1.1.1#WGv6",
    );
    assert(node.host === "2001:db8::1", "IPv6 host");
    assert(node.privateKey === "private+key==", "literal plus preserved");
    assert(node.publicKey === "peer+key==", "encoded plus decoded");
  });
});

describe("parseNode - ss", () => {
  it("parses the shadowsocks alias", () => {
    const node = parseNode(
      "shadowsocks://aes-256-gcm:secret@alias.example:8388#AliasSS",
    );
    assert(node.type === "ss", "type ss");
    assert(node.encryptMethod === "aes-256-gcm", "method");
    assert(node.password === "secret", "password");
  });

  it("parses SIP002 base64 userinfo", () => {
    // ss://BASE64(method:password)@host:port#Name
    const userinfo = btoa("aes-256-gcm:supersecret");
    const link = `ss://${userinfo}@example.com:8388#TestSS`;
    const node = parseNode(link);
    assert(node.type === "ss", "type ss");
    assert(node.host === "example.com", "host");
    assert(node.port === 8388, "port");
    assert(node.encryptMethod === "aes-256-gcm", "method");
    assert(node.password === "supersecret", "password");
    assert(node.name === "TestSS", "name");
  });

  it("parses full base64 authority form", () => {
    // ss://BASE64(method:password@host:port)#Name
    const full = btoa("aes-256-gcm:secret@example.net:443");
    const node = parseNode(`ss://${full}#FullForm`);
    assert(node.host === "example.net", "host");
    assert(node.port === 443, "port");
    assert(node.password === "secret", "password");
  });

  it("maps simple-obfs plugin params to Surfboard obfs fields", () => {
    const userinfo = btoa("chacha20-ietf-poly1305:pw");
    const link = `ss://${userinfo}@host.com:8388?plugin=obfs-local%3Bobfs%3Dhttp%3Bobfs-host%3Dexample.com#Plugin`;
    const node = parseNode(link);
    assertEq(node.obfs, "http", "obfs");
    assertEq(node.obfsHost, "example.com", "obfs host");
  });

  it("rejects unsupported SS plugins", () => {
    const userinfo = btoa("chacha20-ietf-poly1305:pw");
    const link = `ss://${userinfo}@host.com:8388?plugin=v2ray-plugin%3Btls%3Bhost%3Dexample.com#Plugin`;
    assertEq(parseNode(link), null, "unsupported plugin");
  });
});

describe("parseNode - vmess", () => {
  it("parses base64 JSON form", () => {
    const json = JSON.stringify({
      v: "2",
      ps: "HK-01",
      add: "server.com",
      port: "443",
      id: "uuid-1234",
      net: "ws",
      type: "none",
      host: "ws.host.com",
      path: "/ws",
      tls: "tls",
      sni: "tls.host.com",
    });
    const node = parseNode(`vmess://${btoa(json)}`);
    assert(node.type === "vmess", "type");
    assert(node.host === "server.com", "host");
    assert(node.port === 443, "port");
    assert(node.uuid === "uuid-1234", "uuid");
    assert(node.name === "HK-01", "name");
    assert(node.ws === true, "ws");
    assert(node.wsPath === "/ws", "wsPath");
    assert(node.tls === true, "tls");
    assert(node.sni === "tls.host.com", "sni");
  });

  it("rejects an out-of-range JSON port", () => {
    const json = btoa(
      JSON.stringify({ add: "server.com", port: "99999", id: "uuid-1234" }),
    );
    assert(parseNode(`vmess://${json}`) === null, "invalid port rejected");
  });
});

describe("parseNode - trojan", () => {
  it("parses the trojan-go alias", () => {
    const node = parseNode("trojan-go://pw@alias.example:443#AliasTrojan");
    assert(node.type === "trojan", "type trojan");
    assert(node.password === "pw", "password");
  });

  it("parses with sni and fragment", () => {
    const node = parseNode(
      "trojan://pw123@server.com:443?sni=cdn.example.com&allowInsecure=1#TROJAN-01",
    );
    assert(node.type === "trojan", "type");
    assert(node.host === "server.com", "host");
    assert(node.port === 443, "port");
    assert(node.password === "pw123", "password");
    assert(node.sni === "cdn.example.com", "sni");
    assert(node.skipCert === true, "skipCert");
    assert(node.name === "TROJAN-01", "name");
  });

  it("keeps at signs inside credentials", () => {
    const node = parseNode("trojan://pass@word@server.com:443#TrojanAt");
    assert(node.password === "pass@word", "password");
    assert(node.host === "server.com", "host");
  });

  it("preserves Trojan WebSocket parameters", () => {
    const node = parseNode(
      "trojan://pw@server.com:443?type=ws&path=%2Findex.html&host=cdn.example.com#TrojanWS",
    );
    assert(node.ws === true, "websocket enabled");
    assert(node.wsPath === "/index.html", "websocket path");
    assert(node.wsHost === "cdn.example.com", "websocket host");
  });
});

describe("parseNode - http/socks5", () => {
  it("parses http with auth", () => {
    const node = parseNode("http://user:pass@proxy.com:8080#HTTP1");
    assert(node.type === "http", "type");
    assert(node.host === "proxy.com", "host");
    assert(node.username === "user", "username");
    assert(node.password === "pass", "password");
  });

  it("parses socks5 with auth", () => {
    const node = parseNode("socks5://u:p@socks.com:1080#S5");
    assert(node.type === "socks5", "type");
    assert(node.host === "socks.com", "host");
    assert(node.username === "u", "username");
  });

  it("parses the socks5-tls scheme alias", () => {
    const node = parseNode(
      "socks5-tls://u:p@socks.example:443?insecure=true#S5TLS",
    );
    assert(node.type === "socks5-tls", "type");
    assert(node.skipCert === true, "insecure enabled");
  });
});

describe("parseNode - snell", () => {
  it("parses snell psk", () => {
    const node = parseNode("snell://MYPSK@snell.com:8899?version=3#Snell1");
    assert(node.type === "snell", "type");
    assert(node.psk === "MYPSK", "psk");
    assert(node.version === "3", "version");
  });
});

describe("parseNode - anytls", () => {
  it("parses anytls", () => {
    const node = parseNode("anytls://pw@any.com:443?sni=any.example.com#Any1");
    assert(node.type === "anytls", "type");
    assert(node.password === "pw", "password");
    assert(node.sni === "any.example.com", "sni");
  });
});

describe("parseNode - unsupported", () => {
  it("rejects vless", () => {
    assert(
      parseNode("vless://uuid@host.com:443?type=ws#Name") === null,
      "vless rejected",
    );
  });
  it("rejects garbage", () => {
    assert(parseNode("not a url") === null, "garbage rejected");
  });
});

describe("extractNodes", () => {
  it("extracts all supported protocols, skips vless", () => {
    const text = [
      "hysteria2://pw@a.com:443/#H1",
      "vless://xxx@b.com:443/?type=ws#V1",
      "trojan://pw@c.com:443/#T1",
      "ss://" + btoa("chacha20-ietf-poly1305:pw") + "@d.com:8388#S1",
    ].join("\n");
    const nodes = extractNodes(text);
    assert(nodes.length === 3, "3 supported nodes");
    assert(
      nodes
        .map((n) => n.type)
        .sort()
        .join(",") === "hysteria2,ss,trojan",
      "types",
    );
  });

  it("filters by password", () => {
    const b64 =
      "aHlzdGVyaWEyOi8vcHcxQGEuY29tOjQ0My8jTjEKaHlzdGVyaWEyOi8vcHcyQGIuY29tOjQ0My8jTjI=";
    const nodes = extractNodes(b64, "pw2");
    assert(nodes.length === 1, "filtered to 1");
    assert(nodes[0].name === "N2", "filtered node");
  });

  it("excludes protocols without passwords when a password filter is set", () => {
    const text = [
      "wireguard://private@wg.example:51820?public-key=peer&address=10.0.2.2&dns=1.1.1.1#WG",
      "hysteria2://pw2@b.com:443/#N2",
    ].join("\n");
    const nodes = extractNodes(text, "pw2");
    assert(nodes.length === 1, "only the matching password node remains");
    assert(nodes[0].type === "hysteria2", "WireGuard is excluded");
  });

  it("handles plain text", () => {
    const text = "hysteria2://pw@a.com:443/#N1\nhysteria2://pw@b.com:443/#N2";
    const nodes = extractNodes(text);
    assert(nodes.length === 2, "found 2 from plain text");
  });

  it("decodes URL-safe UTF-8 Base64 subscriptions", () => {
    const json = JSON.stringify({
      ps: "香港 UTF-8",
      add: "vmess.example",
      port: 443,
      id: "uuid-utf8",
    });
    const encoded = Buffer.from(json, "utf8").toString("base64url");
    const nodes = extractNodes(`vmess://${encoded}`);
    assert(nodes.length === 1, "URL-safe Base64 node found");
    assert(nodes[0].name === "香港 UTF-8", "UTF-8 name decoded");
  });
});

describe("extractSubscribeInfo", () => {
  it("extracts info from non-hysteria2 info nodes", () => {
    const text = [
      "vless://uuid@a.com:443/?type=ws#%E5%89%A9%E4%BD%99%E6%B5%81%E9%87%8F%EF%BC%9A975.35%20GB",
      "vless://uuid@b.com:443/?type=ws#%E5%A5%97%E9%A4%90%E5%88%B0%E6%9C%9F%EF%BC%9A%E9%95%BF%E6%9C%9F%E6%9C%89%E6%95%88",
      "hysteria2://pw@c.com:443/#HK-01",
    ].join("\n");
    const info = extractSubscribeInfo(text);
    assert(info.includes("剩余流量"), "has 剩余流量");
    assert(info.includes("975.35"), "has value");
    assert(info.includes("套餐到期"), "has 套餐到期");
    assert(!info.includes("HK-01"), "no node names");
  });

  it("sanitizes control characters and commas in panel info", () => {
    const info = extractSubscribeInfo(
      "vless://uuid@a.com:443#%E5%89%A9%E4%BD%99%E6%B5%81%E9%87%8F%3A1%0A%5BRule%5D%0AFINAL%2CDIRECT",
    );
    assertEq(info, "剩余流量:1 [Rule] FINAL，DIRECT");
  });
});
