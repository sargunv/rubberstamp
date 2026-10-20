import type { Json } from "./jev.ts";

/** JSON with object keys sorted, so equal values always serialize alike. */
export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .flatMap((key) => {
        const item = value[key];
        return item === undefined
          ? []
          : [`${JSON.stringify(key)}:${canonicalJson(item)}`];
      });
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function hashJson(value: Json): Promise<string> {
  return sha256(canonicalJson(value));
}
