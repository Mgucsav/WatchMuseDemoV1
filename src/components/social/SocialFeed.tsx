"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { MoviePoster } from "@/components/MoviePoster";
import { StatusMessage } from "@/components/StatusMessage";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import type {
  SocialFeedResponse,
  SocialPost,
  SocialToggleResponse,
} from "@/lib/social/types";
import { MAX_SOCIAL_POST_LENGTH } from "@/lib/social/validation";
import { ensureAnonymousSession } from "@/lib/supabase/browser";
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_QUERY_LENGTH,
} from "@/lib/constants";
import type { MovieSearchResult, MovieSummary } from "@/lib/tmdb/types";

export function SocialFeed({ isRegistered }: { isRegistered: boolean }) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    await ensureAnonymousSession();
    const result = await fetchJson<SocialFeedResponse>("/api/feed");
    setPosts(result.posts);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    ensureAnonymousSession()
      .then(() => fetchJson<SocialFeedResponse>("/api/feed"))
      .then((result) => {
        if (!cancelled) setPosts(result.posts);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : "Akış yüklenemedi.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function react(post: SocialPost, reaction: "like" | "repost") {
    if (!isRegistered) {
      setNotice("Beğenmek, cevaplamak veya repost etmek için hesabınızı kaydedin.");
      return;
    }
    const actionKey = `${post.id}:${reaction}`;
    if (actingOn) return;
    setActingOn(actionKey);
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
            : {
                ...entry,
                ...(reaction === "like"
                  ? {
                      likedByMe: result.active,
                      likeCount: Math.max(
                        0,
                        entry.likeCount + (result.active ? 1 : -1),
                      ),
                    }
                  : {
                      repostedByMe: result.active,
                      repostCount: Math.max(
                        0,
                        entry.repostCount + (result.active ? 1 : -1),
                      ),
                    }),
              },
        ),
      );
      if (reaction === "repost" && result.active) void loadFeed();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "İşlem tamamlanamadı.");
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <header>
        <h1 className="text-xl font-bold">WatchMuse Akış</h1>
        <p className="mt-1 text-sm text-black/70 dark:text-white/70">
          Filmler hakkında konuşun, yorumlara katılın ve yeni fikirler keşfedin.
        </p>
      </header>

      {isRegistered ? (
        <SocialComposer
          onCreated={async () => {
            setLoading(true);
            await loadFeed().finally(() => setLoading(false));
          }}
        />
      ) : (
        <StatusMessage tone="warning" title="Akışı okuyabilirsiniz">
          Paylaşım, cevap, beğeni ve repost için{" "}
          <Link href="/hesabini-kaydet?next=/" className="font-semibold underline">
            anonim hesabınızı kaydedin
          </Link>{" "}
          veya <Link href="/giris?next=/" className="font-semibold underline">giriş yapın</Link>.
        </StatusMessage>
      )}

      {notice ? (
        <StatusMessage tone="warning" title="Üyelik gerekli">
          {notice}{" "}
          <Link href="/hesabini-kaydet?next=/" className="font-semibold underline">
            Hesabımı kaydet
          </Link>
        </StatusMessage>
      ) : null}

      {error ? (
        <StatusMessage tone="error" title="Akış kullanılamadı">
          {error}
        </StatusMessage>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Son paylaşımlar</h2>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadFeed().finally(() => setLoading(false));
          }}
          disabled={loading}
          className="min-h-10 rounded-lg border border-black/20 px-3 text-sm dark:border-white/25"
        >
          {loading ? "Yenileniyor…" : "Yenile"}
        </button>
      </div>

      {!loading && posts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/20 p-5 text-center text-sm text-black/60 dark:border-white/25 dark:text-white/60">
          Akış henüz boş. İlk film sohbetini başlatabilirsiniz.
        </p>
      ) : null}

      <div className="grid gap-3">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            isRegistered={isRegistered}
            actingOn={actingOn}
            onReact={react}
            onRepliesChanged={() => void loadFeed()}
            onMembershipNeeded={() =>
              setNotice("Cevap vermek için hesabınızı kaydetmeniz gerekiyor.")
            }
          />
        ))}
      </div>
    </div>
  );
}

