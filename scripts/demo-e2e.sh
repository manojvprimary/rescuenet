#!/bin/bash
# RescueNet end-to-end demo for the CURRENT architecture (tier-1 API shelters + tier-2 Slack shelters).
# Replaces scripts/demo.sh for live runs: that script simulates the old in-app Q&A and cannot complete today.
#
#   scripts/demo-e2e.sh                      interactive: press Enter between steps (for recording)
#   scripts/demo-e2e.sh --auto               no pauses; simulates the Slack coordinator replies and the confirmation
#   scripts/demo-e2e.sh --scenario=loose     injured_loose (default) | injured | loose | routine
#   scripts/demo-e2e.sh --no-simulate        do NOT simulate coordinator replies (answer in Slack yourself)
#   --lat=40.7 --lng=-73.9                   override the report location
# Re-running the SAME scenario within 3 hours at the same place is merged as a duplicate by the dedup agent
# (1 km / 3 h window); use a different --scenario or --lat/--lng.
#
# What it touches: your deployed AWS account only. It creates ONE case, and the tier-2 agent will post that case
# into the tier-2 shelters' Slack channels (that is the system's normal behaviour). Nothing is deleted or deployed.
# Needs: aws CLI v2 with credentials, python3.

set -u
REGION=${AWS_DEFAULT_REGION:-us-east-1}
AUTO=0; SIMULATE=1; SCENARIO=injured_loose; LAT_OVR=""; LNG_OVR=""
for a in "$@"; do
  case "$a" in
    --auto) AUTO=1 ;;
    --no-simulate) SIMULATE=0 ;;
    --scenario=*) SCENARIO="${a#*=}" ;;
    --lat=*) LAT_OVR="${a#*=}" ;;
    --lng=*) LNG_OVR="${a#*=}" ;;
    *) echo "unknown option $a"; exit 2 ;;
  esac
done

BOLD='\033[1m'; DIM='\033[2m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BLUE='\033[0;34m'; NC='\033[0m'
step()  { echo -e "\n${BOLD}${BLUE}== $1 ==${NC}"; }
ok()    { echo -e "${GREEN}OK   $1${NC}"; }
info()  { echo -e "${CYAN}     $1${NC}"; }
warn()  { echo -e "${YELLOW}WARN $1${NC}"; }
fail()  { echo -e "${RED}FAIL $1${NC}"; }
pause() { if [ "$AUTO" = "0" ] && [ -t 0 ]; then echo -e "\n${DIM}Press Enter to continue...${NC}"; read -r; fi; }
now_s() { date +%s; }

# DynamoDB item (typed JSON on stdin) -> plain JSON on stdout
unmarshal() {
  python3 -c '
import sys, json
def u(v):
    if not isinstance(v, dict): return v
    if "S" in v: return v["S"]
    if "N" in v:
        f = float(v["N"]); return int(f) if f.is_integer() else f
    if "BOOL" in v: return v["BOOL"]
    if "NULL" in v: return None
    if "M" in v: return {k: u(x) for k, x in v["M"].items()}
    if "L" in v: return [u(x) for x in v["L"]]
    if "SS" in v: return list(v["SS"])
    return v
raw = json.load(sys.stdin)
item = raw.get("Item", raw)
print(json.dumps({k: u(v) for k, v in item.items()}))
'
}
get_case() {
  aws dynamodb get-item --table-name rescuenet-cases --key "{\"caseId\":{\"S\":\"$CASE_ID\"}}" --region "$REGION" --output json 2>/dev/null | unmarshal
}
jget() { python3 -c "import sys,json; d=json.load(sys.stdin); v=d
for k in '$1'.split('.'):
    v = v.get(k) if isinstance(v, dict) else None
print('' if v is None else v)"; }

# ── Preflight ──────────────────────────────────────────────────────────────────────────────────────────────
step "Preflight"
command -v aws >/dev/null || { fail "aws CLI not found"; exit 3; }
aws sts get-caller-identity --region "$REGION" --query Arn --output text >/dev/null 2>&1 || { fail "AWS credentials not working"; exit 3; }
ok "AWS credentials work (region $REGION)"
for fn in intake needs-profile image-agent geocoding-agent dedup-agent tier1-agent tier2-agent arbitrator confirmation-handler; do
  aws lambda get-function --function-name "rescuenet-$fn" --region "$REGION" >/dev/null 2>&1 || { fail "rescuenet-$fn is not deployed"; exit 3; }
done
ok "All 9 pipeline Lambdas exist"
MODE=$(aws lambda get-function-configuration --function-name rescuenet-needs-profile --region "$REGION" --query "Environment.Variables.WEIGHTING_MODE" --output text 2>/dev/null)
[ "$MODE" = "None" ] || [ -z "$MODE" ] && MODE="(not set: original LLM-weighting behaviour)"
info "Deployed needs-profile WEIGHTING_MODE: $MODE"

# ── Step 1: submit ─────────────────────────────────────────────────────────────────────────────────────────
step "Step 1: Submit a report ($SCENARIO)"
case "$SCENARIO" in
  injured_loose) LAT=40.7580; LNG=-73.9855
    DATA='{"species":"dog","condition":"limping badly, not putting weight on front left leg, bleeding slightly","behavior":"distressed, keeps moving toward the road","reporterSituation":"I cannot stay or hold him, on my way to work","locationContext":"busy intersection near the park entrance"}' ;;
  injured) LAT=40.7150; LNG=-73.9843
    DATA='{"species":"cat","condition":"hit by a car, bleeding from the mouth, back leg dragging","behavior":"barely moving","reporterSituation":"I am holding her in a towel and can stay as long as needed","locationContext":"quiet side street"}' ;;
  loose) LAT=40.7430; LNG=-74.0030
    DATA='{"species":"dog","condition":"no visible injuries, looks healthy","behavior":"running loose next to the highway on-ramp, darting toward traffic","reporterSituation":"I cannot catch it or hold it","locationContext":"highway on-ramp"}' ;;
  routine) LAT=40.7736; LNG=-73.9566
    DATA='{"species":"cat","condition":"healthy, well fed","behavior":"calm, hanging around the porch for days","reporterSituation":"I have put out water and can keep an eye on her, no rush","locationContext":"residential porch"}' ;;
  *) fail "unknown scenario $SCENARIO"; exit 2 ;;
