/**
 * Worker 在线托管配置测试
 */
import { describe, it, assertEq } from "./helpers.js";
import { buildManagedConfigLine } from "../src/config.js";

describe("buildManagedConfigLine", () => {
  it("uses the public HTTPS profile URL and strips query parameters", () => {
    const url = new URL("https://surfboard.example/sub?download=1");
    assertEq(
      buildManagedConfigLine(url),
      "#!MANAGED-CONFIG https://surfboard.example/sub interval=86400 strict=false",
    );
  });

  it("is disabled for local profile generation", () => {
    assertEq(buildManagedConfigLine(new URL("http://profile.example/sub")), "");
    assertEq(buildManagedConfigLine(new URL("https://127.0.0.1/sub")), "");
    assertEq(buildManagedConfigLine(new URL("https://localhost/sub")), "");
    assertEq(buildManagedConfigLine(new URL("https://[::1]/sub")), "");
    assertEq(
      buildManagedConfigLine(new URL("https://preview.localhost/sub")),
      "",
    );
    assertEq(buildManagedConfigLine(new URL("https://local.invalid/sub")), "");
  });
});
