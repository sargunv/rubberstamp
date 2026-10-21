const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function pemBytes(pem: string): Uint8Array {
  if (pem.includes("BEGIN RSA PRIVATE KEY")) {
    throw new Error(
      "The GitHub App key is PKCS#1. Convert it with `openssl pkcs8 -topk8 -nocrypt`.",
    );
  }
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
}

const keys = new Map<string, Promise<CryptoKey>>();

function importKey(pem: string): Promise<CryptoKey> {
  let key = keys.get(pem);
  if (!key) {
    key = crypto.subtle.importKey(
      "pkcs8",
      pemBytes(pem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    keys.set(pem, key);
  }
  return key;
}

/** A JWT that authenticates as the GitHub App itself, valid for ten minutes. */
export async function appJwt(
  clientId: string,
  privateKey: string,
  now = Date.now(),
): Promise<string> {
  const seconds = Math.floor(now / 1000);
  const header = base64url(encoder.encode('{"alg":"RS256","typ":"JWT"}'));
  // Backdated to tolerate clock drift, as GitHub recommends.
  const payload = base64url(
    encoder.encode(
      JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: clientId }),
    ),
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await importKey(privateKey),
    encoder.encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}

/** Check a webhook's `X-Hub-Signature-256` header against its raw body. */
export async function verifyWebhook(
  secret: string,
  body: string,
  signature: string | null,
): Promise<boolean> {
  const hex = signature?.match(/^sha256=([0-9a-f]{64})$/)?.[1];
  if (!hex) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(hex.match(/../g) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );
  return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(body));
}
