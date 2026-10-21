#!/usr/bin/env python3
"""Non-production latency / error-rate / rollback measurement for needs-profile v2 (Hard Stop 2, SC4).

Runs the SAME six reports (3 scenarios x 2 locations) through the deployed pipeline twice: first with
WEIGHTING_MODE=llm (the original behaviour), then with WEIGHTING_MODE=blend (v2), then rolls back to llm and runs one
more case to prove the rollback. Only the needs-profile function's environment variable is changed (merged, never
replaced). Tier-2 coordinators are NOT simulated, so the Slack channels get one opening post per case and only the
tier-1 shelters bid. Writes docs/evidence/sprint-3/measure-v2.json (no account ids, no secrets).

  python3 scripts/measure-v2.py            real run: creates 13 cases in the deployed account
  python3 scripts/measure-v2.py --dry      prints the plan only
"""
import json, subprocess, sys, time, statistics, datetime, os, re

REGION = os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
FN = 'rescuenet-needs-profile'
OUT = os.path.join(os.path.dirname(__file__), '..', 'docs', 'evidence', 'sprint-3', 'measure-v2.json')
DRY = '--dry' in sys.argv

SCEN = {
  'injured_loose': {'species': 'dog', 'condition': 'limping badly, not putting weight on front left leg, bleeding slightly', 'behavior': 'distressed, keeps moving toward the road', 'reporterSituation': 'I cannot stay or hold him, on my way to work', 'locationContext': 'busy intersection near the park entrance'},
  'injured':       {'species': 'cat', 'condition': 'hit by a car, bleeding from the mouth, back leg dragging', 'behavior': 'barely moving', 'reporterSituation': 'I am holding her in a towel and can stay as long as needed', 'locationContext': 'quiet side street'},
  'loose':         {'species': 'dog', 'condition': 'no visible injuries, looks healthy', 'behavior': 'running loose next to the highway on-ramp, darting toward traffic', 'reporterSituation': 'I cannot catch it or hold it', 'locationContext': 'highway on-ramp'},
}
# 12 locations >= 1.9 km apart (dedup merges within 1 km / 3 h): two columns, six rows
LATS = [40.705, 40.723, 40.741, 40.759, 40.777, 40.795]
POINTS = [(la, -73.992) for la in LATS] + [(la, -73.945) for la in LATS]
PLAN = [(sc, POINTS[i * 2 + r]) for i, sc in enumerate(SCEN) for r in range(2)]          # block 1 locations
PLAN2 = [(sc, POINTS[6 + i * 2 + r]) for i, sc in enumerate(SCEN) for r in range(2)]     # block 2 locations


def aws(args, inp=None):
    # retried: a laptop sleeping between signing and sending a request gives "Signature expired"; a retry re-signs
    for attempt in range(4):
        r = subprocess.run(['aws', *args, '--region', REGION, '--output', 'json'], capture_output=True, text=True, input=inp)
        if r.returncode == 0:
            return json.loads(r.stdout) if r.stdout.strip() else None
        if attempt == 3 or not re.search(r'Signature expired|RequestExpired|Throttl|timed out|Could not connect', r.stderr):
            raise RuntimeError(f'aws {args[:3]} failed: {r.stderr.strip()[:300]}')
        time.sleep(3)


def unm(v):
    if not isinstance(v, dict): return v
    if 'S' in v: return v['S']
    if 'N' in v:
        f = float(v['N']); return int(f) if f.is_integer() else f
    if 'BOOL' in v: return v['BOOL']
    if 'NULL' in v: return None
    if 'M' in v: return {k: unm(x) for k, x in v['M'].items()}
    if 'L' in v: return [unm(x) for x in v['L']]
    return v


def get_case(cid):
    r = aws(['dynamodb', 'get-item', '--table-name', 'rescuenet-cases', '--key', json.dumps({'caseId': {'S': cid}})])
    return {k: unm(v) for k, v in (r.get('Item') or {}).items()}


def set_mode(mode):
    env = aws(['lambda', 'get-function-configuration', '--function-name', FN, '--query', 'Environment.Variables'])
    env['WEIGHTING_MODE'] = mode            # merge: every other variable is preserved
    aws(['lambda', 'update-function-configuration', '--function-name', FN, '--environment', json.dumps({'Variables': env})])
    subprocess.run(['aws', 'lambda', 'wait', 'function-updated', '--function-name', FN, '--region', REGION], check=True)
    got = aws(['lambda', 'get-function-configuration', '--function-name', FN, '--query', 'Environment.Variables.WEIGHTING_MODE'])
    assert got == mode, f'mode is {got}, wanted {mode}'
    return got


