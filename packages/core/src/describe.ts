import type { Json } from "./jev.ts";

export type PullFile = {
  filename: string;
  previous_filename?: string | undefined;
  status: string;
  additions: number;
  deletions: number;
  patch?: string | undefined;
  /** Marked `linguist-generated` by the repository's `.gitattributes`. */
  generated?: boolean | undefined;
};

/**
 * The status of a file a pull request changed when a unit last passed but no
 * longer does. It has no patch: what's gone is the change itself.
 */
export const REVERTED = "reverted";

export type Item =
  | { type: "issue"; title: string; body: string | null }
  | {
      type: "pull request";
      title: string;
      body: string | null;
      files: PullFile[];
    };

export const BODY_LIMIT = 8_000;
const FILE_LIMIT = 24_000;
const SUMMARY_FILE_LIMIT = 3_000;
const FILE_LIST_LIMIT = 24_000;
// Labels are about a change's subject, so the first part of its patch is
// enough, and the body and file list fit in the rest of the state budget.
const PATCH_BUDGET = 48_000;
// Lockfiles and generated files matter only in summary, such as which packages
// moved, so they come after a change's own files and each shows only its start.
const GENERATED_PATTERNS =
  /(\.lock|-lock\.ya?ml|lock\.json|Package\.resolved|\.lock\.json)$|(^|\/)generated\/|\.g\.dart$|_generated\.|\/gradle\/verification-metadata\.xml$/;

const STATUS: Record<string, string> = {
  added: "A",
  removed: "D",
  modified: "M",
  renamed: "R",
  copied: "C",
  changed: "T",
  unchanged: "M",
};

/** Whether a file is generated, by its attributes or as a known kind. */
export function isGenerated(file: PullFile): boolean {
  return file.generated === true || GENERATED_PATTERNS.test(file.filename);
}

/** The files written by hand, then the generated ones, each in their order. */
export function handwrittenFirst(files: PullFile[]): PullFile[] {
  return [
    ...files.filter((file) => !isGenerated(file)),
    ...files.filter(isGenerated),
  ];
}

function fileHeader(file: PullFile): string {
  const before = file.previous_filename ?? file.filename;
  const lines = [`diff --git a/${before} b/${file.filename}`];
  if (file.status === "added") lines.push("new file");
  if (file.status === "removed") lines.push("deleted file");
  if (isGenerated(file)) lines.push("generated file");
  if (file.previous_filename) {
    lines.push(`rename from ${file.previous_filename}`);
    lines.push(`rename to ${file.filename}`);
  }
  return lines.join("\n") + "\n";
}

