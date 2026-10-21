#!/usr/bin/env bash
# Asks Rubberstamp which CI units a pull request's head needs and sets the
# step's `all` and `units` outputs. Skipping coverage only saves time, so
# anything unexpected runs every unit rather than failing the job.
set -uo pipefail

base_url="${RUBBERSTAMP_URL:-https://rubberstamp.sargunv.dev}"
base_url="${base_url%/}"
token="${RUBBERSTAMP_TOKEN:-}"
timeout="${RUBBERSTAMP_TIMEOUT:-600}"
summary_file="${GITHUB_STEP_SUMMARY:-/dev/null}"
# Polling never waits longer than this between requests, whatever the server
# asks for, so a timeout lands close to when it should.
max_wait=60

summary() { printf '%s\n' "$@" >> "$summary_file"; }

finish() {
  printf 'all=%s\nunits=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"
  exit 0
}

# Runs every unit, warning when something went wrong rather than by design.
everything() {
  local reason="$1" level="$2" dashboard="${3:-}"
  echo "::${level} title=Rubberstamp::Running every unit: ${reason}"
  summary "### Rubberstamp CI plan" "" "Running every unit: ${reason}."
  if [[ -n "$dashboard" ]]; then summary "" "[Dashboard](${dashboard})"; fi
  finish true '[]'
}

case "${GITHUB_EVENT_NAME:-}" in
  pull_request | pull_request_target) ;;
  *)
    echo "Not a pull request (${GITHUB_EVENT_NAME:-unknown event}), so every unit runs."
    summary "### Rubberstamp CI plan" "" \
      "Running every unit: \`${GITHUB_EVENT_NAME:-unknown}\` events aren't planned."
    finish true '[]'
    ;;
esac

for tool in curl jq; do
  command -v "$tool" > /dev/null || everything "$tool isn't installed" warning
done

if ! [[ "$timeout" =~ ^[0-9]+$ ]]; then
  echo "::warning title=Rubberstamp::timeout must be whole seconds; using 600"
  timeout=600
fi

# The head, not GITHUB_SHA: that's the merge commit, which no plan is for.
number=$(jq -er '.pull_request.number | numbers' "${GITHUB_EVENT_PATH:-}" 2> /dev/null) ||
  everything "couldn't read the pull request from the event" warning
sha=$(jq -er '.pull_request.head.sha | strings' "${GITHUB_EVENT_PATH:-}" 2> /dev/null) ||
  everything "couldn't read the pull request from the event" warning

# The run asking, so Rubberstamp can tell which units passed once it succeeds.
# Without them the plan still works; only that record is lost.
run_id="${GITHUB_RUN_ID:-}"
run_attempt="${GITHUB_RUN_ATTEMPT:-}"
if ! [[ "$run_id" =~ ^[1-9][0-9]*$ && "$run_attempt" =~ ^[1-9][0-9]*$ ]]; then
  run_id=""
fi

response=$(mktemp)
trap 'rm -f "$response"' EXIT

# Prints the HTTP status, leaving the body in $response. The token goes in
# through stdin so it never shows in the process list. curl restarts
# --max-time on each retry, so both it and the retries stop at the deadline.
ask() {
  local body left=$((deadline - SECONDS))
  ((left < 1)) && left=1
  body=$(jq -nc \
    --arg repository "${GITHUB_REPOSITORY:-}" \
    --argjson pull_request "$number" \
    --arg sha "$sha" \
    --argjson start "$1" \
    --arg run_id "$run_id" \
    --arg run_attempt "$run_attempt" \
    '{$repository, $pull_request, $sha, $start}
      + if $run_id == "" then {} else
          {run_id: ($run_id | tonumber), run_attempt: ($run_attempt | tonumber)}
        end')
  if [[ -n "$token" ]]; then
    printf 'header = "Authorization: Bearer %s"\n' "$token"
  fi | curl --config - --silent --show-error \
    --max-time $((left < 30 ? left : 30)) \
    --retry 2 --retry-delay 2 --retry-max-time "$left" \
    --header 'Content-Type: application/json' \
    --data "$body" \
    --output "$response" --write-out '%{http_code}' \
    "${base_url}/ci/plan"
}

report() {
  local all units dashboard reason
  jq -e '
    .status == "ready"
    and (.all | type == "boolean")
    and (.units | type == "array" and all(type == "string"))
    and (.decisions // [] | type == "array")
  ' "$response" > /dev/null 2>&1 || everything "Rubberstamp sent a malformed plan" warning
  all=$(jq -r '.all' "$response")
  units=$(jq -c '.units' "$response")
  dashboard=$(jq -r '.url // empty' "$response")
  reason=$(jq -r '.reason // empty' "$response")
  # A reason means there was no plan to follow, such as no ci config.
  if [[ -n "$reason" ]]; then everything "$reason" notice "$dashboard"; fi

  echo "Units that run: ${units} (all: ${all})"
  summary "### Rubberstamp CI plan" ""
  if [[ "$all" == true ]]; then
    summary "Running every unit for ${sha:0:7}."
  else
    summary "Running $(jq -r '"\(.units | length) of \(.decisions | length)"' "$response") units for ${sha:0:7}."
  fi
  summary "" "| Unit | Runs | Why |" "| --- | --- | --- |"
  jq -r '
    .decisions // [] | .[]
    | (if .score == null then null else (.score * 100 | round) / 100 end) as $score
    | [
        (if .rule != "" then .rule else empty end),
        (if $score == null then empty else "score \($score), threshold \(.threshold)" end)
      ] as $why
    | "| `\(.unit)` | \(if .run then "run" else "skip" end) | \($why | join("; ") | gsub("\\|"; "\\|")) |"
  ' "$response" >> "$summary_file" 2> /dev/null
  if [[ -n "$dashboard" ]]; then summary "" "[Dashboard](${dashboard})"; fi
  finish "$all" "$units"
}

deadline=$((SECONDS + timeout))
start=true
dashboard=""
while :; do
  status=$(ask "$start") || everything "couldn't reach Rubberstamp" warning
  # Only the first request queues a plan, so polling doesn't queue more.
  start=false
  case "$status" in
    200) report ;;
    202)
      jq -e '.status == "pending"' "$response" > /dev/null 2>&1 ||
        everything "Rubberstamp sent a malformed reply" warning
      dashboard=$(jq -r '.url // empty' "$response")
      wait=$(jq -r '.retryAfter | numbers | floor' "$response" 2> /dev/null)
      [[ "$wait" =~ ^[0-9]+$ ]] || wait=10
      ((wait < 1)) && wait=1
      ((wait > max_wait)) && wait=$max_wait
      ;;
    *)
      error=$(jq -r '.error | strings' "$response" 2> /dev/null)
      everything "Rubberstamp answered ${status}${error:+: ${error}}" warning
      ;;
  esac
  remaining=$((deadline - SECONDS))
  if ((remaining <= 0)); then
    everything "no plan after ${timeout}s" warning "$dashboard"
  fi
  echo "Waiting for the plan; asking again in $((wait < remaining ? wait : remaining))s."
  sleep $((wait < remaining ? wait : remaining))
done
