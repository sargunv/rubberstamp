import { minimatch } from "minimatch";

/**
 * Match a label name against a pattern where `*` matches anything. Label names
 * aren't paths, and may hold characters that path globs treat as syntax.
 */
export function nameGlob(
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

/**
 * Match a repository path the way GitHub Actions path filters do: `*` stays
 * within a directory, `**` crosses them, and dotfiles match.
 */
export function pathGlob(pattern: string): (path: string) => boolean {
  return (path) => minimatch(path, pattern, { dot: true });
}
