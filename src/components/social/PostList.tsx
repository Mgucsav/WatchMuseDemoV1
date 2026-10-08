"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { UserAvatar } from "@/components/UserAvatar";
import { SocialComposer } from "@/components/social/SocialComposer";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import type {
  SocialFeedResponse,
  SocialPost,
  SocialToggleResponse,
} from "@/lib/social/types";
import { ensureAnonymousSession } from "@/lib/supabase/browser";

/**
 * Bir API ucundan gelen gönderileri listeler; beğeni, repost, silme ve
 * cevapları yönetir. Akış, profil paylaşımları ve beğeniler bunu kullanır.
 * `refreshKey` değiştiğinde liste yeniden yüklenir.
 */
export function PostList({
  source,
  isRegistered,
  emptyText,
  refreshKey = 0,
  onMembershipNeeded,
}: {
  source: string;
  isRegistered: boolean;
  emptyText: string;
  refreshKey?: number;
  onMembershipNeeded: (message: string) => void;
}) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const reload = useCallback(async () => {
    await ensureAnonymousSession();
    const result = await fetchJson<SocialFeedResponse>(source);
    setPosts(result.posts);
    setError(null);
  }, [source]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      ensureAnonymousSession()
        .then(() => fetchJson<SocialFeedResponse>(source))
        .then((result) => {
          if (!cancelled) {
            setPosts(result.posts);
            setError(null);
          }
        })
        .catch((caught: unknown) => {
          if (!cancelled) {
            setError(caught instanceof ApiError ? caught.message : "Paylaşımlar yüklenemedi.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, refreshKey]);

  async function react(post: SocialPost, reaction: "like" | "repost") {
    if (!isRegistered) {
      onMembershipNeeded("Beğenmek, cevaplamak veya repost etmek için hesabınızı kaydedin.");
      return;
    }
    if (actingOn) return;
    setActingOn(`${post.id}:${reaction}`);
    setError(null);
    try {
      const result = await fetchJson<SocialToggleResponse>(
        `/api/feed/${encodeURIComponent(post.id)}/${reaction}`,
        undefined,
        { method: "POST" },
      );
      setPosts((current) =>
        current.map((entry) =>
          entry.id !== post.id
            ? entry
            : reaction === "like"
              ? {
                  ...entry,
                  likedByMe: result.active,
                  likeCount: Math.max(0, entry.likeCount + (result.active ? 1 : -1)),
                }
              : {
                  ...entry,
                  repostedByMe: result.active,
                  repostCount: Math.max(0, entry.repostCount + (result.active ? 1 : -1)),
                },
        ),
      );
      if (reaction === "repost" && result.active) void reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "İşlem tamamlanamadı.");
    } finally {
      setActingOn(null);
    }
  }

  async function requestDelete(post: SocialPost): Promise<boolean> {
    if (!post.isMine || actingOn) return false;
    if (!window.confirm("Bu paylaşımı kalıcı olarak silmek istediğinize emin misiniz?")) {
      return false;
    }
    setActingOn(`${post.id}:delete`);
    setError(null);
    try {
      await fetchJson<{ ok: true }>(
        `/api/feed/${encodeURIComponent(post.id)}`,
        undefined,
        { method: "DELETE" },
      );
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Paylaşım silinemedi.");
      return false;
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div className="grid gap-3">
      {error ? (
        <p role="alert" className="text-sm text-error-ink">
          {error}
        </p>
      ) : null}

      {loading && posts.length === 0 ? (
        <p className="text-sm text-ink-55">Yükleniyor…</p>
      ) : null}

      {!loading && !error && posts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-20 p-5 text-center text-sm text-ink-60">
          {emptyText}
        </p>
      ) : null}

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          isRegistered={isRegistered}
          actingOn={actingOn}
          onReact={react}
          requestDelete={requestDelete}
          onDeleted={() => setPosts((current) => current.filter((entry) => entry.id !== post.id))}
          onRepliesChanged={() => void reload()}
          onMembershipNeeded={() =>
            onMembershipNeeded("Cevap vermek için hesabınızı kaydetmeniz gerekiyor.")
          }
        />
      ))}
    </div>
  );
}

