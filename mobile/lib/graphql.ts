import { generateClient } from 'aws-amplify/api';
import './amplify';

const client = generateClient();

// AWSJSON scalars come back as JSON strings, not parsed objects — parse defensively
// since a field can legitimately be null before an agent has written to it yet.
function parseJson<T>(value: unknown): T | undefined {
  if (typeof value !== 'string') return undefined;
  try { return JSON.parse(value) as T; } catch { return undefined; }
}

export interface CaseLocation { lat: number; lng: number; accuracyMetres?: number }
export interface HistoryEntry { agent: string; timestamp: string; action: string; summary: string }
export interface BidSummary {
  winner: string;
  winnerScore: number;
  allBids: { shelterId: string; matchScore: number; dataFreshness: string; slots: number; hasVet: boolean }[];
}

export interface CaseRecord {
  caseId:       string;
  timestamp:    string;
  status:       string;
  location?:    CaseLocation;
  reporterId?:  string;
  channel?:     string;
  reportData?:  Record<string, unknown>;
  eventHistory?: HistoryEntry[];
  needsProfile?: Record<string, unknown>;
  bidSummary?:   BidSummary;
  assignedTo?:   string;
  dupStatus?:    string;
  linkedTo?:     string;
}

function toCaseRecord(raw: any): CaseRecord {
  return {
    caseId:       raw.caseId,
    timestamp:    raw.timestamp,
    status:       raw.status,
    location:     parseJson(raw.location),
    reporterId:   raw.reporterId,
    channel:      raw.channel,
    reportData:   parseJson(raw.reportData),
    eventHistory: parseJson(raw.eventHistory),
    needsProfile: parseJson(raw.needsProfile),
    bidSummary:   parseJson(raw.bidSummary),
    assignedTo:   raw.assignedTo,
    dupStatus:    raw.dupStatus,
    linkedTo:     raw.linkedTo,
  };
}

export interface ShelterRecord {
  shelterId: string;
  name:      string;
  tier:      number;
  location?: CaseLocation;
  capacity?: { availableSlots?: number; hasVetOnSite?: boolean };
}

// ── submitReport ─────────────────────────────────────────────────────────────
const SUBMIT_REPORT = /* GraphQL */ `
  mutation SubmitReport($input: SubmitReportInput!) {
    submitReport(input: $input) {
      caseId
      status
      timestamp
      photoUploadUrl
      photoKey
      photoUploadUrls
      photoKeys
      message
    }
  }
`;

export interface SubmitReportInput {
  reportType?:       string;
  lat:               number;
  lng:               number;
  accuracyMetres?:   number;
  reporterId?:        string;
  channel?:           string;
  reportData?:        Record<string, unknown>;
  wantsPhotoUpload?:  boolean;
  photoCount?:        number;
}

export interface SubmitReportResult {
  caseId: string;
  status: string;
  timestamp: string;
  photoUploadUrl?: string | null;
  photoKey?: string | null;
  photoUploadUrls?: (string | null)[] | null;
  photoKeys?: (string | null)[] | null;
  message?: string | null;
}

export async function submitReport(input: SubmitReportInput): Promise<SubmitReportResult> {
  const result = await client.graphql({
    query: SUBMIT_REPORT,
    variables: { input: { channel: 'APP', ...input, reportData: JSON.stringify(input.reportData ?? {}) } },
  }) as { data: { submitReport: SubmitReportResult } };
  return result.data.submitReport;
}

// ── getCase ──────────────────────────────────────────────────────────────────
const GET_CASE = /* GraphQL */ `
  query GetCase($caseId: String!) {
    getCase(caseId: $caseId) {
      caseId timestamp status location reporterId channel
      reportData eventHistory needsProfile bidSummary assignedTo dupStatus linkedTo
    }
  }
`;

export async function getCase(caseId: string): Promise<CaseRecord | undefined> {
  const result = await client.graphql({ query: GET_CASE, variables: { caseId } }) as
    { data: { getCase: any } };
  return result.data.getCase ? toCaseRecord(result.data.getCase) : undefined;
}

// ── listShelters ─────────────────────────────────────────────────────────────
const LIST_SHELTERS = /* GraphQL */ `
  query ListShelters {
    listShelters {
      shelterId name tier location
      capacity { availableSlots hasVetOnSite }
    }
  }
`;

export async function listShelters(): Promise<ShelterRecord[]> {
  const result = await client.graphql({ query: LIST_SHELTERS }) as
    { data: { listShelters: any[] } };
  return (result.data.listShelters ?? []).map(s => ({
    ...s,
    location: parseJson(s.location),
  }));
}

// ── listNearbyCases ───────────────────────────────────────────────────────────
export interface NearbyCase {
  caseId:      string;
  species?:    string | null;
  status:      string;
  distanceKm?: number | null;
  timestamp:   string;
  lat?:        number | null;
  lng?:        number | null;
}

const LIST_NEARBY_CASES = /* GraphQL */ `
  query ListNearbyCases($lat: Float!, $lng: Float!, $radiusKm: Float!) {
    listNearbyCases(lat: $lat, lng: $lng, radiusKm: $radiusKm) {
      caseId species status distanceKm timestamp lat lng
    }
  }
`;

export async function listNearbyCases(lat: number, lng: number, radiusKm: number): Promise<NearbyCase[]> {
  const result = await client.graphql({
    query: LIST_NEARBY_CASES,
    variables: { lat, lng, radiusKm },
  }) as { data: { listNearbyCases: NearbyCase[] } };
  return result.data.listNearbyCases ?? [];
}

// ── getCasePhotos ─────────────────────────────────────────────────────────────
const GET_CASE_PHOTOS = /* GraphQL */ `
  query GetCasePhotos($caseId: String!) {
    getCasePhotos(caseId: $caseId)
  }
`;

export async function getCasePhotos(caseId: string): Promise<string[]> {
  const result = await client.graphql({ query: GET_CASE_PHOTOS, variables: { caseId } }) as
    { data: { getCasePhotos: (string | null)[] | null } };
  return (result.data.getCasePhotos ?? []).filter((u): u is string => !!u);
}

// ── onCaseUpdated subscription ────────────────────────────────────────────────
const ON_CASE_UPDATED = /* GraphQL */ `
  subscription OnCaseUpdated($caseId: String!) {
    onCaseUpdated(caseId: $caseId) {
      caseId timestamp status location reporterId channel
      reportData eventHistory needsProfile bidSummary assignedTo dupStatus linkedTo
    }
  }
`;

export function subscribeToCaseUpdates(
  caseId: string,
  onUpdate: (c: CaseRecord) => void,
  onError?: (err: unknown) => void,
) {
  const sub = client.graphql({ query: ON_CASE_UPDATED, variables: { caseId } }) as any;
  return sub.subscribe({
    next: (msg: { data: { onCaseUpdated: any } }) => {
      if (msg.data?.onCaseUpdated) onUpdate(toCaseRecord(msg.data.onCaseUpdated));
    },
    error: (err: unknown) => onError?.(err),
  });
}
