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

## Development

See [AGENTS.md](AGENTS.md) for how the code is laid out and the commands to
build, test, and run it.
