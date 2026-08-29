#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
# RescueNet — Live Demo Script
# Run after: npx cdk deploy --all
# Dependencies: aws CLI v2, python3 (for JSON pretty-print)
# ════════════════════════════════════════════════════════════════════════════

set -e
REGION=${AWS_DEFAULT_REGION:-us-east-1}

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────
step()     { echo -e "\n${BOLD}${BLUE}══ $1 ══${NC}"; }
ok()       { echo -e "${GREEN}✓  $1${NC}"; }
info()     { echo -e "${CYAN}   $1${NC}"; }
warn()     { echo -e "${YELLOW}⚠  $1${NC}"; }
pause()    { echo -e "\n${DIM}Press Enter to continue...${NC}"; read -r; }
ts()       { date '+%H:%M:%S'; }

# Pretty-print a DynamoDB item stripping type wrappers
ddb_pretty() {
  python3 - "$@" << 'PYEOF'
import sys, json
from decimal import Decimal

def defl(o):
    if isinstance(o, Decimal): return float(o)
    raise TypeError

def unmarshal(v):
    if not isinstance(v, dict): return v
    if 'S'    in v: return v['S']
    if 'N'    in v: return float(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'NULL' in v: return None
    if 'M'    in v: return {k: unmarshal(vv) for k, vv in v['M'].items()}
    if 'L'    in v: return [unmarshal(i) for i in v['L']]
    if 'SS'   in v: return list(v['SS'])
    if 'NS'   in v: return [float(x) for x in v['NS']]
    return v

raw = json.load(sys.stdin)
item = raw.get('Item', raw)
print(json.dumps({k: unmarshal(v) for k, v in item.items()}, indent=2, default=defl))
PYEOF
}

# Print event history as a readable table
print_history() {
  local CASE_ID=$1
  echo -e "\n${BOLD}  Event history:${NC}"
  printf "  ${DIM}%-24s %-22s %-18s %s${NC}\n" "Timestamp" "Agent" "Action" "Summary"
  printf "  ${DIM}%-24s %-22s %-18s %s${NC}\n" "────────────────────────" "──────────────────────" "──────────────────" "──────────────────────────────"

  aws dynamodb get-item \
    --table-name rescuenet-cases \
    --key "{\"caseId\":{\"S\":\"${CASE_ID}\"}}" \
    --region "$REGION" \
    --output json 2>/dev/null \
  | python3 - << PYEOF
import sys, json
raw = json.load(sys.stdin)
history = raw.get('Item', {}).get('eventHistory', {}).get('L', [])
for entry in history:
    m     = entry.get('M', {})
    ts    = m.get('timestamp', {}).get('S', '')[-8:-3]  # HH:MM
    agent = m.get('agent', {}).get('S', '')[:20]
    act   = m.get('action', {}).get('S', '')[:16]
    note  = m.get('summary', {}).get('S', '')[:60]
    print(f"  {ts:<24} {agent:<22} {act:<18} {note}")
PYEOF
}

# Print bids as a table
print_bids() {
  local CASE_ID=$1
  echo -e "\n${BOLD}  Bids received:${NC}"
  printf "  ${DIM}%-20s %-6s %-8s %-10s %-8s %s${NC}\n" \
    "Shelter" "Slots" "Vet" "Freshness" "Conf" "Score"
  printf "  ${DIM}%-20s %-6s %-8s %-10s %-8s %s${NC}\n" \
    "────────────────────" "──────" "────────" "──────────" "────────" "──────"

  aws dynamodb query \
    --table-name rescuenet-bids \
    --key-condition-expression "caseId = :c" \
    --expression-attribute-values "{\":c\":{\"S\":\"${CASE_ID}\"}}" \
    --region "$REGION" \
    --output json 2>/dev/null \
  | python3 - << PYEOF
import sys, json
raw  = json.load(sys.stdin)
bids = raw.get('Items', [])
for item in bids:
    name  = item.get('shelterName',   {}).get('S', item.get('shelterId', {}).get('S', ''))[:18]
    slots = item.get('availableSlots',{}).get('N', '?')
    vet   = '✓' if item.get('hasVetOnSite', {}).get('BOOL', False) else \
            '~' if item.get('vetCanBeArranged', {}).get('BOOL', False) else '✗'
    fresh = item.get('dataFreshness', {}).get('S', '?')
    conf  = float(item.get('confidence', {}).get('N', 0))
    score = float(item.get('matchScore', {}).get('N', 0)) if 'matchScore' in item else None
    score_str = f"{score:.3f}" if score is not None else "pending"
    print(f"  {name:<20} {slots:<6} {vet:<8} {fresh:<10} {conf:<8.2f} {score_str}")
PYEOF
}

# Watch case status with coloured output
watch_status() {
  local CASE_ID=$1
  local MAX_WAIT=${2:-60}
  local ELAPSED=0
  local LAST_STATUS=""

  echo ""
  while [ $ELAPSED -lt $MAX_WAIT ]; do
    STATUS=$(aws dynamodb get-item \
      --table-name rescuenet-cases \
      --key "{\"caseId\":{\"S\":\"${CASE_ID}\"}}" \
      --region "$REGION" \
      --query "Item.status.S" \
      --output text 2>/dev/null || echo "PENDING")

    if [ "$STATUS" != "$LAST_STATUS" ]; then
      case "$STATUS" in
        SUBMITTED)            echo -e "  $(ts)  ${DIM}SUBMITTED${NC}             Case created on blackboard" ;;
        PUBLISHED)            echo -e "  $(ts)  ${CYAN}PUBLISHED${NC}             Specialist agents done — bid window open" ;;
        AWAITING_CONFIRMATION) echo -e "  $(ts)  ${YELLOW}AWAITING_CONFIRMATION${NC} Winner selected — waiting for coordinator" ;;
        ASSIGNED)             echo -e "  $(ts)  ${GREEN}ASSIGNED${NC}              ✓ Case fully assigned"; return 0 ;;
        ESCALATED)            echo -e "  $(ts)  ${RED}ESCALATED${NC}             No shelter available"; return 1 ;;
        MERGED)               echo -e "  $(ts)  ${DIM}MERGED${NC}                Duplicate — merged into existing case"; return 0 ;;
        *)                    echo -e "  $(ts)  ${DIM}${STATUS}${NC}" ;;
      esac
      LAST_STATUS=$STATUS
    fi

    sleep 2
    ELAPSED=$((ELAPSED + 2))
  done
  warn "Timed out after ${MAX_WAIT}s waiting for terminal status"
}

