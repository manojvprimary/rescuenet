import AsyncStorage from '@react-native-async-storage/async-storage';

// Submissions are anonymous — there's no server-side "my reports" to query. This is
// the only record of what a given device has submitted, and it never leaves the device.
const STORAGE_KEY = '@rescuenet/report-history';

export interface HistoryItem {
  caseId:      string;
  submittedAt: string;
  reportType:  string;
  species?:    string;
}

export async function addToHistory(item: HistoryItem): Promise<void> {
  const existing = await getHistory();
  if (existing.some(h => h.caseId === item.caseId)) return;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([item, ...existing]));
}

export async function getHistory(): Promise<HistoryItem[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) as HistoryItem[] : [];
}
