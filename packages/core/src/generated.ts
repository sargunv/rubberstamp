import { minimatch } from "minimatch";

import type { PullFile } from "./describe.ts";

/** A `.gitattributes` file: the directory it sits in, "" for the root. */
export type Attributes = { dir: string; source: string };

const ATTRIBUTE = "linguist-generated";

type Rule = { dir: string; matches: (path: string) => boolean; on: boolean };

/**
 * Every directory whose `.gitattributes` could mark one of these paths,
 * shallowest first.
 */
export function attributeDirs(paths: string[]): string[] {
  const dirs = new Set([""]);
  for (const path of paths) {
    const parts = path.split("/").slice(0, -1);
    parts.forEach((_, i) => dirs.add(parts.slice(0, i + 1).join("/")));
  }
  return [...dirs].sort((a, b) => depth(a) - depth(b));
}

function depth(dir: string): number {
  return dir === "" ? 0 : dir.split("/").length;
}

function parse({ dir, source }: Attributes): Rule[] {
  const rules: Rule[] = [];
  for (const line of source.split("\n")) {
    const [pattern, ...attributes] = line.trim().split(/\s+/);
    if (!pattern || pattern.startsWith("#") || pattern.startsWith("[attr]")) {
      continue;
    }
    let on: boolean | undefined;
    for (const attribute of attributes) {
      if (attribute === ATTRIBUTE || attribute === `${ATTRIBUTE}=true`) {
        on = true;
      } else if (
        attribute === `-${ATTRIBUTE}` ||
        attribute === `!${ATTRIBUTE}` ||
        attribute === `${ATTRIBUTE}=false`
      ) {
        on = false;
      }
    }
    // A pattern for a directory never matches the files in it.
    if (on === undefined || pattern.endsWith("/")) continue;
    // As in .gitignore, a pattern without a slash matches a name at any depth,
    // and one with a slash is relative to its file's directory.
    const anchored = pattern.includes("/");
    const glob = anchored ? pattern.replace(/^\//, "") : pattern;
    const name = (path: string) =>
      anchored ? path : path.slice(path.lastIndexOf("/") + 1);
    rules.push({
      dir,
      on,
      matches: (path) => minimatch(name(path), glob, { dot: true }),
    });
  }
  return rules;
}

/**
 * Whether a path is `linguist-generated`, as GitHub decides: the last matching
 * line wins, and a deeper `.gitattributes` overrides a shallower one.
 */
export function generatedMatcher(
  files: Attributes[],
): (path: string) => boolean {
  const rules = [...files]
    .sort((a, b) => depth(a.dir) - depth(b.dir))
    .flatMap(parse);
  return (path) => {
    let generated = false;
    for (const rule of rules) {
      const prefix = rule.dir === "" ? "" : `${rule.dir}/`;
      if (!path.startsWith(prefix)) continue;
      if (rule.matches(path.slice(prefix.length))) generated = rule.on;
    }
    return generated;
  };
}

/** The files, with those the attributes mark generated marked so. */
export function markGenerated(
  files: PullFile[],
  attributes: Attributes[],
): PullFile[] {
  if (attributes.length === 0) return files;
  const generated = generatedMatcher(attributes);
  return files.map((file) =>
    generated(file.filename) ? { ...file, generated: true } : file,
  );
}