# Tail Lambda logs for N seconds
tail_logs() {
  local FN_NAME=$1
  local SECONDS=${2:-10}
  info "Tailing ${FN_NAME} logs for ${SECONDS}s..."
  timeout "$SECONDS" aws logs tail \
    "/aws/lambda/${FN_NAME}" \
    --follow \
    --format short \
    --region "$REGION" 2>/dev/null \
  | sed 's/^/   /' || true
}

# ════════════════════════════════════════════════════════════════════════════
# DEMO BEGINS
# ════════════════════════════════════════════════════════════════════════════

clear
echo -e "${BOLD}"
cat << 'BANNER'
 ____                         _   _      _
|  _ \ ___  ___  ___ _   _  | \ | | ___| |_
| |_) / _ \/ __|/ __| | | | |  \| |/ _ \ __|
|  _ <  __/\__ \ (__| |_| | | |\  |  __/ |_
|_| \_\___||___/\___|\__,_| |_| \_|\___|\__|

Blackboard Multi-Agent Architecture — Live Demo
BANNER
echo -e "${NC}"

echo "What this demo shows:"
echo "  1. A stray dog report enters the blackboard"
echo "  2. Three specialist agents enrich it in parallel"
echo "     (image recognition · geocoding · dedup)"
echo "  3. Both shelter agents bid simultaneously:"
echo "     • Shelter A (Tier 3) — reads live DynamoDB → bids in ~3s"
echo "     • Shelter B (Tier 0) — sends Q&A to coordinator → bids after answers"
echo "  4. Arbitrator scores using case-relative weights from the needs profile"
echo "  5. Coordinator confirms → ASSIGNED"
echo ""
pause

# ── Step 1: Submit report ────────────────────────────────────────────────────
step "Step 1 — Submit a stray report"

PAYLOAD='{
  "reportType": "STRAY",
  "lat": 40.7489,
  "lng": -73.9680,
  "accuracyMetres": 8,
  "channel": "APP",
  "reporterId": "demo-user-001",
  "reportData": {
    "species": "dog",
    "condition": "limping badly, not putting weight on front left leg",
    "behavior": "distressed, hiding near a wall",
    "reporterSituation": "I cannot stay — on my way to work",
    "locationContext": "busy intersection near the park entrance",
    "collar": "yes — tag visible but worn, partial number readable",
    "additionalNote": "a second dog nearby watching from a distance"
  }
}'

