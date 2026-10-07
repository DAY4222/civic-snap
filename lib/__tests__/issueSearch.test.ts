import synonymsFile from '@/data/search-synonyms.json';

import { ISSUE_CATEGORIES } from '../categories';
import { findNotHandledRedirects, normalizeSearchText, searchIssues } from '../issueSearch';

function topIds(query: string, count = 3) {
  return searchIssues(query)
    .categories.slice(0, count)
    .map((category) => category.id);
}

describe('searchIssues', () => {
  it('sends streetlights to Toronto Hydro instead of returning nothing', () => {
    for (const query of ['streetlight', 'Street light out', 'lamp post']) {
      expect(searchIssues(query).redirects.map((redirect) => redirect.url)).toEqual([
        'https://www.torontohydro.com/report-a-streetlight-out',
      ]);
    }
  });

  it('keeps traffic lights with 311', () => {
    const result = searchIssues('traffic light');
    expect(result.redirects).toEqual([]);
    expect(result.categories[0].id).toBe('traffic-signal-repair');
  });

  it('puts garbage and litter issues first for "trash"', () => {
    const garbageIssues = new Set([
      'clean-up-illegal-dumping-on-city-road-allowance',
      'clean-up-litter-on-sidewalks-and-boulevards',
      'clean-up-overflowing-street-litter-bin',
    ]);
    expect(topIds('trash').every((id) => garbageIssues.has(id))).toBe(true);
  });

  it('puts the icy sidewalk first for "ice", not wildlife', () => {
    expect(topIds('ice', 1)).toEqual(['icy-sidewalk-needs-salting']);
    expect(topIds('ice', 5)).not.toContain('injured-wildlife');
  });

  it('puts Road Pothole first for "pothole", plural or partly typed', () => {
    expect(topIds('pothole', 1)).toEqual(['road-pothole-road-damage']);
    expect(topIds('potholes', 1)).toEqual(['road-pothole-road-damage']);
    expect(topIds('pot', 1)).toEqual(['road-pothole-road-damage']);
  });

  it('understands everyday phrases', () => {
    expect(topIds('garbage not picked up', 1)).toEqual([
      'residential-garbage-day-collection-not-picked-up',
    ]);
    expect(topIds('dead raccoon', 1)).toEqual(['pick-up-dead-wildlife']);
    expect(topIds('stop sign', 1)).toEqual(['missing-damaged-street-or-traffic-signs']);
    expect(topIds('graff', 1)).toEqual(['graffiti-on-private-property']);
    expect(topIds('abandoned couch', 1)).toEqual([
      'clean-up-illegal-dumping-on-city-road-allowance',
    ]);
  });

  it('returns nothing for filler words or nonsense', () => {
    expect(searchIssues('the').categories).toEqual([]);
    expect(searchIssues('zzzz').categories).toEqual([]);
    expect(searchIssues('   ').categories).toEqual([]);
  });

  it('only lists synonyms for issues that exist', () => {
    const ids = new Set(ISSUE_CATEGORIES.map((category) => category.id));
    const unknown = Object.keys(synonymsFile).filter((key) => !key.startsWith('_') && !ids.has(key));
    expect(unknown).toEqual([]);
  });
});

describe('findNotHandledRedirects', () => {
  it('waits for enough letters before guessing from a prefix', () => {
    expect(findNotHandledRedirects('street')).toEqual([]);
    expect(findNotHandledRedirects('streetl')).toHaveLength(1);
  });
});

describe('normalizeSearchText', () => {
  it('drops case, accents and punctuation', () => {
    expect(normalizeSearchText('  Café – Pothole/Road!! ')).toBe('cafe pothole road');
  });
});
