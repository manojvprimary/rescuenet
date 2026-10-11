#!/usr/bin/env bash
# Captures reproducibility evidence from a FRESH CLONE of the committed code, under a chosen Node major version.
# Every line of the output file is real command output; exit codes are recorded by the script, never typed.
#   Usage: scripts/capture-evidence.sh <output-file> [node-major, default 20]
set -u
OUT="${1:?usage: capture-evidence.sh <output-file> [node-major]}"
NODE_MAJOR="${2:-20}"
mkdir -p "$(dirname "$OUT")"
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git clone -q "$SRC" "$WORK/repo" || exit 1
cd "$WORK/repo" || exit 1
RUN() { npx --yes -p "node@${NODE_MAJOR}" -c "$1"; }
step() { echo; echo "\$ $1"; RUN "$1" 2>&1 | grep -v -E "^npm (notice|warn)" ; echo "exit code: ${PIPESTATUS[0]}"; }
{
  echo "# Hard Stop 3 validation evidence (fresh clone, Node ${NODE_MAJOR})"
  echo "Captured: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "Source: git clone of the local repository at commit $(git rev-parse HEAD) on branch $(git rev-parse --abbrev-ref HEAD)"
  echo "Machine: $(uname -sm), default node $(node -v), npm $(npm -v)"
  echo "Node used for every command below: $(RUN 'node -v')"
  step "npm ci"
  step "npm run typecheck"
  step "npm test"
  step "npm run smoke"
  echo; echo "# AHP consistency check of the adopted judgments (read-only)"
  step "node_modules/.bin/ts-node scripts/ahp-adopt.ts eval/ahp/evidence-informed-proposal.json"
  REC="$(ls eval/results/classifier-recorded-*.json | tail -1)"
  echo; echo "# Repeated execution: three runs each, result hashes must be identical"
  for i in 1 2 3; do echo; echo "\$ run-eval (rule-based classifier), run $i"; RUN "node_modules/.bin/ts-node scripts/run-eval.ts --classifier rule --out $WORK/rule-$i.json" 2>&1 | grep -E "^(weights|archetype|winner|single|result hash)"; done
  for i in 1 2 3; do echo; echo "\$ run-eval (recorded live Bedrock classifier output), run $i"; RUN "node_modules/.bin/ts-node scripts/run-eval.ts --classifier file:$REC --out $WORK/live-$i.json" 2>&1 | grep -E "^(weights|archetype|winner|single|result hash)"; done
  echo; echo "# Hash comparison"
  echo "rule runs:  $(for i in 1 2 3; do python3 -c "import json;print(json.load(open('$WORK/rule-$i.json'))['resultHash'][:16])"; done | sort | uniq -c | tr '\n' ' ')"
  echo "live runs:  $(for i in 1 2 3; do python3 -c "import json;print(json.load(open('$WORK/live-$i.json'))['resultHash'][:16])"; done | sort | uniq -c | tr '\n' ' ')"
  echo; echo "# Full evaluation table (recorded live classifier output, final vectors)"
  RUN "node_modules/.bin/ts-node scripts/run-eval.ts --classifier file:$REC --out $WORK/table.json" 2>&1 | grep -v -E "^npm"
  echo; echo "# Frozen v1 vs v2"
  RUN "node_modules/.bin/ts-node scripts/compare-v1-v2.ts --classifier file:$REC --out $WORK/cmp.json" 2>&1 | grep -v -E "^npm"
  echo; echo "# One-step AHP sensitivity (recorded live classifier output)"
  RUN "node_modules/.bin/ts-node scripts/run-sensitivity.ts --classifier file:$REC --out $WORK/sens.json" 2>&1 | grep -v -E "^npm"
  echo; echo "# Pre-registration check: the annotations in this clone are byte-identical to the first commit that added them"
  FIRST="$(git log --diff-filter=A --format=%H -- eval/annotations.json | tail -1)"
  git show "$FIRST:eval/annotations.json" | shasum -a 256 | awk '{print "first-commit sha256: "$1}'
  shasum -a 256 eval/annotations.json | awk '{print "current sha256:      "$1}'
  echo "first commit: $(git log -1 --format='%h %ad %s' --date=iso "$FIRST")"
} > "$OUT" 2>&1
echo "wrote $OUT"