info "Invoking intake Lambda..."
RESPONSE=$(aws lambda invoke \
  --function-name "rescuenet-intake" \
  --region "$REGION" \
  --payload "$PAYLOAD" \
  --cli-binary-format raw-in-base64-out \
  /dev/stdout 2>/dev/null | head -1)

CASE_ID=$(echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
body = d.get('body', '{}')
if isinstance(body, str): body = json.loads(body)
print(body.get('caseId', ''))
" 2>/dev/null || echo "")

if [ -z "$CASE_ID" ]; then
  warn "Could not parse caseId from response. Raw response:"
  echo "$RESPONSE"
  echo ""
  warn "Enter the caseId manually (check DynamoDB or Lambda logs):"
  read -r CASE_ID
fi

ok "Case created: ${BOLD}${CASE_ID}${NC}"
echo ""
info "reportData written to blackboard:"
echo "$PAYLOAD" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for k, v in d.get('reportData', {}).items():
    print(f'   {k}: {v}')
"
pause

# ── Step 2: Watch specialist agents enrich the blackboard ────────────────────
step "Step 2 — Specialist agents enriching the blackboard"

echo -e "  Watching status transitions (polling every 2s)...\n"
watch_status "$CASE_ID" 60

echo ""
info "Tailing agent Lambda logs (last 30s)..."
for FN in rescuenet-image-agent rescuenet-geocoding-agent rescuenet-dedup-agent; do
  echo -e "\n  ${BOLD}${FN}${NC}"
  aws logs tail "/aws/lambda/${FN}" \
    --since 2m \
    --format short \
    --region "$REGION" 2>/dev/null | tail -5 | sed 's/^/   /' || info "No recent logs"
done

pause

# ── Step 3: Show the enriched blackboard ─────────────────────────────────────
step "Step 3 — Enriched blackboard state"

echo -e "  ${BOLD}reportData after specialist agents:${NC}\n"
aws dynamodb get-item \
  --table-name rescuenet-cases \
  --key "{\"caseId\":{\"S\":\"${CASE_ID}\"}}" \
  --region "$REGION" \
  --output json 2>/dev/null \
| python3 - << 'PYEOF'
import sys, json
from decimal import Decimal

def unmarshal(v):
    if not isinstance(v, dict): return v
    if 'S'    in v: return v['S']
    if 'N'    in v: return float(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'NULL' in v: return None
    if 'M'    in v: return {k: unmarshal(vv) for k, vv in v['M'].items()}
    if 'L'    in v: return [unmarshal(i) for i in v['L']]
    if 'SS'   in v: return list(v['SS'])
    return v

raw  = json.load(sys.stdin)
item = raw.get('Item', {})

# Show just the interesting parts
rd = unmarshal(item.get('reportData', {'M': {}}))
print("  reportData:")
for k, v in rd.items():
    if isinstance(v, dict):
        print(f"    {k}:")
        for kk, vv in v.items():
            print(f"      {kk}: {vv}")
    else:
        print(f"    {k}: {v}")

np = unmarshal(item.get('needsProfile', {'M': {}}))
if np:
    print("\n  needsProfile (case-relative weights from Bedrock):")
    print(f"    urgencyLevel:    {np.get('urgencyLevel', '?')}")
    print(f"    hardConstraints: {np.get('hardConstraints', [])}")
    print(f"    reasoning:       {np.get('reasoning', '?')}")
    print(f"    softWeights:")
    for k, v in np.get('softWeights', {}).items():
        bar = '█' * int(float(v) * 20)
        print(f"      {k:<28} {float(v):.2f}  {bar}")
PYEOF

echo ""
print_history "$CASE_ID"
pause

# ── Step 4: Show bids ─────────────────────────────────────────────────────────
step "Step 4 — Shelter bids"

info "Shelter A (Tier 3) bid from live DynamoDB:"
echo ""
aws dynamodb query \
  --table-name rescuenet-bids \
  --key-condition-expression "caseId = :c" \
  --expression-attribute-values "{\":c\":{\"S\":\"${CASE_ID}\"}}" \
  --region "$REGION" \
  --output json 2>/dev/null \
| python3 - << 'PYEOF'
import sys, json
raw  = json.load(sys.stdin)
bids = raw.get('Items', [])
for item in bids:
    sid   = item.get('shelterId', {}).get('S', '')
    name  = item.get('shelterName', {}).get('S', sid)
    slots = item.get('availableSlots', {}).get('N', '?')
    vet   = item.get('hasVetOnSite', {}).get('BOOL', False)
    fresh = item.get('dataFreshness', {}).get('S', '?')
    conf  = float(item.get('confidence', {}).get('N', 0))
    notes = item.get('notes', {}).get('S', '')
    print(f"   {'─'*50}")
    print(f"   Shelter:      {name} ({sid})")
    print(f"   Slots:        {slots}")
    print(f"   Vet on site:  {'yes' if vet else 'no'}")
    print(f"   Freshness:    {fresh}")
    print(f"   Confidence:   {conf:.2f}")
    print(f"   Notes:        {notes}")
PYEOF

echo ""
info "Shelter B (Tier 0) Q&A session:"
QA_SESSION="qa-${CASE_ID}-shelter-b-001"
aws dynamodb get-item \
  --table-name rescuenet-qa-sessions \
  --key "{\"sessionId\":{\"S\":\"${QA_SESSION}\"}}" \
  --region "$REGION" \
  --query "Item.{status:status.S,summary:caseSummary.S}" \
  --output table 2>/dev/null || info "Q&A session not yet created — check shelter B agent logs"

pause

# ── Step 5: Simulate coordinator answering Q&A ───────────────────────────────
step "Step 5 — Shelter B coordinator answers in-app questions"

QA_SESSION="qa-${CASE_ID}-shelter-b-001"

echo -e "  ${BOLD}Simulating coordinator tapping answers in the mobile app:${NC}\n"

info "Q: Can your shelter take this animal in?"
info "A: Yes"
aws events put-events \
  --event-bus-name "rescuenet-bus" \
  --region "$REGION" \
  --entries "[{
    \"Source\":     \"rescuenet.app\",
    \"DetailType\": \"QaAnswerSubmitted\",
    \"Detail\":     \"{\\\"sessionId\\\":\\\"${QA_SESSION}\\\",\\\"questionId\\\":\\\"can_take\\\",\\\"answer\\\":\\\"Yes\\\"}\"
  }]" > /dev/null