function PostCard({
  post,
  isRegistered,
  actingOn,
  onReact,
  requestDelete,
  onDeleted,
  onRepliesChanged,
  onMembershipNeeded,
  reply = false,
}: {
  post: SocialPost;
  isRegistered: boolean;
  actingOn: string | null;
  onReact: (post: SocialPost, reaction: "like" | "repost") => void | Promise<void>;
  requestDelete: (post: SocialPost) => Promise<boolean>;
  onDeleted: () => void;
  onRepliesChanged: () => void;
  onMembershipNeeded: () => void;
  reply?: boolean;
}) {
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [replies, setReplies] = useState<SocialPost[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  async function loadReplies() {
    setLoadingReplies(true);
    setReplyError(null);
    try {
      const result = await fetchJson<SocialFeedResponse>(
        `/api/feed/${encodeURIComponent(post.id)}/replies`,
      );
      setReplies(result.posts);
    } catch (caught) {
      setReplyError(caught instanceof ApiError ? caught.message : "Cevaplar yüklenemedi.");
    } finally {
      setLoadingReplies(false);
    }
  }

  function toggleReplies() {
    if (reply) return;
    const next = !repliesOpen;
    setRepliesOpen(next);
    if (next) void loadReplies();
  }

  const profileHref = post.authorUsername ? `/u/${post.authorUsername}` : null;

  return (
    <article className={reply ? "rounded-lg border border-line-10 p-3" : "rounded-xl border border-line-15 p-4"}>
      {post.latestReposterDisplayName && !reply ? (
        <p className="mb-2 text-xs text-ink-50">
          ↻ {post.latestReposterDisplayName} repostladı
        </p>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {profileHref ? (
            <Link href={profileHref} aria-hidden="true" tabIndex={-1} className="no-underline">
              <UserAvatar name={post.authorDisplayName} url={post.authorAvatarUrl} size="sm" />
            </Link>
          ) : (
            <UserAvatar name={post.authorDisplayName} url={post.authorAvatarUrl} size="sm" />
          )}
          <div className="min-w-0">
            {profileHref ? (
              <Link
                href={profileHref}
                className="block truncate text-sm font-semibold text-wm-foreground no-underline hover:underline"
              >
                {post.authorDisplayName}
              </Link>
            ) : (
              <p className="truncate text-sm font-semibold">{post.authorDisplayName}</p>
            )}
            <p className="truncate text-xs text-ink-45">
              {post.authorUsername ? `@${post.authorUsername} · ` : ""}
              <time dateTime={post.createdAt}>{formatSocialTime(post.createdAt)}</time>
            </p>
          </div>
        </div>
        {post.isMine ? (
          <button
            type="button"
            onClick={async () => {
              if (await requestDelete(post)) onDeleted();
            }}
            disabled={actingOn !== null}
            className="min-h-9 rounded-lg border border-red-700/40 px-3 text-xs font-semibold text-error-ink disabled:opacity-50"
          >
            {actingOn === `${post.id}:delete` ? "Siliniyor…" : "Sil"}
          </button>
        ) : null}
      </div>

      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{post.body}</p>

      {post.movie ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-line-10 p-3">
          {post.movie.posterUrl ? (
            <Image
              src={post.movie.posterUrl}
              alt={`${post.movie.title} afişi`}
              width={56}
              height={84}
              className="h-[84px] w-14 shrink-0 rounded object-cover"
            />
          ) : (
            <div className="flex h-[84px] w-14 shrink-0 items-center justify-center rounded bg-fill-placeholder text-center text-[10px]">
              Afiş yok
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{post.movie.title}</p>
            <p className="mt-1 text-xs text-ink-50">TMDb #{post.movie.id}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-10 pt-3 text-xs">
        {!reply ? (
          <button
            type="button"
            onClick={() => {
              if (!isRegistered) onMembershipNeeded();
              toggleReplies();
            }}
            className="min-h-9 rounded-lg px-3 hover:bg-fill-hover"
          >
            ↩ {post.replyCount} cevap
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onReact(post, "like")}
          disabled={actingOn === `${post.id}:like`}
          aria-pressed={post.likedByMe}
          className={`min-h-9 rounded-lg px-3 hover:bg-fill-hover disabled:opacity-50 ${
            post.likedByMe ? "font-semibold text-brand-red" : ""
          }`}
        >
          {post.likedByMe ? "♥" : "♡"} {post.likeCount}
        </button>
        <button
          type="button"
          onClick={() => onReact(post, "repost")}
          disabled={actingOn === `${post.id}:repost`}
          aria-pressed={post.repostedByMe}
          className={`min-h-9 rounded-lg px-3 hover:bg-fill-hover disabled:opacity-50 ${
            post.repostedByMe ? "font-semibold text-brand-green" : ""
          }`}
        >
          ↻ {post.repostCount}
        </button>
      </div>

      {repliesOpen && !reply ? (
        <div className="mt-3 grid gap-3 border-t border-line-10 pt-3">
          {isRegistered ? (
            <SocialComposer
              compact
              parentPostId={post.id}
              onCreated={async () => {
                await loadReplies();
                onRepliesChanged();
              }}
            />
          ) : (
            <p className="text-xs text-ink-55">
              Cevap yazmak için üyelik gerekir; mevcut cevapları okuyabilirsiniz.
            </p>
          )}
          {loadingReplies ? (
            <p className="text-xs text-ink-50">Cevaplar yükleniyor…</p>
          ) : null}
          {replyError ? <p className="text-sm text-error-ink">{replyError}</p> : null}
          {replies.map((entry) => (
            <PostCard
              key={entry.id}
              post={entry}
              reply
              isRegistered={isRegistered}
              actingOn={actingOn}
              onReact={async (target, reaction) => {
                await onReact(target, reaction);
                await loadReplies();
              }}
              requestDelete={requestDelete}
              onDeleted={() => {
                setReplies((current) => current.filter((replyPost) => replyPost.id !== entry.id));
                onRepliesChanged();
              }}
              onRepliesChanged={onRepliesChanged}
              onMembershipNeeded={onMembershipNeeded}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function formatSocialTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