function truncate(file: PullFile, text: string): string {
  const summary = isGenerated(file) || file.status === "removed";
  const limit = summary ? SUMMARY_FILE_LIMIT : FILE_LIMIT;
  if (text.length <= limit) return text;
  const omitted = text.slice(limit).split("\n").length - 1;
  return `${text.slice(0, limit)}\n[... ${omitted} more lines of this file's diff omitted]\n`;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

const changes = (line: string) => line.startsWith("+") || line.startsWith("-");

/**
 * A hunk's lines with at most `context` unchanged lines around each change,
 * split into hunks where lines between changes are dropped.
 */
function narrowHunk(
  header: RegExpMatchArray,
  lines: string[],
  context: number,
): string[] {
  const near = lines.map((_, i) =>
    lines.slice(Math.max(0, i - context), i + context + 1).some(changes),
  );
  const out: string[] = [];
  let at = { old: Number(header[1]), new: Number(header[2]) };
  let kept: { old: number; new: number; lines: string[] } | undefined;
  const close = () => {
    if (kept === undefined) return;
    const { lines: hunk } = kept;
    const count = (skip: string) =>
      hunk.filter((l) => !l.startsWith(skip) && !l.startsWith("\\")).length;
    const tail = out.length === 0 ? (header[3] ?? "") : "";
    out.push(
      `@@ -${kept.old},${count("+")} +${kept.new},${count("-")} @@${tail}`,
      ...hunk,
    );
    kept = undefined;
  };
  lines.forEach((line, i) => {
    // "\ No newline at end of file" belongs to the line before it.
    if (line.startsWith("\\")) {
      kept?.lines.push(line);
      return;
    }
    if (near[i]) {
      kept ??= { ...at, lines: [] };
      kept.lines.push(line);
    } else {
      close();
    }
    if (!line.startsWith("+")) at = { ...at, old: at.old + 1 };
    if (!line.startsWith("-")) at = { ...at, new: at.new + 1 };
  });
  close();
  return out;
}

/**
 * A unified diff with at most `context` unchanged lines around each change, as
 * `git diff -U<context>` would show it. Lines outside any hunk stay as they are.
 */
export function narrowContext(patch: string, context: number): string {
  const out: string[] = [];
  let hunk: { header: RegExpMatchArray; lines: string[] } | undefined;
  const flush = () => {
    if (hunk) out.push(...narrowHunk(hunk.header, hunk.lines, context));
  };
  for (const line of patch.split("\n")) {
    const header = line.match(HUNK);
    if (header) {
      flush();
      hunk = { header, lines: [] };
    } else if (hunk) {
      // A blank context line is a lone space, so an empty line ends the patch.
      if (line !== "") hunk.lines.push(line);
    } else {
      out.push(line);
    }
  }
  flush();
  return out.join("\n");
}

/**
 * How much of a change to describe: `context` unchanged lines around each
 * change, or every line the patch has when undefined, and whether to name
 * generated files one by one in the file list or count them.
 */
export type Detail = { context?: number; generated?: "list" | "count" };

export function filePatch(file: PullFile, detail: Detail = {}): string {
  const patch =
    file.patch === undefined || detail.context === undefined
      ? file.patch
      : narrowContext(file.patch, detail.context);
  const body =
    patch === undefined
      ? "[no textual diff: binary or too large to show]\n"
      : patch.endsWith("\n")
        ? patch
        : `${patch}\n`;
  return truncate(file, fileHeader(file) + body);
}

const SUBMODULE =
  /^-Subproject commit ([0-9a-f]{7})[0-9a-f]*\n\+Subproject commit ([0-9a-f]{7})/m;

function fileSummary(file: PullFile): string {
  const moved = file.patch?.match(SUBMODULE);
  if (moved) return `submodule ${moved[1]} → ${moved[2]}`;
  const lines = `+${file.additions} -${file.deletions}`;
  return isGenerated(file) ? `${lines}, generated` : lines;
}

/**
 * The changed files, generated ones last so a long list cuts them first, or
 * only counted.
 */
export function fileList(files: PullFile[], detail: Detail = {}): string[] {
  const generated = files.filter(isGenerated);
  const counted = detail.generated === "count" && generated.length > 0;
  const listed: string[] = [];
  let size = 0;
  for (const file of counted
    ? files.filter((f) => !isGenerated(f))
    : handwrittenFirst(files)) {
    const line =
      file.status === REVERTED
        ? `${file.filename} (reverted: the pull request no longer changes it)`
        : `${STATUS[file.status] ?? "M"} ${file.filename} (${fileSummary(file)})`;
    size += line.length + 4;
    if (size > FILE_LIST_LIMIT) {
      listed.push(`... and ${files.length - listed.length} more changed files`);
      break;
    }
    listed.push(line);
  }
  if (counted && size <= FILE_LIST_LIMIT) {
    const sum = (key: "additions" | "deletions") =>
      generated.reduce((total, file) => total + file[key], 0);
    listed.push(
      `... and ${generated.length} generated files (+${sum("additions")} -${sum("deletions")})`,
    );
  }
  return listed;
}

/** Pack patches into chunks of at most `budget` characters each. */
export function chunk(patches: string[], budget: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const text of patches) {
    if (current && current.length + text.length > budget) {
      chunks.push(current);
      current = "";
    }
    current += text.slice(0, budget);
  }
  if (current || chunks.length === 0) chunks.push(current);
  return chunks;
}

export function squash(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

export function describeItem(item: Item): { [key: string]: Json } {
  const described: { [key: string]: Json } = {
    type: item.type,
    title: item.title,
    body: (item.body ?? "").slice(0, BODY_LIMIT),
  };
  if (item.type === "issue") return described;
  const chunks = chunk(
    handwrittenFirst(item.files).map((file) => filePatch(file)),
    PATCH_BUDGET,
  );
  const [first = ""] = chunks;
  return {
    ...described,
    files: fileList(item.files),
    patch:
      chunks.length > 1
        ? `${first}[... the rest of the diff is omitted]\n`
        : first,
  };
}

export function contextText(
  ...parts: (string | undefined)[]
): string | undefined {
  const text = parts
    .filter((part) => part !== undefined)
    .map(squash)
    .join("\n\n");
  return text || undefined;
}