esac
[ -n "$LAT_OVR" ] && LAT="$LAT_OVR"; [ -n "$LNG_OVR" ] && LNG="$LNG_OVR"
PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'reportType':'STRAY','lat':$LAT,'lng':$LNG,'accuracyMetres':8,'channel':'APP','reporterId':'demo-e2e','reportData':json.loads(sys.argv[1])}))" "$DATA")
echo "$DATA" | python3 -c "import sys,json; [print(f'     {k}: {v}') for k,v in json.load(sys.stdin).items()]"
T0=$(now_s)
OUT=$(mktemp)
aws lambda invoke --function-name rescuenet-intake --region "$REGION" --payload "$PAYLOAD" --cli-binary-format raw-in-base64-out "$OUT" >/dev/null 2>&1
RESP=$(cat "$OUT"); rm -f "$OUT"
CASE_ID=$(echo "$RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin); b = d.get('body', d)
if isinstance(b, str): b = json.loads(b)
print(b.get('caseId', ''))" 2>/dev/null)
[ -n "$CASE_ID" ] || { fail "intake did not return a caseId. Raw: $RESP"; exit 1; }
ok "Case created: ${BOLD}$CASE_ID${NC}"
pause

# ── Step 2: enrichment ─────────────────────────────────────────────────────────────────────────────────────
step "Step 2: Specialist agents enrich the blackboard (parallel)"
LAST=""; STATUS=""
for i in $(seq 1 40); do
  STATUS=$(get_case | jget status)
  if [ "$STATUS" != "$LAST" ]; then echo -e "  +$(( $(now_s) - T0 ))s  ${BOLD}$STATUS${NC}"; LAST="$STATUS"; fi
  case "$STATUS" in PUBLISHED|AWAITING_CONFIRMATION|ASSIGNED|ESCALATED|MERGED) break ;; esac
  sleep 2
done
[ "$STATUS" = "MERGED" ] && { warn "Case was merged as a duplicate of a recent case within 1 km. Re-run with another --scenario."; exit 1; }
for i in $(seq 1 10); do get_case | python3 -c "import sys,json; sys.exit(0 if json.load(sys.stdin).get('needsProfile') else 1)" && break; sleep 2; done
pause

# ── Step 3: needs profile ──────────────────────────────────────────────────────────────────────────────────
step "Step 3: Needs profile (how this case weights the five factors)"
get_case | python3 -c "
import sys, json
c = json.load(sys.stdin); np = c.get('needsProfile')
if not np:
    print('     needsProfile not written yet'); sys.exit(0)
print('     urgency        :', np.get('urgencyLevel'))
print('     hard constraints:', ', '.join(np.get('hardConstraints', [])) or 'none')
print('     reasoning      :', np.get('reasoning'))
if np.get('weightingMode'):
    print('     weighting mode :', np['weightingMode'], '| weights version', np.get('weightsVersion'), '| fallback', np.get('usedFallback'))
    print('     archetype probs:', json.dumps(np.get('archetypeProbabilities')))
print('     weights:')
for k, v in np.get('softWeights', {}).items():
    print(f'        {k:<24}{v:>6.3f}  ' + '#' * int(round(v * 40)))
img = (c.get('reportData') or {}).get('imageAnalysis'); geo = (c.get('reportData') or {}).get('geocoding')
print('     image analysis : no photo sent in this demo; species taken from the report text')
print('     geocoding      :', (geo or {}).get('addressResolved', 'raw coordinates (no place index, known issue KI-08)'))
"
pause

