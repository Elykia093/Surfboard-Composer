import assert from "node:assert/strict";
import { parseNode } from "../src/parser.js";
import { buildGroups } from "../src/groups.js";
import {
  buildProxySection,
  buildWireGuardSections,
  toSurfboardProxy,
} from "../src/transform.js";

const tuic = parseNode("tuic-v5://uuid:password@tuic.example:443?alpn=h3#TUIC");
assert.equal(
  toSurfboardProxy(tuic),
  "TUIC = tuic-v5, tuic.example, 443, uuid=uuid, password=password, alpn=h3, skip-cert-verify=false, udp-relay=true",
);

const trojanWs = parseNode(
  "trojan://password@trojan.example:443?type=ws&path=%2Fws&host=cdn.example.com#TrojanWS",
);
assert.match(toSurfboardProxy(trojanWs), /ws=true/);
assert.match(toSurfboardProxy(trojanWs), /ws-path=\/ws/);
assert.match(toSurfboardProxy(trojanWs), /ws-headers=Host:cdn.example.com/);

const wireguard = parseNode(
  "wireguard://private-key@wg.example:51820?public-key=peer-key&address=10.0.2.2&dns=1.1.1.1#WG,=01",
);
assert.equal(
  toSurfboardProxy(wireguard),
  "WG01 = wireguard, section-name = WG01",
);
assert.match(buildWireGuardSections([wireguard]), /\[WireGuard WG01\]/);
assert.match(buildWireGuardSections([wireguard]), /private-key = private-key/);
assert.match(
  buildGroups([wireguard]),
  /US = url-test,WG01,url=http:\/\/www\.gstatic\.com\/generate_204,interval=600/,
);
assert.match(
  buildProxySection([wireguard]),
  /^DIRECT = direct\nWG01 = wireguard/m,
);
assert.match(
  buildProxySection([wireguard], "Traffic: 954.73 GB"),
  /^DIRECT = direct\nTraffic: 954\.73 GB = direct\nWG01 = wireguard/m,
);

const wireguardV6 = parseNode(
  "wireguard://[2001:db8::1]:51820?private-key=private%2Bkey&public-key=peer%2Bkey&address=10.0.2.3&dns=1.0.0.1#WG%5B01%5D",
);
const duplicateNames = [wireguard, wireguardV6];
const proxySection = buildProxySection(duplicateNames);
const wireGuardSections = buildWireGuardSections(duplicateNames);
const groups = buildGroups(duplicateNames);
assert.match(proxySection, /^WG01 = wireguard/m);
assert.match(proxySection, /^WG01 2 = wireguard/m);
assert.match(wireGuardSections, /\[WireGuard WG01\]/);
assert.match(wireGuardSections, /\[WireGuard WG01 2\]/);
assert.match(wireGuardSections, /endpoint = \[2001:db8::1\]:51820/);
assert.match(
  groups,
  /US = url-test,WG01,WG01 2,url=http:\/\/www\.gstatic\.com\/generate_204,interval=600/,
);

const reservedName = parseNode("hysteria2://pw@node.example:443#DIRECT");
assert.match(buildProxySection([reservedName]), /^DIRECT 2 = hysteria2/m);

console.log(
  "\n# transform protocol output\n  ✓ TUIC and WireGuard output stays consistent across sections and unique names",
);