def run_case(scenario, lat, lng, mode):
    payload = {'reportType': 'STRAY', 'lat': lat, 'lng': lng, 'accuracyMetres': 8, 'channel': 'APP', 'reporterId': 'measure-v2', 'reportData': SCEN[scenario]}
    tmp = '/tmp/measure_v2_resp.json'
    t0 = time.time(); started = int(t0 * 1000)
    aws(['lambda', 'invoke', '--function-name', 'rescuenet-intake', '--payload', json.dumps(payload), '--cli-binary-format', 'raw-in-base64-out', tmp])
    resp = json.load(open(tmp)); body = resp.get('body'); body = json.loads(body) if isinstance(body, str) else body
    cid = body['caseId']
    status, t_ack = '', None
    while time.time() - t0 < 120:
        status = get_case(cid).get('status', '')
        if status in ('AWAITING_CONFIRMATION', 'ASSIGNED', 'ESCALATED', 'MERGED'):
            t_ack = time.time() - t0; break
        time.sleep(1)
    t_total = None
    if status == 'AWAITING_CONFIRMATION':
        winner = get_case(cid).get('assignedTo')
        entry = [{'Source': 'rescuenet.shelter', 'DetailType': 'ConfirmationReceived', 'EventBusName': 'rescuenet-bus', 'Detail': json.dumps({'caseId': cid, 'shelterId': winner, 'confirmed': True})}]
        aws(['events', 'put-events', '--entries', json.dumps(entry)])
        for _ in range(30):
            status = get_case(cid).get('status', '')
            if status == 'ASSIGNED': t_total = time.time() - t0; break
            time.sleep(1)
    c = get_case(cid)
    npf = c.get('needsProfile') or {}
    bs = c.get('bidSummary') or {}
    return {
        'caseId': cid, 'scenario': scenario, 'mode': mode, 'lat': lat, 'lng': lng, 'startedMs': started, 'endedMs': int(time.time() * 1000),
        'finalStatus': status, 'secondsToAwaitingConfirmation': t_ack, 'secondsToAssigned': t_total,
        'winner': bs.get('winner'), 'eligibleBids': [{'shelterId': b.get('shelterId'), 'score': round(b.get('matchScore', 0), 4)} for b in bs.get('allBids', [])],
        'needsProfile': {'urgencyLevel': npf.get('urgencyLevel'), 'hardConstraints': npf.get('hardConstraints'), 'softWeights': npf.get('softWeights'),
                         'weightingMode': npf.get('weightingMode'), 'weightsVersion': npf.get('weightsVersion'), 'archetypeProbabilities': npf.get('archetypeProbabilities'), 'usedFallback': npf.get('usedFallback')},
    }


def lambda_reports(start_ms, end_ms):
    """REPORT lines (duration, cold-start init) for needs-profile in the window."""
    out, token = [], None
    while True:
        args = ['logs', 'filter-log-events', '--log-group-name', f'/aws/lambda/{FN}', '--start-time', str(start_ms), '--end-time', str(end_ms), '--filter-pattern', 'REPORT']
        if token: args += ['--next-token', token]
        r = aws(args)
        for e in r.get('events', []):
            m = re.search(r'Duration: ([\d.]+) ms.*?Max Memory Used: (\d+) MB(?:\s+Init Duration: ([\d.]+) ms)?', e['message'], re.S)
            if m: out.append({'ts': e['timestamp'], 'durationMs': float(m.group(1)), 'maxMemMB': int(m.group(2)), 'initMs': float(m.group(3)) if m.group(3) else None})
        token = r.get('nextToken')
        if not token: break
    return sorted(out, key=lambda x: x['ts'])


def error_lines(start_ms, end_ms):
    """Count error-looking log lines across the pipeline functions in the window."""
    counts = {}
    for fn in ['intake', 'needs-profile', 'image-agent', 'geocoding-agent', 'dedup-agent', 'tier1-agent', 'tier2-agent', 'arbitrator', 'confirmation-handler']:
        try:
            r = aws(['logs', 'filter-log-events', '--log-group-name', f'/aws/lambda/rescuenet-{fn}', '--start-time', str(start_ms), '--end-time', str(end_ms),
                     '--filter-pattern', '?ERROR ?"Task timed out" ?"Unhandled" ?"failed validation" ?"Bedrock failed"'])
            counts[fn] = [e['message'].strip()[:160] for e in r.get('events', [])]
        except RuntimeError as ex:
            counts[fn] = [f'(log query failed: {ex})']
    return counts


if DRY:
    print('Plan: block 1 (llm):', PLAN); print('Plan: block 2 (blend):', PLAN2); print('then rollback to llm + 1 verification case. 13 cases total.'); sys.exit(0)

results, t_start = [], int(time.time() * 1000)
def save():
    json.dump({'partial': True, 'cases': results}, open(OUT, 'w'), indent=2)
print('Block 1: WEIGHTING_MODE=llm'); set_mode('llm')
for sc, (la, ln) in PLAN:
    r = run_case(sc, la, ln, 'llm'); results.append(r); save(); print(f"  {sc:<14} llm   {r['finalStatus']:<22} ack {r['secondsToAwaitingConfirmation'] and round(r['secondsToAwaitingConfirmation'],1)}s", flush=True)
print('Block 2: WEIGHTING_MODE=blend (v2)'); set_mode('blend')
for sc, (la, ln) in PLAN2:
    r = run_case(sc, la, ln, 'blend'); results.append(r); save(); print(f"  {sc:<14} blend {r['finalStatus']:<22} ack {r['secondsToAwaitingConfirmation'] and round(r['secondsToAwaitingConfirmation'],1)}s", flush=True)
print('Rollback: WEIGHTING_MODE=llm'); t_roll = time.time(); set_mode('llm'); roll_s = time.time() - t_roll
r = run_case('injured_loose', 40.8115, -73.968, 'llm-after-rollback'); results.append(r)
print(f"  after rollback {r['finalStatus']:<22} weightingMode on the stored profile: {r['needsProfile']['weightingMode']}")
t_end = int(time.time() * 1000)
time.sleep(20)   # let CloudWatch ingest the REPORT lines
reports = lambda_reports(t_start, t_end + 20000)
errs = error_lines(t_start, t_end + 20000)
json.dump({'generatedAt': datetime.datetime.utcnow().isoformat() + 'Z', 'rollbackConfigSeconds': round(roll_s, 1), 'cases': results, 'needsProfileReports': reports, 'errorLines': errs}, open(OUT, 'w'), indent=2)
print('wrote', os.path.abspath(OUT))
