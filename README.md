# Rubberstamp

Rubberstamp is a GitHub App that labels new issues and pull requests using
TypeSafe's [Jev](https://docs.typesafe.ai) model. Selecting which CI to run on
each pull request comes next. It's free for public repositories; private
repositories need to be on the allowlist.

## Set up a repository

1. Install [Rubberstamp Bot](https://github.com/apps/rubberstamp-bot) on the
   repository.
2. Give your labels clear descriptions on GitHub. Rubberstamp reads them.
3. Add `.github/rubberstamp.yml` to the default branch.

Rubberstamp reads the configuration only from the default branch, so a pull
request can't change how it is judged.

## Configuration

```yaml
# .github/rubberstamp.yml
context: |
  What this repository is, for every judgment: its parts, and the conventions
  that hint at a change's subject, such as Conventional Commit titles.

labels:
  context: Extra context for labeling only. # optional
  groups:
    kind: { min: 1, max: 1, labels: [bug, feature, perf, chore] }
    area: { min: 1, labels: ["area:*"] }
    binding:
      labels: ["binding:*"]
      rule: Only when the work is specific to this binding.
      threshold: 0.8 # optional
    platform: { labels: ["platform:*"], max: 2 }
  describe: # only where GitHub's 100-character description isn't enough
    area:upstream: A patch carried under `patches/`, or a submodule bump.
```

- Each group lists labels by name or by `*` pattern, matched against the
  repository's labels without regard to case.
- A label's meaning is its GitHub description unless `describe` overrides it.
- A group with `max: 1` and at least two labels asks one Choice over them, so
  its labels compete as mutually exclusive options. With `min: 0` the Choice
  also offers "none of these". Every other group asks one yes/no question (a
  Noul) per label.
- A group gets labels only when it has none when the item opens, so a label that
  a template, a bot, or a person set always wins.
- Labels at or above the threshold pass. The most likely of the rest fill the
  group to its `min` (default 0), and the least likely passing labels are cut to
  its `max` (default unlimited).
- Thresholds default to 0.5 for a Choice, where probabilities compete, and 0.8
  for Nouls.

## Limits

Each installation gets a monthly budget of Jev input tokens, about $1 of Jev,
and every installation shares a global monthly ceiling. An issue costs about
3,000 tokens and a large pull request 15,000 to 20,000, so the budget covers
roughly 1,000 to 8,000 items a month. Over either budget, Rubberstamp adds no
labels until the next UTC month.

## Data

Rubberstamp keeps a record of each item it labels: the labels it chose, their
scores, and the tokens spent. Records older than 180 days are deleted, and
removing a repository from the installation, or uninstalling, deletes its
records. Repositories without a configuration file store nothing.