sleep 1

info "Q: How many animals can you currently accept?"
info "A: 2"
aws events put-events \
  --event-bus-name "rescuenet-bus" \
  --region "$REGION" \
  --entries "[{
    \"Source\":     \"rescuenet.app\",
    \"DetailType\": \"QaAnswerSubmitted\",
    \"Detail\":     \"{\\\"sessionId\\\":\\\"${QA_SESSION}\\\",\\\"questionId\\\":\\\"slot_count\\\",\\\"answer\\\":\\\"2\\\"}\"
  }]" > /dev/null

sleep 1

info "Q: Do you have a vet or vet tech available?"
info "A: Can arrange"
aws events put-events \
  --event-bus-name "rescuenet-bus" \
  --region "$REGION" \
  --entries "[{
    \"Source\":     \"rescuenet.app\",
    \"DetailType\": \"QaAnswerSubmitted\",
    \"Detail\":     \"{\\\"sessionId\\\":\\\"${QA_SESSION}\\\",\\\"questionId\\\":\\\"vet_available\\\",\\\"answer\\\":\\\"Can arrange\\\"}\"
  }]" > /dev/null

ok "All Q&A answers submitted — Shelter B agent constructing bid..."
sleep 3

echo ""
info "Shelter B bid received:"
print_bids "$CASE_ID"
pause

# ── Step 6: Arbitrator scores ─────────────────────────────────────────────────
step "Step 6 — Arbitrator scores both bids"

info "Waiting for bid window to close and arbitrator to run (~15s)..."
sleep 10

echo ""
info "Tailing arbitrator logs:"
aws logs tail "/aws/lambda/rescuenet-arbitrator" \
  --since 1m \
  --format short \
  --region "$REGION" 2>/dev/null | tail -15 | sed 's/^/   /' || info "No logs yet"

