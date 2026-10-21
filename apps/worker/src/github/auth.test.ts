import { describe, expect, it } from "vite-plus/test";

import { appJwt, verifyWebhook } from "./auth.ts";

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function fromBase64url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function pem(label: string, der: ArrayBuffer): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  return `-----BEGIN ${label}-----\n${base64.match(/.{1,64}/g)?.join("\n")}\n-----END ${label}-----\n`;
}

describe("verifyWebhook", async () => {
  const body = '{"action":"opened"}';
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode("s3cret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = `sha256=${hex(await crypto.subtle.sign("HMAC", key, encoder.encode(body)))}`;

  it("accepts GitHub's signature and rejects others", async () => {
    expect(await verifyWebhook("s3cret", body, signature)).toBe(true);
    expect(await verifyWebhook("other", body, signature)).toBe(false);
    expect(await verifyWebhook("s3cret", `${body} `, signature)).toBe(false);
    expect(await verifyWebhook("s3cret", body, null)).toBe(false);
    expect(await verifyWebhook("s3cret", body, "sha1=abc")).toBe(false);
  });
});

describe("appJwt", async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  if (!("privateKey" in pair)) throw new Error("expected a key pair");
  const der = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  if (!(der instanceof ArrayBuffer)) throw new Error("expected DER bytes");
  const pkcs8 = pem("PRIVATE KEY", der);

  it("signs an RS256 token for the app", async () => {
    const token = await appJwt("Iv23test", pkcs8, 1_700_000_000_000);
    const [header = "", payload = "", signature = ""] = token.split(".");
    expect(
      JSON.parse(new TextDecoder().decode(fromBase64url(payload))),
    ).toEqual({ iat: 1_699_999_940, exp: 1_700_000_540, iss: "Iv23test" });
    expect(
      await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        pair.publicKey,
        fromBase64url(signature),
        encoder.encode(`${header}.${payload}`),
      ),
    ).toBe(true);
  });

  it("explains how to convert a PKCS#1 key", async () => {
    const pkcs1 =
      "-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----\n";
    await expect(appJwt("Iv23test", pkcs1)).rejects.toThrow(/openssl pkcs8/);
  });
});
