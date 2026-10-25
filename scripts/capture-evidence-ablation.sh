#!/usr/bin/env bash
# Hard Stop 4 evidence: a FRESH CLONE of the committed code, run under Node 20, with the ablation repeated and its
# result hashes compared, and the pre-registered annotation files checked against the commits that introduced them.
#   scripts/capture-evidence-ablation.sh <output-file> [node-major, default 20]
set -u
OUT="${1:?usage: capture-evidence-ablation.sh <output-file> [node-major]}"; NODE_MAJOR="${2:-20}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"; mkdir -p "$(dirname "$OUT")"; OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
git clone -q "$SRC" "$WORK/repo" || exit 1; cd "$WORK/repo" || exit 1
RUN() { npx --yes -p "node@${NODE_MAJOR}" -c "$1"; }
step() { echo; echo "\$ $1"; RUN "$1" 2>&1 | grep -v -E "^npm (notice|warn)"; echo "exit code: ${PIPESTATUS[0]}"; }
{
  echo "# Hard Stop 4 ablation evidence (fresh clone, Node ${NODE_MAJOR})"
  echo "Captured: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "Source: git clone of the local repository at commit $(git rev-parse HEAD) on branch $(git rev-parse --abbrev-ref HEAD)"
  echo "Machine: $(uname -sm), default node $(node -v); Node used below: $(RUN 'node -v')"
  step "npm ci"; step "npm run typecheck"; step "npm test"
  echo; echo "# Repeated execution of the pre-registered ablation: three runs, result hashes must be identical"
  for i in 1 2 3; do RUN "node_modules/.bin/ts-node scripts/run-ablation.ts --out $WORK/abl-$i.json" 2>&1 | grep -E "^result hash" | sed "s/^/run $i: /"; done
  echo "# Post-hoc variant (zero-slot bids removed), three runs"
  for i in 1 2 3; do RUN "node_modules/.bin/ts-node scripts/run-ablation.ts --production-bids --out $WORK/ph-$i.json" 2>&1 | grep -E "^result hash" | sed "s/^/run $i: /"; done
  echo; echo "# Full pre-registered output"; RUN "node_modules/.bin/ts-node scripts/run-ablation.ts --out $WORK/abl-full.json" 2>&1 | grep -v "^npm"
  echo; echo "# Pre-registration checks: each annotation file is byte-identical to the commit that first added it"
  for f in eval/annotations.json eval/annotations-set2.json; do
    FIRST="$(git log --diff-filter=A --format=%H -- $f | tail -1)"
    echo "$f first added in $(git log -1 --format='%h %ad' --date=iso "$FIRST")"
    echo "  at that commit: $(git show "$FIRST:$f" | shasum -a 256 | cut -d' ' -f1)"
    echo "  now           : $(shasum -a 256 $f | cut -d' ' -f1)"
  done
  echo "pre-registration document first committed: $(git log --diff-filter=A --format='%h %ad' --date=iso -- docs/ABLATION_PREREGISTRATION.md | tail -1)"
  echo "first commit of the ablation code:        $(git log --diff-filter=A --format='%h %ad' --date=iso -- eval/ablation.ts | tail -1)"
  echo "ablation results first committed:         $(git log --diff-filter=A --format='%h %ad' --date=iso -- eval/results/ablation.json | tail -1)"
} > "$OUT" 2>&1
echo "wrote $OUT"
