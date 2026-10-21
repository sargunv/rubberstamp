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
context: |
  What this repository is and how its titles are written, to help judge each
  issue and pull request.

labels:
  groups:
    kind: { min: 1, max: 1, labels: [bug, feature, chore] }
    area: { labels: ["area:*"] }
```

Each group lists labels by name or pattern. `min` and `max` bound how many of a
group's labels an item gets.

## CI selection

Rubberstamp can also judge which parts of your CI each pull request push needs.
Name the coverage your workflows run as units in the config:

```yaml
ci:
  units:
    linux: { covers: Builds and tests everything on Linux. }
    macos:
      covers: Builds the Metal renderer and runs its tests on macOS.
      paths: [src/platform/apple/**]
```

A unit runs when Jev thinks the change needs it or a changed file matches its
`paths`. A plan job asks Rubberstamp for the plan, and later jobs gate on unit
ids. Pull requests get a plan; every other event runs everything, as does any
error or timeout.

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
