"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { useToast } from "@/components/ui/Toast";
import { ensureAuthForGatedAction } from "@/lib/authGate";
import { patchRatingSocialCounts } from "@/lib/ratingSocialCache";
import { MAX_COMMENT_LENGTH } from "@/lib/constants/comments";
import { timeAgo } from "@/lib/timeAgo";
import type { AnalyticsSource } from "@/lib/analytics";

export type RatingComment = {
  id: string;
  rating_id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_name: string | null;
  author_username: string | null;
  author_avatar: string | null;
  can_delete: boolean;
};

function displayName(comment: RatingComment): string {
  if (comment.author_username) return `@${comment.author_username}`;
  return comment.author_name ?? "Anonymous";
}

async function fetchComments(ratingId: string): Promise<RatingComment[]> {
  const res = await fetch(
    `/api/social/ratings/${encodeURIComponent(ratingId)}/comments`,
    { credentials: "same-origin" },
  );
  if (!res.ok) throw new Error("Failed to load comments");
  const json = (await res.json()) as { data: RatingComment[] | null };
  return json.data ?? [];
}

/**
 * Inline comment thread for a rating card.
 *
 * Inline rather than a modal or bottom sheet: RatingCard renders in both the
 * social feed and profile pages, and an inline block behaves identically in
 * both with no portal, z-index or scroll-lock coordination, and without losing
 * the reader's place in the feed.
 */
export function RatingCommentsThread({
  ratingId,
  placeId,
  placeName,
  source = "feed",
  onCountChange,
}: {
  ratingId: string;
  placeId: string;
  placeName: string;
  source?: AnalyticsSource;
  onCountChange?: (count: number) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [draft, setDraft] = useState("");

  const query = useQuery({
    queryKey: ["rating-comments", ratingId],
    queryFn: () => fetchComments(ratingId),
  });

  const comments = query.data ?? [];

  function syncCount(next: number) {
    onCountChange?.(next);
    patchRatingSocialCounts(queryClient, ratingId, { comment_count: next });
  }

  const postMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch(
        `/api/social/ratings/${encodeURIComponent(ratingId)}/comments`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Failed to post comment");
      }
    },
    onSuccess: () => {
      setDraft("");
      syncCount(comments.length + 1);
      queryClient.invalidateQueries({
        queryKey: ["rating-comments", ratingId],
      });
    },
    onError: (err) =>
      showToast(
        err instanceof Error ? err.message : "Couldn't post that comment",
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(
        `/api/social/ratings/${encodeURIComponent(ratingId)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Failed to delete comment");
      }
    },
    onSuccess: () => {
      syncCount(Math.max(0, comments.length - 1));
      queryClient.invalidateQueries({
        queryKey: ["rating-comments", ratingId],
      });
    },
    onError: (err) =>
      showToast(
        err instanceof Error ? err.message : "Couldn't delete that comment",
      ),
  });

  async function handlePost() {
    const body = draft.trim();
    if (!body || postMutation.isPending) return;

    const returnPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/feed";

    const allowed = await ensureAuthForGatedAction(router.push, {
      action_type: "comment_rating",
      source,
      place_id: placeId,
      place_name: placeName,
      returnPath,
    });
    if (!allowed) return;

    postMutation.mutate(body);
  }

  return (
    <div className="flex flex-col gap-12 border-t border-surface-alt pt-12">
      <div className="flex flex-col gap-8">
        <label htmlFor={`comment-${ratingId}`} className="sr-only">
          Add a comment
        </label>
        <TextArea
          id={`comment-${ratingId}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_COMMENT_LENGTH}
          rows={2}
          placeholder="Add a comment…"
        />
        <div className="flex items-center justify-between gap-12">
          <span className="text-ui-caption text-text-tertiary">
            {draft.trim().length}/{MAX_COMMENT_LENGTH}
          </span>
          <Button
            type="button"
            variant="primary"
            onClick={handlePost}
            disabled={draft.trim().length === 0 || postMutation.isPending}
          >
            {postMutation.isPending ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>

      {query.isLoading && (
        <p className="text-body-s text-text-tertiary">Loading comments…</p>
      )}

      {query.isError && (
        <p role="alert" className="text-body-s text-status-low">
          Couldn&rsquo;t load comments.
        </p>
      )}

      {!query.isLoading && !query.isError && comments.length === 0 && (
        <p className="text-body-s text-text-tertiary">
          No comments yet. Be the first.
        </p>
      )}

      {comments.length > 0 && (
        <ul className="flex flex-col gap-12">
          {comments.map((comment) => (
            <li key={comment.id} className="flex items-start gap-8">
              <Link
                href={`/profile/${comment.author_id}`}
                className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-alt"
                aria-label={`View ${displayName(comment)}'s profile`}
              >
                {comment.author_avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={comment.author_avatar}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-ui-label-m text-text-secondary">
                    {displayName(comment).replace("@", "").charAt(0).toUpperCase()}
                  </span>
                )}
              </Link>

              <div className="min-w-0 flex-1">
                <p className="text-ui-label-m text-text-secondary">
                  <Link
                    href={`/profile/${comment.author_id}`}
                    className="text-accent"
                  >
                    {displayName(comment)}
                  </Link>
                  <span className="ml-8 font-normal">
                    · {timeAgo(comment.created_at)}
                  </span>
                </p>
                {/* React escapes this; never render comment bodies as HTML. */}
                <p className="whitespace-pre-wrap break-words text-body-s text-text">
                  {comment.body}
                </p>
              </div>

              {comment.can_delete && (
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(comment.id)}
                  disabled={deleteMutation.isPending}
                  aria-label="Delete comment"
                  className="shrink-0 text-text-tertiary"
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
