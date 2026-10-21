/** Match a whole string against a pattern where `*` matches anything, `/` too. */
export function glob(
  pattern: string,
  options: { ignoreCase?: boolean } = {},
): (text: string) => boolean {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const regex = new RegExp(`^${escaped}$`, options.ignoreCase ? "i" : "");
  return (text) => regex.test(text);
}
