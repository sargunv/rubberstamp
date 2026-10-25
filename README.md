# Rubberstamp

Rubberstamp is a GitHub App that labels new issues and pull requests, using the
label descriptions your repository already has and TypeSafe's
[Jev](https://docs.typesafe.ai) model. Its
[dashboard](https://rubberstamp.sargunv.dev) shows what it labeled and previews
how a config would label your recent items.

It's free for public repositories. Private repositories are by invitation.

## Get started

1. Install [Rubberstamp Bot](https://github.com/apps/rubberstamp-bot).
2. Give your labels clear descriptions on GitHub.
3. Add `.config/rubberstamp.yml` to the default branch:

```yaml
version: 1
context: |
  What this repository is and how its titles are written, to help judge each
  issue and pull request.

labels:
  groups:
    kind: { min: 1, max: 1, labels: [bug, feature, chore] }
    area: { labels: ["area:*"] }
```

Each group lists labels by name or pattern, each of which can map to the meaning
Jev reads in place of the GitHub description, as in `labels: [bug, { chore:
Maintenance that fixes nothing. }]`. An exact name takes its meaning ahead of a
pattern's. `min` and `max` bound how many of a group's labels an item gets; with
`overflow: drop`, an item that passes more than `max` gets none of them.

Rubberstamp asks Jev whether each label fits the item, and adds those that pass
the group's `threshold`: 0.65 for a group's own labels, or 0.5 for a group with
`max: 1`, which is asked as one choice.

A config without `version` is version 0, which Rubberstamp still reads. The
dashboard shows its version 1 equivalent.

## Rules

A group, a label, or a CI unit can have `rules` that decide before the score
does. Rubberstamp checks a label's group rules, then its own, and the first rule
whose `if` holds and whose `unless` doesn't applies or skips the label. When no
rule matches, `otherwise` decides: `fits` by default, or `apply` or `skip`. A
condition holds when all its keys do:

- `is`: the item is an `issue` or a `pr`.
- `files`: a changed file matches one of these globs, as in GitHub Actions path
  filters. An issue has no changed files.
- `fits`: the label or unit passes its own question, at its threshold or at the
  one given, as in `fits: 0.8`.
- `ask`: Jev answers yes to this question, as in `ask: { question: Is it a
  typo?, threshold: 0.3 }` (0.5 by default).

```yaml
binding:
  labels: ["binding:*"]
  rules:
    - unless:
        ask: { question: Is this about particular bindings?, threshold: 0.3 }
      then: skip
upstream:
  labels:
    - upstream:
        meaning: The work changes the vendored engine.
        rules: [{ if: { files: [patches/**] }, then: apply }]
        otherwise: skip
```

Every question goes into the same request, so a rule costs little.

## CI selection

Rubberstamp can also judge which parts of your CI each pull request push needs.
Name the coverage your workflows run as units in the config:

```yaml
ci:
  workflow: .github/workflows/ci.yml
  units:
    linux: { covers: Builds and tests everything on Linux. }
    macos:
      covers: Builds the Metal renderer and runs its tests on macOS.
      rules: [{ if: { files: [src/platform/apple/**] }, then: apply }]
```

A unit runs when Jev thinks the change needs it, unless one of its rules decides
first, as with labels. A plan job asks Rubberstamp for the plan, and later jobs
gate on unit ids. Pull requests get a plan; every other event runs everything,
as does any error or timeout.

`workflow` names the workflow file whose jobs gate on units. When a run of it
succeeds, the units it ran passed, and later pushes judge each unit only on what
changed since it last passed. Only that workflow's successes count as units
passing, so another workflow can't stand in for it; without `workflow`, every
push is judged on the whole pull request.

```yaml
jobs:
  plan:
    runs-on: ubuntu-latest
    outputs:
      all: ${{ steps.plan.outputs.all }}
      units: ${{ steps.plan.outputs.units }}
    steps:
      - id: plan
        uses: sargunv/rubberstamp/actions/plan@<commit sha>
        with:
          token: ${{ github.token }} # only private repositories need this

  macos:
    needs: plan
    if: fromJSON(needs.plan.outputs.all) || contains(fromJSON(needs.plan.outputs.units), 'macos')
    runs-on: macos-latest
    steps: [...]
```

A job skipped by its `if` passes required checks, so if the plan job itself
fails, every gated job looks green. Any aggregate or required job must also
check `needs.plan.result == 'success'`.

## Development

See [AGENTS.md](AGENTS.md) for how the code is laid out and the commands to
build, test, and run it.

## License

[AGPL-3.0-or-later](LICENSE). The hosted app has its own
[terms of use](https://rubberstamp.sargunv.dev/terms), and its
[privacy policy](https://rubberstamp.sargunv.dev/privacy) describes how it
handles data.
