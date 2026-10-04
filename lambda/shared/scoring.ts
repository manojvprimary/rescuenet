// Pure scoring helpers extracted from lambda/arbitrator/index.ts so they can be unit-tested
// without AWS. Behavior is unchanged except the species check (Hard Stop 2, SC1, minor).

/**
 * Case species as the rest of the pipeline reads it: the image agent's result first, then the
 * reporter-declared value. Lowercased; 'unknown' or missing becomes undefined.
 */
export function extractCaseSpecies(reportData: Record<string, unknown> | undefined): string | undefined {
  const fromImage = (reportData?.imageAnalysis as Record<string, unknown> | undefined)?.species;
  const raw = fromImage ?? reportData?.species;
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim().toLowerCase();
  return s === '' || s === 'unknown' ? undefined : s;
}

/**
 * Species factor for one bid. 0.85 only if the shelter's accepted list actually contains the
 * case's species; otherwise 0.50. The previous code tested whether the list existed
 * (`bid.acceptedSpecies ? 0.85 : 0.50`), which scored every shelter with any list as a match.
 * Unknown case species scores every shelter 0.50, so it cannot distort the ranking.
 */
export function speciesMatchScore(acceptedSpecies: string[] | undefined, caseSpecies: string | undefined): number {
  if (!caseSpecies || !Array.isArray(acceptedSpecies)) return 0.5;
  return acceptedSpecies.some(s => String(s).toLowerCase() === caseSpecies) ? 0.85 : 0.5;
}
