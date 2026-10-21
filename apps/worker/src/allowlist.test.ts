import { describe, expect, it } from "vite-plus/test";

import { allowlisted, parseAllowlist } from "./allowlist.ts";

describe("allowlist", () => {
  const allowlist = parseAllowlist(" sargunv/* , MapLibre/*,someone/one-repo,");

  it("matches whole owners and single repositories, ignoring case", () => {
    expect(allowlisted(allowlist, "sargunv/example")).toBe(true);
    expect(allowlisted(allowlist, "maplibre/maplibre-native-ffi")).toBe(true);
    expect(allowlisted(allowlist, "Someone/One-Repo")).toBe(true);
    expect(allowlisted(allowlist, "someone/other-repo")).toBe(false);
    expect(allowlisted(allowlist, "sargunvx/example")).toBe(false);
  });

  it("rejects malformed entries", () => {
    expect(() => parseAllowlist("sargunv")).toThrow(/expected owner\/repo/);
    expect(() => parseAllowlist("*/*")).toThrow();
    expect(() => parseAllowlist("a/b/c")).toThrow();
  });

  it("allows nothing when empty", () => {
    expect(allowlisted(parseAllowlist(""), "sargunv/x")).toBe(false);
  });
});
