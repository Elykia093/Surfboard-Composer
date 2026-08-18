/**
 * groups 单元测试
 */
import { describe, it, assert, assertEq } from "./helpers.js";
const { regionOf, groupByRegion, buildGroups } =
  await import("../src/groups.js");

describe("regionOf", () => {
  it("identifies HK", () =>
    assertEq(regionOf("🇭🇰香港专线01|BGP|住宅IP"), "HK"));
  it("identifies SG", () =>
    assertEq(regionOf("🇸🇬新加坡专线01|BGP|流媒体"), "SG"));
  it("identifies JP", () =>
    assertEq(regionOf("🇯🇵日本专线01|BGP|流媒体"), "JP"));
  it("identifies KR", () =>
    assertEq(regionOf("🇰🇷韩国专线01|BGP|流媒体"), "KR"));
  it("identifies TW", () =>
    assertEq(regionOf("🇨🇳台湾专线01|BGP|流媒体"), "TW"));
  it("identifies UK", () =>
    assertEq(regionOf("🇬🇧英国伦敦01|流媒体|0.1x"), "UK"));
  it("identifies UK by 英国", () =>
    assertEq(regionOf("🇬🇧英国伦敦02|流媒体|0.1x"), "UK"));
  it("defaults to US", () => assertEq(regionOf("🇺🇸美国01|流媒体"), "US"));
  it("defaults unknown to US", () => assertEq(regionOf("unknown node"), "US"));
});

describe("groupByRegion", () => {
  const nodes = [
    { name: "🇭🇰香港专线01|BGP|住宅IP" },
    { name: "🇸🇬新加坡专线01|BGP|流媒体" },
    { name: "🇯🇵日本专线01|BGP|流媒体" },
    { name: "🇺🇸美国01|流媒体" },
  ];

  it("returns groups in region order", () => {
    const groups = groupByRegion(nodes);
    assertEq(groups.length, 4, "4 groups");
    assertEq(groups[0].region, "HK");
    assertEq(groups[1].region, "SG");
    assertEq(groups[2].region, "JP");
    assertEq(groups[3].region, "US");
  });
});

describe("buildGroups", () => {
  it("generates all group lines", () => {
    const nodes = [
      { name: "🇭🇰香港01|BGP|住宅IP" },
      { name: "🇸🇬新加坡01|BGP|流媒体" },
      { name: "🇯🇵日本01|BGP|流媒体" },
      { name: "🇺🇸美国01|流媒体" },
    ];
    const output = buildGroups(nodes);
    assert(output.includes("[Proxy Group]"), "has section header");
    assert(output.includes("Proxies = select,"), "has Proxies");
    assert(output.includes("YouTube = select,Proxies,"), "has YouTube");
    assert(output.includes("HK = select,"), "has HK group");
    assert(output.includes("SG = select,"), "has SG group");
    assert(output.includes("JP = select,"), "has JP group");
    assert(output.includes("US = select,"), "has US group");
    assert(output.includes("Final = select,Proxies,DIRECT"), "has Final");
    assert(output.includes("Bilibili = select,DIRECT,HK"), "has Bilibili");
  });

  it("does not reference unavailable preferred regions", () => {
    const output = buildGroups([{ name: "US-only" }]);
    assert(!output.includes("HK,TW"), "no undefined HK/TW groups");
    assert(output.includes("Bahamut = select,Proxies"), "Bahamut fallback");
    assert(output.includes("Bilibili = select,DIRECT"), "Bilibili fallback");
  });

  it("adds Auto/Fallback and makes Traffic follow Auto", () => {
    const output = buildGroups(
      [{ name: "香港01" }, { name: "新加坡01" }, { name: "美国01" }],
      "Traffic: 954.73 GB",
    );
    assert(
      output.includes(
        "Proxies = select,HK,SG,US,Traffic: 954.73 GB,Auto,Fallback,香港01,新加坡01,美国01",
      ),
      "Traffic follows US",
    );
    assert(
      output.includes(
        "Auto = url-test,香港01,新加坡01,美国01,url=https://www.gstatic.com/generate_204,interval=600",
      ),
      "Auto tests all nodes",
    );
    assert(
      output.includes(
        "Fallback = fallback,香港01,新加坡01,美国01,url=https://www.gstatic.com/generate_204,interval=600",
      ),
      "Fallback checks all nodes in order",
    );
    assert(
      output.includes("Traffic: 954.73 GB = select,Auto"),
      "Traffic follows Auto",
    );
  });

  it("keeps automatic groups available without HK", () => {
    const output = buildGroups([{ name: "美国01" }], "Traffic: 954.73 GB");
    assert(
      output.includes(
        "Proxies = select,US,Traffic: 954.73 GB,Auto,Fallback,美国01",
      ),
    );
    assert(output.includes("Traffic: 954.73 GB = select,Auto"));
  });
});
