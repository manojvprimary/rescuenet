// Shared names and constants — import this anywhere instead of
// scattering magic strings across stacks.

export const TABLE_NAMES = {
  CASES:    'rescuenet-cases',
  SHELTERS: 'rescuenet-shelters',
  BIDS:     'rescuenet-bids',
  NEEDS:    'rescuenet-needs',
  QA:       'rescuenet-qa-sessions',
} as const;

export const BUS_NAME       = 'rescuenet-bus';
export const PHOTO_BUCKET   = 'rescuenet-photos';
export const API_NAME       = 'rescuenet-api';
export const SECRET_NAME    = 'rescuenet/shelter-a-api-key';
export const PLACE_INDEX    = 'rescuenet-place-index';
export const MODEL_ID       = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
export const BID_WINDOW_SEC = 15;

export const SLACK_SECRET_NAME = 'rescuenet/slack-bot';

// ── Shelter roster ───────────────────────────────────────────────────────────
// Tier 1 — RescueNet reads capacity straight from rescuenet-shelters (the demo
//          stands in for "the shelter's own system, which we've been granted API
//          access to" — no separate mock external service).
// Tier 2 — human-in-the-loop via Slack. No capacity record; the coordinator
//          answers in-channel and that becomes the bid.
export type ShelterTier = 1 | 2;

export interface ShelterSeed {
  shelterId:  string;
  name:       string;
  tier:       ShelterTier;
  lat:        number;
  lng:        number;
  acceptedSpecies: string[];
  radiusKm:   number;
  maxUrgency: string;
  confirmationTimeoutSeconds: number;
  onTimeout:  'AUTO_CONFIRM' | 'DECLINE';
  // Tier 1 only — live capacity, read directly.
  availableSlots?: number;
  hasVetOnSite?:   boolean;
  // Tier 2 only — Slack channel the coordinator answers in.
  slackChannelId?: string;
}

export const SHELTERS: ShelterSeed[] = [
  // ── Tier 1 — API / direct read ──────────────────────────────────────────
  {
    shelterId: 'shelter-manhattan-acc',
    name:      'Manhattan Animal Care Center',
    tier:      1,
    lat: 40.7947, lng: -73.9418,          // East Harlem
    acceptedSpecies: ['dog', 'cat', 'bird', 'other'],
    radiusKm:  25,
    maxUrgency: 'INJURED',
    confirmationTimeoutSeconds: 60,
    onTimeout: 'AUTO_CONFIRM',
    availableSlots: 6,
    hasVetOnSite:   true,
    // edge case: clean win — well-resourced, broad acceptance, large radius
  },
  {
    shelterId: 'shelter-chelsea-companion',
    name:      'Chelsea Companion Animal Shelter',
    tier:      1,
    lat: 40.7444, lng: -73.9942,          // Chelsea
    acceptedSpecies: ['dog', 'cat'],
    radiusKm:  15,
    maxUrgency: 'INJURED',
    confirmationTimeoutSeconds: 60,
    onTimeout: 'AUTO_CONFIRM',
    availableSlots: 0,
    hasVetOnSite:   true,
    // edge case: zero capacity — otherwise qualified, must no-bid
  },
  {
    shelterId: 'shelter-soho-second-chance',
    name:      'SoHo Second Chance Adoption Center',
    tier:      1,
    lat: 40.7233, lng: -74.0026,          // SoHo
    acceptedSpecies: ['dog', 'cat', 'rabbit'],
    radiusKm:  20,
    maxUrgency: 'INJURED',
    confirmationTimeoutSeconds: 60,
    onTimeout: 'AUTO_CONFIRM',
    availableSlots: 4,
    hasVetOnSite:   false,
    // edge case: fails has_vet hard constraint on injured cases only
  },
  {
    shelterId: 'shelter-midtown-humane',
    name:      'Midtown Humane Center',
    tier:      1,
    lat: 40.7599, lng: -73.9648,          // Midtown East
    acceptedSpecies: ['cat'],
    radiusKm:  3,
    maxUrgency: 'INJURED',
    confirmationTimeoutSeconds: 60,
    onTimeout: 'AUTO_CONFIRM',
    availableSlots: 2,
    hasVetOnSite:   true,
    // edge case: double exclusion — species mismatch AND radius miss for most cases
  },
  // ── Tier 2 — Slack ───────────────────────────────────────────────────────
  {
    shelterId: 'shelter-eastside-welfare',
    name:      'Eastside Animal Welfare Center',
    tier:      2,
    lat: 40.7776, lng: -73.9493,          // Yorkville / UES
    acceptedSpecies: ['dog', 'cat'],
    radiusKm:  20,
    maxUrgency: 'INJURED',
    confirmationTimeoutSeconds: 300,
    onTimeout: 'DECLINE',
    slackChannelId: 'C0BN5723K3J',
    // edge case: normal human-in-the-loop happy path
  },
  {
    shelterId: 'shelter-eastvillage-strays',
    name:      'East Village Strays Rescue',
    tier:      2,
    lat: 40.7256, lng: -73.9847,          // East Village
    acceptedSpecies: ['dog', 'cat'],
    radiusKm:  10,
    maxUrgency: 'INJURED',
    confirmationTimeoutSeconds: 300,
    onTimeout: 'DECLINE',
    slackChannelId: 'C0BMEHEFUNQ',
    // edge case: intended for the coordinator-doesn't-answer / timeout-decline demo
  },
];

// EventBridge event sources and types
export const EVENTS = {
  INTAKE: {
    SOURCE:      'rescuenet.intake',
    SUBMITTED:   'ReportSubmitted',
  },
  IMAGE: {
    SOURCE:      'rescuenet.image-agent',
    ENRICHED:    'AgentEnriched',
  },
  GEOCODING: {
    SOURCE:      'rescuenet.geocoding-agent',
    ENRICHED:    'AgentEnriched',
  },
  DEDUP: {
    SOURCE:      'rescuenet.dedup',
    PUBLISHED:   'CasePublished',
    MERGED:      'CaseMerged',
  },
  SHELTER: {
    SOURCE:      'rescuenet.shelter',
    BID:         'ShelterBid',
    NO_BID:      'ShelterNoBid',
    CONFIRMED:   'ConfirmationReceived',
  },
  ARBITRATOR: {
    SOURCE:      'rescuenet.arbitrator',
    ASSIGNED:    'CaseAssigned',
    WINDOW_CLOSED: 'BidWindowClosed',
    ESCALATION:  'EscalationRequired',
  },
  CONFIRMATION: {
    SOURCE:      'rescuenet.confirmation-handler',
    FINALISED:   'AssignmentFinalised',
    REROUTE:     'ReroutingRequired',
  },
  APP: {
    SOURCE:      'rescuenet.app',
    QA_ANSWER:   'QaAnswerSubmitted',
  },
} as const;