# ── Step 4: bids (tier-1 live, tier-2 via Slack) ───────────────────────────────────────────────────────────
step "Step 4: Shelters bid (tier 1 from live capacity, tier 2 through Slack coordinators)"
sleep 4
SESS=$(aws dynamodb query --table-name rescuenet-qa-sessions --index-name caseId-index --key-condition-expression "caseId = :c" \
  --expression-attribute-values "{\":c\":{\"S\":\"$CASE_ID\"}}" --region "$REGION" --query "Items[].sessionId.S" --output text 2>/dev/null)
if [ -z "$SESS" ] || [ "$SESS" = "None" ]; then
  info "No tier-2 Slack sessions opened for this case (species or constraints filtered them out)."
else
  N=0
  for S in $SESS; do
    N=$((N+1)); info "Tier-2 Slack session opened: $S"
    if [ "$SIMULATE" = "1" ]; then
      if [ "$N" = "1" ]; then ANS="Yes|2|Can arrange"; else ANS="No|1|No"; fi
      IFS='|' read -r A1 A2 A3 <<< "$ANS"
      for QA in "can_take:$A1" "slot_count:$A2" "vet_available:$A3"; do
        QID="${QA%%:*}"; AN="${QA#*:}"
        ENTRY=$(python3 -c "import json,sys; print(json.dumps([{'Source':'rescuenet.app','DetailType':'QaAnswerSubmitted','EventBusName':'rescuenet-bus','Detail':json.dumps({'sessionId':sys.argv[1],'questionId':sys.argv[2],'answer':sys.argv[3]})}]))" "$S" "$QID" "$AN")
        aws events put-events --region "$REGION" --entries "$ENTRY" >/dev/null && echo -e "     ${DIM}simulated coordinator reply ($S): $QID = $AN${NC}"
        sleep 1
      done
      [ "$N" = "1" ] && info "-> that coordinator can take the animal; the other answers No (a no-bid)."
    else
      warn "Reply in the Slack channel to answer the questions (simulation off)."
    fi
  done
fi
pause

# ── Step 5: arbitration ────────────────────────────────────────────────────────────────────────────────────
step "Step 5: Arbitrator scores the eligible bids"
info "Waiting for the bid window to close and the arbitrator to run (about 15 to 30 s)..."
for i in $(seq 1 60); do
  STATUS=$(get_case | jget status)
  case "$STATUS" in AWAITING_CONFIRMATION|ASSIGNED|ESCALATED) break ;; esac
  sleep 2
done
echo -e "  +$(( $(now_s) - T0 ))s  ${BOLD}$STATUS${NC}"
get_case | python3 -c "
import sys, json
c = json.load(sys.stdin); bs = c.get('bidSummary') or {}
bids = bs.get('allBids', [])
if not bids:
    print('     no scored bids on the case record (status:', c.get('status'), ')'); sys.exit(0)
print(f\"     {'shelter':<30}{'slots':>6}{'vet':>5}{'fresh':>9}{'score':>8}\")
for b in bids:
    mark = '  <== winner' if b.get('shelterId') == bs.get('winner') else ''
    print(f\"     {b.get('shelterId',''):<30}{b.get('slots','?'):>6}{('yes' if b.get('hasVet') else 'no'):>5}{b.get('dataFreshness','?'):>9}{b.get('matchScore',0):>8.3f}{mark}\")
"
pause

# ── Step 6: confirmation ───────────────────────────────────────────────────────────────────────────────────
step "Step 6: Intake confirmation"
STATUS=$(get_case | jget status)
if [ "$STATUS" = "AWAITING_CONFIRMATION" ]; then
  WINNER=$(get_case | jget assignedTo)
  info "Coordinator at $WINNER confirms intake (simulated event, same as the tap in the app)."
  ENTRY=$(python3 -c "import json,sys; print(json.dumps([{'Source':'rescuenet.shelter','DetailType':'ConfirmationReceived','EventBusName':'rescuenet-bus','Detail':json.dumps({'caseId':sys.argv[1],'shelterId':sys.argv[2],'confirmed':True})}]))" "$CASE_ID" "$WINNER")
  aws events put-events --region "$REGION" --entries "$ENTRY" >/dev/null
  for i in $(seq 1 15); do STATUS=$(get_case | jget status); [ "$STATUS" = "ASSIGNED" ] && break; sleep 2; done
fi
T1=$(now_s)

# ── Step 7: history ────────────────────────────────────────────────────────────────────────────────────────
step "Step 7: Blackboard event history"
get_case | python3 -c "
import sys, json
c = json.load(sys.stdin)
print(f\"     {'time':<9}{'agent':<22}{'action':<22}summary\")
for e in c.get('eventHistory', []):
    print(f\"     {e.get('timestamp','')[11:19]:<9}{e.get('agent','')[:20]:<22}{e.get('action','')[:20]:<22}{e.get('summary','')[:70]}\")
"
echo
if [ "$STATUS" = "ASSIGNED" ]; then
  ok "E2E RESULT: PASS. Case $CASE_ID is ASSIGNED to $(get_case | jget assignedTo) in $((T1 - T0)) s end to end."
  exit 0
else
  fail "E2E RESULT: final status is '$STATUS' (expected ASSIGNED). Case $CASE_ID."
  exit 1
fi
