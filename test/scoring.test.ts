import { extractCaseSpecies, speciesMatchScore } from '../lambda/shared/scoring';

describe('speciesMatchScore (SC1 regression: membership, not existence)', () => {
  it('exact match scores 0.85', () => expect(speciesMatchScore(['dog', 'cat'], 'cat')).toBe(0.85));
  it('no match scores 0.50 even though the shelter lists species (the old bug scored this 0.85)', () => {
    expect(speciesMatchScore(['dog'], 'cat')).toBe(0.5);
  });
  it('multi-species list containing the case species scores 0.85', () => {
    expect(speciesMatchScore(['dog', 'cat', 'rabbit'], 'rabbit')).toBe(0.85);
  });
  it('empty or missing list scores 0.50', () => {
    expect(speciesMatchScore([], 'dog')).toBe(0.5);
    expect(speciesMatchScore(undefined, 'dog')).toBe(0.5);
  });
  it('is case-insensitive', () => expect(speciesMatchScore(['Dog'], 'dog')).toBe(0.85));
  it('unknown case species scores every shelter the same (cannot distort ranking)', () => {
    expect(speciesMatchScore(['dog'], undefined)).toBe(speciesMatchScore(['cat'], undefined));
  });
});

describe('extractCaseSpecies', () => {
  it('prefers the image agent result over the declared species', () => {
    expect(extractCaseSpecies({ imageAnalysis: { species: 'Dog' }, species: 'cat' })).toBe('dog');
  });
  it('falls back to the reporter-declared species', () => expect(extractCaseSpecies({ species: 'cat' })).toBe('cat'));
  it('treats "unknown", blank, non-string, and missing as undefined', () => {
    expect(extractCaseSpecies({ imageAnalysis: { species: 'unknown' } })).toBeUndefined();
    expect(extractCaseSpecies({ species: '  ' })).toBeUndefined();
    expect(extractCaseSpecies({ species: 7 })).toBeUndefined();
    expect(extractCaseSpecies(undefined)).toBeUndefined();
  });
});
