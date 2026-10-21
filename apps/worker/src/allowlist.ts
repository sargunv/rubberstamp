/** Repositories named `owner/repo`, and every repository of an `owner/*`. */
export type Allowlist = {
  owners: ReadonlySet<string>;
  repos: ReadonlySet<string>;
};

const ENTRY = /^([a-z0-9-]+)\/([a-z0-9._-]+|\*)$/;

export function parseAllowlist(text: string): Allowlist {
  const owners = new Set<string>();
  const repos = new Set<string>();
  for (const raw of text.split(",")) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    const match = entry.match(ENTRY);
    if (!match?.[1]) {
      throw new Error(
        `Invalid allowlist entry "${raw.trim()}": expected owner/repo or owner/*.`,
      );
    }
    if (match[2] === "*") owners.add(match[1]);
    else repos.add(entry);
  }
  return { owners, repos };
}

export function allowlisted(allowlist: Allowlist, fullName: string): boolean {
  const name = fullName.toLowerCase();
  const [owner = ""] = name.split("/");
  return allowlist.owners.has(owner) || allowlist.repos.has(name);
}
