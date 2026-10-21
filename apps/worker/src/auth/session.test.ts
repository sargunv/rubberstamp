import { describe, expect, it } from "vite-plus/test";

import { openSession, sealSession, sessionKey } from "./session.ts";

const SECRET = "q2VtSIs5r8tDxCqUfdmrOEc5Hn5Wl1pvwuZW0Y6p0eE";
const session = {
  login: "sargunv",
  avatarUrl: "https://avatars.githubusercontent.com/u/1",
  token: "ghu_x",
  expires: 2_000,
};

describe("sessions", () => {
  it("round-trips through an encrypted cookie", async () => {
    const key = await sessionKey(SECRET);
    const cookie = await sealSession(key, session);
    expect(cookie).not.toContain("ghu_x");
    expect(await openSession(key, cookie, 1_000)).toEqual(session);
  });

  it("rejects expired, tampered, or foreign cookies", async () => {
    const key = await sessionKey(SECRET);
    const cookie = await sealSession(key, session);
    expect(await openSession(key, cookie, 3_000)).toBeNull();
    const flipped = `${cookie.slice(0, -2)}${cookie.endsWith("A") ? "B" : "A"}A`;
    expect(await openSession(key, flipped, 1_000)).toBeNull();
    const other = await sessionKey(
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    expect(await openSession(other, cookie, 1_000)).toBeNull();
    expect(await openSession(key, undefined)).toBeNull();
  });
});
