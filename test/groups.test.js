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
    assert(output.includes("HK = url-test,"), "has automatic HK group");
    assert(output.includes("SG = url-test,"), "has automatic SG group");
    assert(output.includes("JP = url-test,"), "has automatic JP group");
    assert(output.includes("US = url-test,"), "has automatic US group");
    assert(
      output.includes(
        "HK = url-test,🇭🇰香港01|BGP|住宅IP,url=http://www.gstatic.com/generate_204,interval=600",
      ),
      "region groups select the lowest-latency node",
    );
    assert(output.includes("Final = select,Proxies,DIRECT"), "has Final");
    assert(output.includes("Bilibili = select,DIRECT,HK"), "has Bilibili");
  });

  it("does not reference unavailable preferred regions", () => {
    const output = buildGroups([{ name: "US-only" }]);
    assert(!output.includes("HK,TW"), "no undefined HK/TW groups");
    assert(output.includes("Bahamut = select,Proxies"), "Bahamut fallback");
    assert(output.includes("Bilibili = select,DIRECT"), "Bilibili fallback");
  });

  it("keeps Traffic in Proxies without a Traffic group definition", () => {
    const output = buildGroups(
      [{ name: "香港01" }, { name: "新加坡01" }, { name: "美国01" }],
      "Traffic: 954.73 GB",
    );
    assert(
      output.includes(
        "Proxies = select,Auto,Fallback,HK,SG,US,Traffic: 954.73 GB,香港01,新加坡01,美国01",
      ),
      "Auto/Fallback lead and Traffic stays in Proxies",
    );
    assert(
      output.includes(
        "Auto = url-test,香港01,新加坡01,美国01,url=http://www.gstatic.com/generate_204,interval=600",
      ),
      "Auto tests all nodes",
    );
    assert(
      output.includes(
        "Fallback = fallback,香港01,新加坡01,美国01,url=http://www.gstatic.com/generate_204,interval=600",
      ),
      "Fallback checks all nodes in order",
    );
    assert(
      !output.includes("Traffic: 954.73 GB = "),
      "Traffic group definition is omitted",
    );
    assert(
      output.endsWith(
        "US = url-test,美国01,url=http://www.gstatic.com/generate_204,interval=600",
      ),
      "last group is the final region group",
    );
  });

  it("keeps automatic groups available without HK", () => {
    const output = buildGroups([{ name: "美国01" }], "Traffic: 954.73 GB");
    assert(
      output.includes(
        "Proxies = select,Auto,Fallback,US,Traffic: 954.73 GB,美国01",
      ),
    );
    assert(!output.includes("Traffic: 954.73 GB = "));
    assert(
      output.endsWith(
        "US = url-test,美国01,url=http://www.gstatic.com/generate_204,interval=600",
      ),
    );
  });
});
