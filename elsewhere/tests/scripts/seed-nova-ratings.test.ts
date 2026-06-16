/**
 * Unit tests for lib/seedHelpers.ts — the pure helpers extracted from the seed
 * script so they can be tested without a Supabase connection.
 *
 * Coverage note: tests 3 and 4 below exercise the helper logic that underpins
 * the duplicate-guard and dry-run behaviour in main().  Full end-to-end testing
 * of main() itself (mocking @supabase/supabase-js + process.argv) would require
 * also exporting main() and is left as a future follow-up.
 */
import { describe, it, expect } from 'vitest'
import {
  NAME_OVERRIDES,
  normalizeNoise,
  normalizeVibe,
  normalizeTables,
  normalizeOutlets,
} from '@/lib/seedHelpers'

// ── 1. Name override map ──────────────────────────────────────────────────────

describe('NAME_OVERRIDES', () => {
  it('resolves correctly for all 11 overridden places', () => {
    expect(Object.keys(NAME_OVERRIDES)).toHaveLength(11)

    expect(NAME_OVERRIDES['Rare Bird']).toBe('Rare Bird Coffee Roasters')
    expect(NAME_OVERRIDES['De Clieu']).toBe('De Clieu Coffee & Sandwich - Fairfax')
    expect(NAME_OVERRIDES['Common Culture']).toBe('Common Culture Specialty Coffee & Brunch')
    expect(NAME_OVERRIDES['Simply Social']).toBe('Fairfax Simply Social Coffee')
    expect(NAME_OVERRIDES['Bakery Museum and Co.']).toBe('Bakery Museum & Co')
    expect(NAME_OVERRIDES['Tous les Jours']).toBe('Tous Les Jours Bakery Cafe')
    expect(NAME_OVERRIDES['Chateau de Chantilly']).toBe('Chateau de Chantilly Cafe')
    expect(NAME_OVERRIDES['Frame']).toBe('FRAME Coffee Roasters')
    expect(NAME_OVERRIDES['Caffe Amouri']).toBe('Caffe Amouri Coffee Roaster')
    expect(NAME_OVERRIDES["Peet's"]).toBe("Peet's Coffee")
    expect(NAME_OVERRIDES['Senberry']).toBe('Senberry Bowls')
  })
})

// ── 2. Unrecognized values throw (the "flag" mechanism) ───────────────────────

describe('normalize helpers — unrecognized values throw', () => {
  it('normalizeNoise throws for an unrecognized value', () => {
    expect(() => normalizeNoise('noisy')).toThrow('Unknown noise value: "noisy"')
  })

  it('normalizeVibe throws for an unrecognized value', () => {
    expect(() => normalizeVibe('chill')).toThrow('Unknown vibe value: "chill"')
  })

  it('normalizeTables throws for an unrecognized value', () => {
    expect(() => normalizeTables('none')).toThrow('Unknown tables value: "none"')
  })

  it('normalizeOutlets throws for an unrecognized value', () => {
    expect(() => normalizeOutlets('plenty')).toThrow('Unknown outlets value: "plenty"')
  })
})

// ── 3. All alias values in RATINGS_INPUT normalize without error ──────────────
//
// The duplicate guard in main() can only fire for a place if the row was
// successfully built (normalization completed without throwing).  These tests
// confirm that every alias value used by the seed data produces a valid
// canonical value, so no place is accidentally dropped before the duplicate
// check even runs.

describe('normalize helpers — seed alias coverage (prerequisite for duplicate guard)', () => {
  it('normalizeNoise handles every alias used in RATINGS_INPUT', () => {
    // canonical values
    expect(normalizeNoise('silent')).toBe('silent')
    expect(normalizeNoise('quiet')).toBe('quiet')
    expect(normalizeNoise('vibrant')).toBe('vibrant')
    // aliases actually present in RATINGS_INPUT
    expect(normalizeNoise('moderate')).toBe('quiet')
    expect(normalizeNoise('loud')).toBe('vibrant')
  })

  it('normalizeVibe handles every alias used in RATINGS_INPUT', () => {
    expect(normalizeVibe('focused')).toBe('focused')
    expect(normalizeVibe('casual')).toBe('casual')
    expect(normalizeVibe('social')).toBe('social')
    // alias used in RATINGS_INPUT
    expect(normalizeVibe('cozy')).toBe('casual')
  })

  it('normalizeTables handles every alias used in RATINGS_INPUT', () => {
    expect(normalizeTables('limited')).toBe('limited')
    expect(normalizeTables('mixed')).toBe('mixed')
    expect(normalizeTables('plentiful')).toBe('plentiful')
    // alias used in RATINGS_INPUT
    expect(normalizeTables('scarce')).toBe('limited')
  })

  it('normalizeOutlets handles every alias used in RATINGS_INPUT', () => {
    expect(normalizeOutlets('scarce')).toBe('scarce')
    expect(normalizeOutlets('some')).toBe('some')
    expect(normalizeOutlets('ample')).toBe('ample')
    // alias used in RATINGS_INPUT
    expect(normalizeOutlets('moderate')).toBe('some')
  })
})

// ── 4. NAME_OVERRIDES has no duplicate canonical targets ──────────────────────
//
// In a dry run (and in the live insert), each seed entry maps to one DB place.
// If two seed names resolved to the same canonical name they would produce
// duplicate rows — the dry-run output would be misleading and the live insert
// would likely violate the unique (user_id, place_id) constraint.

describe('NAME_OVERRIDES — no duplicate canonical targets (dry-run correctness)', () => {
  it('every canonical target name is unique', () => {
    const targets = Object.values(NAME_OVERRIDES)
    const unique = new Set(targets)
    expect(unique.size).toBe(targets.length)
  })

  it('no seed entry key appears as a canonical target of another entry', () => {
    const keys = new Set(Object.keys(NAME_OVERRIDES))
    const targets = Object.values(NAME_OVERRIDES)
    for (const target of targets) {
      expect(keys.has(target)).toBe(false)
    }
  })
})
