import { describe, it, expect } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { patchRatingSocialCounts } from '@/lib/ratingSocialCache'
import type { RatingCardItem } from '@/components/social/RatingCard'

function item(id: string, extra: Partial<RatingCardItem> = {}): RatingCardItem {
  return {
    id,
    notes: null,
    photo_paths: [],
    created_at: new Date().toISOString(),
    place_id: 'place-1',
    place_name: 'Fairfax Coffee',
    match_score_percent: null,
    is_saved: false,
    rater_id: 'user-1',
    rater_name: null,
    rater_username: null,
    rater_avatar: null,
    like_count: 0,
    comment_count: 0,
    viewer_has_liked: false,
    ...extra,
  }
}

/**
 * Item 8 — likes must never invalidate ["social-feed"]. It is an infinite query
 * whose first page comes from a moving last_feed_view_at cutoff, so a refetch
 * can return a different set of cards and collapse loaded pages.
 */
describe('patchRatingSocialCounts', () => {
  it('patches the matching rating across infinite feed pages', () => {
    const qc = new QueryClient()
    qc.setQueryData(['social-feed'], {
      pageParams: [undefined, 'cursor'],
      pages: [
        { data: [item('r1'), item('r2')] },
        { data: [item('r3')] },
      ],
    })

    patchRatingSocialCounts(qc, 'r3', { like_count: 7, viewer_has_liked: true })

    const cached = qc.getQueryData(['social-feed']) as {
      pages: { data: RatingCardItem[] }[]
    }
    expect(cached.pages[1].data[0].like_count).toBe(7)
    expect(cached.pages[1].data[0].viewer_has_liked).toBe(true)
    // Untouched rows keep their values.
    expect(cached.pages[0].data[0].like_count).toBe(0)
  })

  it('preserves page structure so loaded pages are not collapsed', () => {
    const qc = new QueryClient()
    qc.setQueryData(['social-feed'], {
      pageParams: [undefined, 'cursor'],
      pages: [{ data: [item('r1')] }, { data: [item('r2')] }],
    })

    patchRatingSocialCounts(qc, 'r1', { like_count: 1 })

    const cached = qc.getQueryData(['social-feed']) as {
      pages: unknown[]
      pageParams: unknown[]
    }
    expect(cached.pages).toHaveLength(2)
    expect(cached.pageParams).toHaveLength(2)
  })

  it('patches every cached profile-ratings list regardless of userId', () => {
    const qc = new QueryClient()
    qc.setQueryData(['profile-ratings', 'user-a'], [item('r1')])
    qc.setQueryData(['profile-ratings', 'user-b'], [item('r1'), item('r9')])

    patchRatingSocialCounts(qc, 'r1', { comment_count: 5 })

    expect(
      (qc.getQueryData(['profile-ratings', 'user-a']) as RatingCardItem[])[0]
        .comment_count,
    ).toBe(5)
    expect(
      (qc.getQueryData(['profile-ratings', 'user-b']) as RatingCardItem[])[0]
        .comment_count,
    ).toBe(5)
    expect(
      (qc.getQueryData(['profile-ratings', 'user-b']) as RatingCardItem[])[1]
        .comment_count,
    ).toBe(0)
  })

  it('is a no-op when nothing is cached', () => {
    const qc = new QueryClient()
    expect(() =>
      patchRatingSocialCounts(qc, 'missing', { like_count: 1 }),
    ).not.toThrow()
  })
})
