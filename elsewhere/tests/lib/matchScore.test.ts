import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeMatchScoresByPlaceId } from '@/lib/matchScore'

// ── Helpers ───────────────────────────────────────────────────────────────────

type MockRow = { noise: string; vibe: string; overall_rating: number }

function makeSupabaseClient(rows: MockRow[] = []) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    }),
  } as unknown as Parameters<typeof computeMatchScoresByPlaceId>[0]['serviceRoleClient']
}

function makePlaceStats(overrides: Partial<{
  id: string
  rating_count: number
  avg_overall_rating: number | null
  noise_silent: number
  noise_quiet: number
  noise_vibrant: number
  vibe_focused: number
  vibe_casual: number
  vibe_social: number
  tables_limited: number
  tables_mixed: number
  tables_plentiful: number
  outlets_scarce: number
  outlets_some: number
  outlets_ample: number
}> = {}) {
  return {
    id: 'place-1',
    rating_count: 10,
    avg_overall_rating: 4.0,
    noise_silent: 1,
    noise_quiet: 7,
    noise_vibrant: 2,
    vibe_focused: 6,
    vibe_casual: 3,
    vibe_social: 1,
    tables_limited: 2,
    tables_mixed: 5,
    tables_plentiful: 3,
    outlets_scarce: 0,
    outlets_some: 4,
    outlets_ample: 6,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeMatchScoresByPlaceId', () => {
  describe('fully rated place with matching user preferences', () => {
    it('returns a match score for a place whose dominant noise and vibe align with user history', async () => {
      // User rated two places "Quiet / Focused" with rating=5 → heavy signal toward those labels
      const userRatings: MockRow[] = [
        { noise: 'quiet', vibe: 'focused', overall_rating: 5 },
        { noise: 'quiet', vibe: 'focused', overall_rating: 4 },
      ]
      const client = makeSupabaseClient(userRatings)

      // Place: dominant = Quiet (7 votes) / Focused (6 votes), avg = 4.0
      const place = makePlaceStats()
      const { userHasRatings, resultsByPlaceId } = await computeMatchScoresByPlaceId({
        serviceRoleClient: client,
        userId: 'user-1',
        places: [place],
      })

      expect(userHasRatings).toBe(true)

      const result = resultsByPlaceId['place-1']
      expect(result).toBeDefined()
      // noiseDiff=0 → noiseMatch=1, vibeDiff=0 → vibeMatch=1
      // baseScore = (1+1)/2 = 1, quality = 4/5 = 0.8
      // matchScore = 1*0.7 + 0.8*0.3 = 0.7+0.24 = 0.94 → 94%
      expect(result.matchScorePercent).toBe(94)
    })
  })

  describe('place with no ratings', () => {
    it('returns null matchScorePercent when rating_count is 0', async () => {
      const client = makeSupabaseClient([])
      const place = makePlaceStats({
        rating_count: 0,
        avg_overall_rating: null,
        noise_silent: 0,
        noise_quiet: 0,
        noise_vibrant: 0,
        vibe_focused: 0,
        vibe_casual: 0,
        vibe_social: 0,
        tables_limited: 0,
        tables_mixed: 0,
        tables_plentiful: 0,
        outlets_scarce: 0,
        outlets_some: 0,
        outlets_ample: 0,
      })

      const { resultsByPlaceId } = await computeMatchScoresByPlaceId({
        serviceRoleClient: client,
        userId: 'user-1',
        places: [place],
      })

      const result = resultsByPlaceId['place-1']
      expect(result.matchScorePercent).toBeNull()
      expect(result.dominantNoise).toBeNull()
      expect(result.dominantVibe).toBeNull()
    })
  })

  describe('place with partial ratings (only noise voted)', () => {
    it('returns dominant noise but null vibe when only noise is voted', async () => {
      const client = makeSupabaseClient([])
      const place = makePlaceStats({
        rating_count: 3,
        avg_overall_rating: 3.5,
        noise_quiet: 3,
        noise_silent: 0,
        noise_vibrant: 0,
        vibe_focused: 0,
        vibe_casual: 0,
        vibe_social: 0,
      })

      const { resultsByPlaceId } = await computeMatchScoresByPlaceId({
        serviceRoleClient: client,
        userId: null,
        places: [place],
      })

      const result = resultsByPlaceId['place-1']
      expect(result.dominantNoise).toBe('Quiet')
      expect(result.dominantVibe).toBeNull()
      // Cold start (no userId): quality-only = Math.round((3.5/5)*100) = 70
      expect(result.matchScorePercent).toBe(70)
    })
  })

  describe('score bounds', () => {
    it('score is always 0 or above', async () => {
      const client = makeSupabaseClient([])
      const place = makePlaceStats({ avg_overall_rating: 0, rating_count: 1 })

      const { resultsByPlaceId } = await computeMatchScoresByPlaceId({
        serviceRoleClient: client,
        userId: null,
        places: [place],
      })

      const { matchScorePercent } = resultsByPlaceId['place-1']
      expect(matchScorePercent).not.toBeNull()
      expect(matchScorePercent!).toBeGreaterThanOrEqual(0)
    })

    it('score is always 100 or below', async () => {
      const client = makeSupabaseClient([])
      const place = makePlaceStats({ avg_overall_rating: 5, rating_count: 1 })

      const { resultsByPlaceId } = await computeMatchScoresByPlaceId({
        serviceRoleClient: client,
        userId: null,
        places: [place],
      })

      const { matchScorePercent } = resultsByPlaceId['place-1']
      expect(matchScorePercent).not.toBeNull()
      expect(matchScorePercent!).toBeLessThanOrEqual(100)
    })

    it('a perfect match with max avg gives score ≤ 100', async () => {
      const userRatings: MockRow[] = [
        { noise: 'silent', vibe: 'focused', overall_rating: 5 },
      ]
      const client = makeSupabaseClient(userRatings)
      const place = makePlaceStats({
        avg_overall_rating: 5,
        rating_count: 10,
        noise_silent: 10,
        noise_quiet: 0,
        noise_vibrant: 0,
        vibe_focused: 10,
        vibe_casual: 0,
        vibe_social: 0,
      })

      const { resultsByPlaceId } = await computeMatchScoresByPlaceId({
        serviceRoleClient: client,
        userId: 'user-1',
        places: [place],
      })

      const { matchScorePercent } = resultsByPlaceId['place-1']
      expect(matchScorePercent).toBeLessThanOrEqual(100)
      expect(matchScorePercent).toBeGreaterThanOrEqual(0)
    })
  })

  describe('null / undefined input', () => {
    it('handles null userId (cold-start): returns community quality score', async () => {
      const client = makeSupabaseClient([])
      const place = makePlaceStats({ avg_overall_rating: 4.0, rating_count: 5 })

      const { userHasRatings, resultsByPlaceId } = await computeMatchScoresByPlaceId({
        serviceRoleClient: client,
        userId: null,
        places: [place],
      })

      expect(userHasRatings).toBe(false)
      // cold start: Math.round((4/5)*100) = 80
      expect(resultsByPlaceId['place-1'].matchScorePercent).toBe(80)
    })

    it('handles empty places array gracefully', async () => {
      const client = makeSupabaseClient([])

      const { resultsByPlaceId } = await computeMatchScoresByPlaceId({
        serviceRoleClient: client,
        userId: 'user-1',
        places: [],
      })

      expect(Object.keys(resultsByPlaceId)).toHaveLength(0)
    })

    it('handles avg_overall_rating = null: matchScorePercent is null', async () => {
      const client = makeSupabaseClient([])
      const place = makePlaceStats({ avg_overall_rating: null, rating_count: 3 })

      const { resultsByPlaceId } = await computeMatchScoresByPlaceId({
        serviceRoleClient: client,
        userId: null,
        places: [place],
      })

      expect(resultsByPlaceId['place-1'].matchScorePercent).toBeNull()
    })
  })

  describe('dominant label tie-breaking', () => {
    it('noise tie resolves to Quiet (middle option)', async () => {
      const client = makeSupabaseClient([])
      const place = makePlaceStats({
        rating_count: 4,
        avg_overall_rating: 4,
        noise_silent: 2,
        noise_quiet: 2,
        noise_vibrant: 0,
      })

      const { resultsByPlaceId } = await computeMatchScoresByPlaceId({
        serviceRoleClient: client,
        userId: null,
        places: [place],
      })

      expect(resultsByPlaceId['place-1'].dominantNoise).toBe('Quiet')
    })

    it('vibe tie resolves to Casual (middle option)', async () => {
      const client = makeSupabaseClient([])
      const place = makePlaceStats({
        rating_count: 4,
        avg_overall_rating: 4,
        vibe_focused: 2,
        vibe_casual: 2,
        vibe_social: 0,
      })

      const { resultsByPlaceId } = await computeMatchScoresByPlaceId({
        serviceRoleClient: client,
        userId: null,
        places: [place],
      })

      expect(resultsByPlaceId['place-1'].dominantVibe).toBe('Casual')
    })
  })
})
