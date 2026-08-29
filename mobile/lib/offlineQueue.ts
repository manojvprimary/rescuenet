import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { submitReport, type SubmitReportInput } from './graphql';
import { addToHistory } from './reportHistory';

const STORAGE_KEY = '@rescuenet/pending-reports';

export interface QueuedReport {
  localId:   string;   // "local-<timestamp>-<rand>" until synced
  caseId?:   string;   // the real server caseId, once synced
  input:     SubmitReportInput;
  photoUri?:  string;   // legacy single-photo field — still read for old queued items
  photoUris?: string[]; // local file URIs from the image picker, uploaded after sync
  status:    'pending' | 'syncing' | 'synced' | 'failed';
  createdAt: string;
  lastError?: string;
}

type Listener = (queue: QueuedReport[]) => void;
const listeners = new Set<Listener>();

export function subscribeToQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function readQueue(): Promise<QueuedReport[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) as QueuedReport[] : [];
}

async function writeQueue(queue: QueuedReport[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  listeners.forEach(l => l(queue));
}

function makeLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function uploadPhoto(uploadUrl: string, localUri: string): Promise<void> {
  const photo = await fetch(localUri);
  const blob  = await photo.blob();
  const put   = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
  if (!put.ok) throw new Error(`Photo upload failed: ${put.status}`);
}

// Local-first: the report is written to disk and the caller gets an ID back before
// any network call happens. If the network call succeeds immediately, great — the
// UI just carries on with a real caseId. If it doesn't (offline, slow, transient
// failure), the report is already safely queued and a background flush will pick
// it up, so nothing the reporter did is at risk of being lost.
export async function enqueueReport(input: SubmitReportInput, photoUris?: string[]): Promise<QueuedReport> {
  const uris = (photoUris ?? []).slice(0, 5);
  const record: QueuedReport = {
    localId:   makeLocalId(),
    input:     { ...input, photoCount: uris.length },
    photoUris: uris,
    status:    'pending',
    createdAt: new Date().toISOString(),
  };

  const queue = await readQueue();
  queue.unshift(record);
  await writeQueue(queue);

  await trySync(record.localId);
  return (await readQueue()).find(r => r.localId === record.localId) ?? record;
}

async function trySync(localId: string): Promise<void> {
  let queue = await readQueue();
  const idx = queue.findIndex(r => r.localId === localId);
  if (idx === -1 || queue[idx].status === 'synced') return;

  queue[idx] = { ...queue[idx], status: 'syncing' };
  await writeQueue(queue);

  try {
    const result = await submitReport(queue[idx].input);

    const localUris  = queue[idx].photoUris ?? (queue[idx].photoUri ? [queue[idx].photoUri!] : []);
    const uploadUrls = (result.photoUploadUrls ?? (result.photoUploadUrl ? [result.photoUploadUrl] : []))
      .filter((u): u is string => !!u);
    for (let p = 0; p < Math.min(localUris.length, uploadUrls.length); p++) {
      try {
        await uploadPhoto(uploadUrls[p], localUris[p]);
      } catch (uploadErr) {
        // The case itself was created successfully — a failed photo upload shouldn't
        // block or retry the whole report, it just means that photo is missing.
        console.warn(`Photo ${p + 1} upload failed:`, uploadErr);
      }
    }

    queue = await readQueue();
    const i = queue.findIndex(r => r.localId === localId);
    if (i !== -1) queue[i] = { ...queue[i], status: 'synced', caseId: result.caseId };
    await writeQueue(queue);
    await addToHistory({
      caseId:      result.caseId,
      submittedAt: result.timestamp,
      reportType:  String(queue[i]?.input.reportData?.reportType ?? queue[i]?.input.reportType ?? 'STRAY'),
      species:     queue[i]?.input.reportData?.species as string | undefined,
    });
  } catch (err) {
    queue = await readQueue();
    const i = queue.findIndex(r => r.localId === localId);
    if (i !== -1) queue[i] = { ...queue[i], status: 'pending', lastError: String(err) };
    await writeQueue(queue);
  }
}

export async function flushQueue(): Promise<void> {
  const queue = await readQueue();
  const pending = queue.filter(r => r.status === 'pending' || r.status === 'failed');
  for (const r of pending) await trySync(r.localId);
}

export async function getQueue(): Promise<QueuedReport[]> {
  return readQueue();
}

export async function getQueuedReport(localId: string): Promise<QueuedReport | undefined> {
  return (await readQueue()).find(r => r.localId === localId);
}

let netInfoUnsubscribe: (() => void) | undefined;

// Call once, near app start (see app/_layout.tsx) — flushes on launch and again
// every time connectivity is regained.
export function startQueueAutoFlush(): void {
  if (netInfoUnsubscribe) return;
  flushQueue();
  netInfoUnsubscribe = NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable !== false) flushQueue();
  });
}
