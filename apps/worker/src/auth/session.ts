import * as v from "valibot";

/** A signed-in user, kept encrypted in a cookie so no session table is needed. */
export const Session = v.object({
  login: v.string(),
  avatarUrl: v.string(),
  /** The user's GitHub App user access token. */
  token: v.string(),
  /** When the token expires, in milliseconds since the epoch. */
  expires: v.number(),
});

export type Session = v.InferOutput<typeof Session>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** The AES-GCM key from `SESSION_SECRET`, 32 random bytes in base64. */
export function sessionKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    fromBase64Url(secret),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealSession(
  key: CryptoKey,
  session: Session,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(session)),
  );
  const bytes = new Uint8Array(iv.length + sealed.byteLength);
  bytes.set(iv);
  bytes.set(new Uint8Array(sealed), iv.length);
  return toBase64Url(bytes);
}

/** The session in a cookie, or null if it's missing, forged, or expired. */
export async function openSession(
  key: CryptoKey,
  cookie: string | undefined,
  now = Date.now(),
): Promise<Session | null> {
  if (!cookie) return null;
  try {
    const bytes = fromBase64Url(cookie);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      key,
      bytes.slice(12),
    );
    const session = v.parse(Session, JSON.parse(decoder.decode(plain)));
    return session.expires > now ? session : null;
  } catch {
    return null;
  }
}
