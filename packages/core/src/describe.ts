import type { Json } from "./jev.ts";

export type PullFile = {
  filename: string;
  previous_filename?: string | undefined;
  status: string;
  additions: number;
  deletions: number;
  patch?: string | undefined;
};

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
// Lockfiles and generated files matter only in summary: which packages moved.
const SUMMARY_PATTERNS =
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

function fileHeader(file: PullFile): string {
  const before = file.previous_filename ?? file.filename;
  const lines = [`diff --git a/${before} b/${file.filename}`];
  if (file.status === "added") lines.push("new file");
  if (file.status === "removed") lines.push("deleted file");
  if (file.previous_filename) {
    lines.push(`rename from ${file.previous_filename}`);
    lines.push(`rename to ${file.filename}`);
  }
  return lines.join("\n") + "\n";
}

function truncate(file: PullFile, text: string): string {
  const summary =
    SUMMARY_PATTERNS.test(file.filename) || file.status === "removed";
  const limit = summary ? SUMMARY_FILE_LIMIT : FILE_LIMIT;
  if (text.length <= limit) return text;
  const omitted = text.slice(limit).split("\n").length - 1;
  return `${text.slice(0, limit)}\n[... ${omitted} more lines of this file's diff omitted]\n`;
}

export function filePatch(file: PullFile): string {
  const body =
    file.patch === undefined
      ? "[no textual diff: binary or too large to show]\n"
      : file.patch.endsWith("\n")
        ? file.patch
        : `${file.patch}\n`;
  return truncate(file, fileHeader(file) + body);
}

const SUBMODULE =
  /^-Subproject commit ([0-9a-f]{7})[0-9a-f]*\n\+Subproject commit ([0-9a-f]{7})/m;

function fileSummary(file: PullFile): string {
  const moved = file.patch?.match(SUBMODULE);
  if (moved) return `submodule ${moved[1]} → ${moved[2]}`;
  return `+${file.additions} -${file.deletions}`;
}

export function fileList(files: PullFile[]): string[] {
  const listed: string[] = [];
  let size = 0;
  for (const file of files) {
    const line = `${STATUS[file.status] ?? "M"} ${file.filename} (${fileSummary(file)})`;
    size += line.length + 4;
    if (size > FILE_LIST_LIMIT) {
      listed.push(`... and ${files.length - listed.length} more changed files`);
      break;
    }
    listed.push(line);
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
  const chunks = chunk(item.files.map(filePatch), PATCH_BUDGET);
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