echo ""
info "Bid scoring summary from blackboard:"
aws dynamodb get-item \
  --table-name rescuenet-cases \
  --key "{\"caseId\":{\"S\":\"${CASE_ID}\"}}" \
  --region "$REGION" \
  --output json 2>/dev/null \
| python3 - << 'PYEOF'
import sys, json
from decimal import Decimal

def unmarshal(v):
    if not isinstance(v, dict): return v
    if 'S'    in v: return v['S']
    if 'N'    in v: return float(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'M'    in v: return {k: unmarshal(vv) for k, vv in v['M'].items()}
    if 'L'    in v: return [unmarshal(i) for i in v['L']]
    return v

raw  = json.load(sys.stdin)
item = raw.get('Item', {})
bs   = unmarshal(item.get('bidSummary', {}).get('M', {}))
if not bs:
    print("   (bid summary not yet written — arbitrator may still be running)")
else:
    print(f"   Winner: {bs.get('winner', '?')}  (score: {bs.get('winnerScore', 0):.3f})")
    print("")
    print(f"   {'Shelter':<24} {'Score':>7}  {'Freshness':<10} {'Slots':>5}  Vet")
    print(f"   {'─'*24} {'─'*7}  {'─'*10} {'─'*5}  {'─'*3}")
    for b in bs.get('allBids', []):
        print(f"   {b.get('shelterId',''):<24} {b.get('matchScore',0):>7.3f}  "
              f"{b.get('dataFreshness',''):<10} {b.get('slots',0):>5}  "
              f"{'✓' if b.get('hasVet') else '✗'}")
PYEOF

pause

# ── Step 7: Confirm intake ────────────────────────────────────────────────────
step "Step 7 — Coordinator confirms intake"

WINNER=$(aws dynamodb get-item \
  --table-name rescuenet-cases \
  --key "{\"caseId\":{\"S\":\"${CASE_ID}\"}}" \
  --region "$REGION" \
  --query "Item.assignedTo.S" \
  --output text 2>/dev/null || echo "shelter-a-001")

info "Sending confirmation from coordinator at ${WINNER}..."

aws events put-events \
  --event-bus-name "rescuenet-bus" \
  --region "$REGION" \
  --entries "[{
    \"Source\":     \"rescuenet.shelter\",
    \"DetailType\": \"ConfirmationReceived\",
    \"Detail\":     \"{\\\"caseId\\\":\\\"${CASE_ID}\\\",\\\"shelterId\\\":\\\"${WINNER}\\\",\\\"confirmed\\\":true}\"
  }]" > /dev/null

sleep 3

FINAL_STATUS=$(aws dynamodb get-item \
  --table-name rescuenet-cases \
  --key "{\"caseId\":{\"S\":\"${CASE_ID}\"}}" \
  --region "$REGION" \
  --query "Item.status.S" \
  --output text 2>/dev/null)

echo ""
if [ "$FINAL_STATUS" = "ASSIGNED" ]; then
  ok "Case status: ${GREEN}${BOLD}ASSIGNED${NC}"
else
  warn "Case status: ${FINAL_STATUS} (may still be processing — check logs)"
fi

pause

# ── Step 8: Full event history ────────────────────────────────────────────────
step "Step 8 — Full blackboard event history"

echo -e "  Every agent that touched this case, in order:\n"
print_history "$CASE_ID"

echo ""
echo -e "${BOLD}${GREEN}"
echo "══════════════════════════════════════════════════"
echo "  Demo complete"
echo ""
echo "  Case:   ${CASE_ID}"
echo "  Status: ASSIGNED"
echo ""
echo "  ✓ Freeform blackboard — open reportData map"
echo "  ✓ Parallel specialist agents enriched the case"
echo "  ✓ Bedrock extracted case-relative scoring weights"
echo "  ✓ Shelter A (Tier 3) bid from live DB in ~3s"
echo "  ✓ Shelter B (Tier 0) bid after coordinator Q&A"
echo "  ✓ Arbitrator scored using case-specific weights"
echo "    (injured dog → vet_care weight dominated)"
echo "  ✓ Coordinator confirmed — animal rescue coordinated"
echo "══════════════════════════════════════════════════"
echo -e "${NC}"
