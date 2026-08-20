import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { RatingCardItem } from "@/components/social/RatingCard";

export type RatingSocialPatch = Partial<
  Pick<RatingCardItem, "like_count" | "comment_count" | "viewer_has_liked">
>;

type SocialFeedPage = { data: RatingCardItem[] };

/**
 * Patch one rating's social counts everywhere it is cached.
 *
 * Deliberately NOT an invalidation of ["social-feed"]: that is an infinite
 * query whose first page is derived from a moving last_feed_view_at cutoff, so
 * refetching can return a different set of cards and collapse pages the user
 * already loaded via "View older". Liking must never reshuffle the feed.
 *
 * The partial ["profile-ratings"] key matches every userId, because the same
 * rating can be cached under a profile and in the feed simultaneously.
 */
export function patchRatingSocialCounts(
  queryClient: QueryClient,
  ratingId: string,
  patch: RatingSocialPatch,
): void {
  queryClient.setQueriesData<InfiniteData<SocialFeedPage>>(
    { queryKey: ["social-feed"] },
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: page.data.map((item) =>
            item.id === ratingId ? { ...item, ...patch } : item,
          ),
        })),
      },
  );

  queryClient.setQueriesData<RatingCardItem[]>(
    { queryKey: ["profile-ratings"] },
    (old) =>
      old?.map((item) =>
        item.id === ratingId ? { ...item, ...patch } : item,
      ),
  );
}