function SocialComposer({
  parentPostId = null,
  compact = false,
  onCreated,
}: {
  parentPostId?: string | null;
  compact?: boolean;
  onCreated: () => void | Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [movieQuery, setMovieQuery] = useState("");
  const [movieResults, setMovieResults] = useState<MovieSummary[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<MovieSummary | null>(null);
  const [searchingMovies, setSearchingMovies] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedMovieQuery = movieQuery.trim();

  useEffect(() => {
    if (compact || selectedMovie || trimmedMovieQuery.length < SEARCH_MIN_QUERY_LENGTH) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchJson<MovieSearchResult>(
        `/api/movies/search?q=${encodeURIComponent(trimmedMovieQuery)}`,
        controller.signal,
      )
        .then((result) => {
          setMovieResults(result.results.slice(0, 5));
          setSearchingMovies(false);
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          setError(caught instanceof ApiError ? caught.message : "Film aranamadı.");
          setSearchingMovies(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [compact, selectedMovie, trimmedMovieQuery]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await fetchJson<{ postId: string }>("/api/feed", undefined, {
        method: "POST",
        body: {
          body,
          parentPostId,
          movie: selectedMovie
            ? {
                id: selectedMovie.id,
                title: selectedMovie.title,
                posterPath: selectedMovie.posterPath,
              }
            : null,
        },
      });
      setBody("");
      setMovieQuery("");
      setMovieResults([]);
      setSelectedMovie(null);
      await onCreated();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Gönderi paylaşılamadı.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={compact ? "grid gap-2" : "grid gap-3 rounded-xl border border-black/15 p-4 dark:border-white/20"}
    >
      {!compact ? <h2 className="font-semibold">Bir film konuşması başlat</h2> : null}
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={MAX_SOCIAL_POST_LENGTH}
        rows={compact ? 2 : 3}
        placeholder={compact ? "Bu yoruma cevap ver…" : "Bir film hakkında ne düşünüyorsun?"}
        className="w-full resize-y rounded-lg border border-black/20 bg-transparent px-3 py-2 text-sm outline-none dark:border-white/25"
      />

      {!compact ? (
        <div className="grid gap-2">
          {selectedMovie ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-black/10 p-2 dark:border-white/15">
              <div className="flex min-w-0 items-center gap-3">
                <MoviePoster movie={selectedMovie} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{selectedMovie.title}</p>
                  <p className="text-xs text-black/55 dark:text-white/55">Gönderiye eklendi</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedMovie(null);
                  setMovieQuery("");
                  setMovieResults([]);
                }}
                className="min-h-9 px-2 text-xs underline"
              >
                Kaldır
              </button>
            </div>
          ) : (
            <label className="text-xs font-medium">
              Film ekle <span className="font-normal text-black/50 dark:text-white/50">(isteğe bağlı)</span>
              <input
                type="search"
                value={movieQuery}
                onChange={(event) => {
                  const value = event.target.value;
                  setMovieQuery(value);
                  setMovieResults([]);
                  setSearchingMovies(value.trim().length >= SEARCH_MIN_QUERY_LENGTH);
                }}
                placeholder="Film adı ara…"
                className="mt-1 min-h-10 w-full rounded-lg border border-black/20 bg-transparent px-3 text-sm dark:border-white/25"
              />
            </label>
          )}

          {!selectedMovie && searchingMovies ? (
            <p className="text-xs text-black/50 dark:text-white/50">Film aranıyor…</p>
          ) : null}

          {!selectedMovie && movieResults.length > 0 ? (
            <div className="grid gap-1 rounded-lg border border-black/10 p-2 dark:border-white/15">
              {movieResults.map((movie) => (
                <button
                  key={movie.id}
                  type="button"
                  onClick={() => {
                    setSelectedMovie(movie);
                    setMovieResults([]);
                    setSearchingMovies(false);
                  }}
                  className="flex items-center gap-3 rounded-md p-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/10"
                >
                  <MoviePoster movie={movie} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{movie.title}</span>
                    <span className="text-xs text-black/50 dark:text-white/50">
                      {movie.releaseYear ?? "Yıl bilinmiyor"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-black/45 dark:text-white/45">
          {body.length}/{MAX_SOCIAL_POST_LENGTH}
        </span>
        <button
          type="submit"
          disabled={sending || body.trim() === ""}
          className="min-h-10 rounded-lg bg-black px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {sending ? "Paylaşılıyor…" : compact ? "Cevapla" : "Paylaş"}
        </button>
      </div>
      {error ? <p className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}
    </form>
  );
}

function PostCard({
  post,
  isRegistered,
  actingOn,
  onReact,
  onRepliesChanged,
  onMembershipNeeded,
  reply = false,
}: {
  post: SocialPost;
  isRegistered: boolean;
  actingOn: string | null;
  onReact: (post: SocialPost, reaction: "like" | "repost") => void | Promise<void>;
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

  return (
    <article className={reply ? "rounded-lg border border-black/10 p-3 dark:border-white/15" : "rounded-xl border border-black/15 p-4 dark:border-white/20"}>
      {post.latestReposterDisplayName && !reply ? (
        <p className="mb-2 text-xs text-black/50 dark:text-white/50">
          ↻ {post.latestReposterDisplayName} repostladı
        </p>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{post.authorDisplayName}</p>
          <time className="text-xs text-black/45 dark:text-white/45">
            {formatSocialTime(post.createdAt)}
          </time>
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{post.body}</p>

      {post.movie ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-black/10 p-3 dark:border-white/15">
          {post.movie.posterUrl ? (
            <Image
              src={post.movie.posterUrl}
              alt={`${post.movie.title} afişi`}
              width={56}
              height={84}
              className="h-[84px] w-14 shrink-0 rounded object-cover"
            />
          ) : (
            <div className="flex h-[84px] w-14 shrink-0 items-center justify-center rounded bg-black/5 text-center text-[10px] dark:bg-white/10">
              Afiş yok
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{post.movie.title}</p>
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">TMDb #{post.movie.id}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/10 pt-3 text-xs dark:border-white/15">
        {!reply ? (
          <button
            type="button"
            onClick={() => {
              if (!isRegistered) onMembershipNeeded();
              toggleReplies();
            }}
            className="min-h-9 rounded-lg px-3 hover:bg-black/[0.04] dark:hover:bg-white/10"
          >
            ↩ {post.replyCount} cevap
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onReact(post, "like")}
          disabled={actingOn === `${post.id}:like`}
          aria-pressed={post.likedByMe}
          className={`min-h-9 rounded-lg px-3 hover:bg-black/[0.04] disabled:opacity-50 dark:hover:bg-white/10 ${
            post.likedByMe ? "font-semibold" : ""
          }`}
        >
          {post.likedByMe ? "♥" : "♡"} {post.likeCount}
        </button>
        <button
          type="button"
          onClick={() => onReact(post, "repost")}
          disabled={actingOn === `${post.id}:repost`}
          aria-pressed={post.repostedByMe}
          className={`min-h-9 rounded-lg px-3 hover:bg-black/[0.04] disabled:opacity-50 dark:hover:bg-white/10 ${
            post.repostedByMe ? "font-semibold" : ""
          }`}
        >
          ↻ {post.repostCount}
        </button>
      </div>

      {repliesOpen && !reply ? (
        <div className="mt-3 grid gap-3 border-t border-black/10 pt-3 dark:border-white/15">
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
            <p className="text-xs text-black/55 dark:text-white/55">
              Cevap yazmak için üyelik gerekir; mevcut cevapları okuyabilirsiniz.
            </p>
          )}
          {loadingReplies ? (
            <p className="text-xs text-black/50 dark:text-white/50">Cevaplar yükleniyor…</p>
          ) : null}
          {replyError ? <p className="text-sm text-red-700 dark:text-red-300">{replyError}</p> : null}
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
