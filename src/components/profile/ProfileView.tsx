"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StatusMessage } from "@/components/StatusMessage";
import { UserAvatar } from "@/components/UserAvatar";
import { PostList } from "@/components/social/PostList";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import type {
  FollowListKind,
  FollowPerson,
  FollowToggleResponse,
  PublicProfile,
} from "@/lib/social/types";
import { OWN_PROFILE_ALIAS } from "@/lib/social/validation";
import { ensureAnonymousSession } from "@/lib/supabase/browser";

type Tab = "posts" | "likes" | FollowListKind;

/**
 * Twitter benzeri profil: kapak, fotoğraf, bio, takip sayıları ve
 * paylaşımlar / beğeniler / takipçiler sekmeleri.
 *
 * `username` null ise çağıranın kendi profili gösterilir (Hesabım).
 */
export function ProfileView({
  username,
  isRegistered,
  onEdit,
}: {
  username: string | null;
  isRegistered: boolean;
  /** Verilirse "Profili düzenle" bu fonksiyonu çağırır; yoksa /hesabim'e gider. */
  onEdit?: () => void;
}) {
  const segment = encodeURIComponent(username ?? OWN_PROFILE_ALIAS);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("posts");
  const [notice, setNotice] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureAnonymousSession()
      .then(() => fetchJson<{ profile: PublicProfile }>(`/api/profiles/${segment}`))
      .then((result) => {
        if (!cancelled) setProfile(result.profile);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : "Profil yüklenemedi.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [segment]);

  async function toggleFollow() {
    if (!profile?.username || following) return;
    setFollowing(true);
    setNotice(null);
    try {
      const result = await fetchJson<FollowToggleResponse>(
        `/api/profiles/${encodeURIComponent(profile.username)}/follow`,
        undefined,
        { method: "POST" },
      );
      setProfile((current) =>
        current
          ? {
              ...current,
              followedByMe: result.following,
              followerCount: Math.max(
                0,
                current.followerCount + (result.following === current.followedByMe ? 0 : result.following ? 1 : -1),
              ),
            }
          : current,
      );
    } catch (caught) {
      setNotice(caught instanceof ApiError ? caught.message : "İşlem tamamlanamadı.");
    } finally {
      setFollowing(false);
    }
  }

  if (error) {
    return (
      <StatusMessage tone="error" title="Profil açılamadı">
        {error}
      </StatusMessage>
    );
  }
  if (!profile) return <p className="text-sm text-ink-55">Profil yükleniyor…</p>;

  const signupHref = `/hesabini-kaydet?next=${encodeURIComponent(
    profile.username ? `/u/${profile.username}` : "/akis",
  )}`;

  const tabs: { value: Tab; label: string }[] = [
    { value: "posts", label: "Paylaşımlar" },
    ...(profile.isMe ? [{ value: "likes" as const, label: "Beğeniler" }] : []),
    { value: "followers", label: "Takipçiler" },
    { value: "following", label: "Takip edilenler" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-xl border border-line-10">
        <div className="aspect-[3/1] w-full bg-fill-placeholder">
          {profile.bannerUrl ? (
            // Public Supabase URL'si kullanıcıya göre dinamik host taşır.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.bannerUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>

        <div className="px-4 pb-4">
          <div className="flex items-start justify-between gap-3">
            <UserAvatar
              name={profile.displayName}
              url={profile.avatarUrl}
              size="xl"
              className="-mt-12 border-4 border-wm-background sm:-mt-16"
            />
            <div className="pt-3">
              {profile.isMe ? (
                onEdit ? (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="min-h-10 rounded-full border border-line-20 px-4 text-sm font-semibold hover:bg-fill-hover"
                  >
                    Profili düzenle
                  </button>
                ) : (
                  <Link
                    href="/hesabim?sekme=duzenle"
                    className="inline-flex min-h-10 items-center rounded-full border border-line-20 px-4 text-sm font-semibold text-wm-foreground no-underline hover:bg-fill-hover"
                  >
                    Profili düzenle
                  </Link>
                )
              ) : isRegistered ? (
                <button
                  type="button"
                  onClick={() => void toggleFollow()}
                  disabled={following}
                  aria-pressed={profile.followedByMe}
                  className={`min-h-10 rounded-full px-5 text-sm font-semibold disabled:opacity-60 ${
                    profile.followedByMe
                      ? "border border-line-20 hover:bg-fill-hover"
                      : "bg-fill-inverse text-on-inverse"
                  }`}
                >
                  {following ? "…" : profile.followedByMe ? "Takip ediliyor" : "Takip et"}
                </button>
              ) : (
                <Link
                  href={signupHref}
                  className="inline-flex min-h-10 items-center rounded-full bg-fill-inverse px-5 text-sm font-semibold text-on-inverse no-underline"
                >
                  Takip et
                </Link>
              )}
            </div>
          </div>

          <h1 className="mt-3 text-xl font-bold break-words">{profile.displayName}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-55">
            {profile.username ? `@${profile.username}` : "Kullanıcı adı belirlenmedi"}
            {profile.followsMe ? (
              <span className="rounded bg-fill-badge px-1.5 py-0.5 text-xs text-ink-70">
                Seni takip ediyor
              </span>
            ) : null}
          </p>
          {profile.bio ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
              {profile.bio}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-ink-55">{formatJoined(profile.createdAt)}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <button type="button" onClick={() => setTab("following")} className="hover:underline">
              <strong>{profile.followingCount}</strong>{" "}
              <span className="text-ink-60">Takip</span>
            </button>
            <button type="button" onClick={() => setTab("followers")} className="hover:underline">
              <strong>{profile.followerCount}</strong>{" "}
              <span className="text-ink-60">Takipçi</span>
            </button>
            <span>
              <strong>{profile.postCount}</strong>{" "}
              <span className="text-ink-60">Paylaşım</span>
            </span>
          </div>
          {profile.isMe && !profile.username ? (
            <p className="mt-3 text-xs text-ink-60">
              Profil sayfanın herkese görünmesi ve takip edilebilmen için bir kullanıcı adı belirle.
            </p>
          ) : null}
        </div>
      </section>

      {notice ? (
        <StatusMessage tone="warning" title="Üyelik gerekli">
          {notice}{" "}
          <Link href={signupHref} className="font-semibold underline">
            Hesabımı kaydet
          </Link>
        </StatusMessage>
      ) : null}

      <div role="tablist" aria-label="Profil" className="flex overflow-x-auto border-b border-line-10">
        {tabs.map((item) => {
          const selected = item.value === tab;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(item.value)}
              className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm whitespace-nowrap transition-colors hover:bg-fill-hover ${
                selected ? "border-brand-green font-semibold" : "border-transparent text-ink-60"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "posts" || tab === "likes" ? (
        <PostList
          key={tab}
          source={`/api/profiles/${segment}/posts?kind=${tab}`}
          isRegistered={isRegistered}
          emptyText={
            tab === "likes"
              ? "Henüz bir paylaşım beğenmedin."
              : profile.isMe
                ? "Henüz bir şey paylaşmadın. Akıştan ilk film sohbetini başlatabilirsin."
                : "Bu hesap henüz bir şey paylaşmadı."
          }
          onMembershipNeeded={setNotice}
        />
      ) : (
        <FollowList key={tab} segment={segment} kind={tab} isRegistered={isRegistered} />
      )}
    </div>
  );
}

function FollowList({
  segment,
  kind,
  isRegistered,
}: {
  segment: string;
  kind: FollowListKind;
  isRegistered: boolean;
}) {
  const [people, setPeople] = useState<FollowPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ people: FollowPerson[] }>(`/api/profiles/${segment}/follows?kind=${kind}`)
      .then((result) => {
        if (!cancelled) setPeople(result.people);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : "Liste yüklenemedi.");
      });
    return () => {
      cancelled = true;
    };
  }, [segment, kind]);

  async function toggle(person: FollowPerson) {
    if (busy) return;
    setBusy(person.username);
    setError(null);
    try {
      const result = await fetchJson<FollowToggleResponse>(
        `/api/profiles/${encodeURIComponent(person.username)}/follow`,
        undefined,
        { method: "POST" },
      );
      setPeople((current) =>
        current?.map((entry) =>
          entry.username === person.username ? { ...entry, followedByMe: result.following } : entry,
        ) ?? current,
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "İşlem tamamlanamadı.");
    } finally {
      setBusy(null);
    }
  }

  if (error && !people) return <p role="alert" className="text-sm text-error-ink">{error}</p>;
  if (!people) return <p className="text-sm text-ink-55">Yükleniyor…</p>;

  return (
    <div className="grid gap-2">
      {error ? <p role="alert" className="text-sm text-error-ink">{error}</p> : null}
      {people.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-20 p-5 text-center text-sm text-ink-60">
          {kind === "followers" ? "Henüz takipçi yok." : "Henüz kimse takip edilmiyor."}
        </p>
      ) : null}
      {people.map((person) => (
        <article
          key={person.username}
          className="flex items-center gap-3 rounded-xl border border-line-10 p-3"
        >
          <UserAvatar name={person.displayName} url={person.avatarUrl} />
          <div className="min-w-0 flex-1">
            <Link
              href={`/u/${person.username}`}
              className="block truncate text-sm font-semibold text-wm-foreground no-underline hover:underline"
            >
              {person.displayName}
            </Link>
            <p className="truncate text-xs text-ink-55">
              @{person.username}
              {person.bio ? ` · ${person.bio}` : ""}
            </p>
          </div>
          {isRegistered && !person.isMe ? (
            <button
              type="button"
              onClick={() => void toggle(person)}
              disabled={busy !== null}
              aria-pressed={person.followedByMe}
              className={`min-h-9 shrink-0 rounded-full px-4 text-xs font-semibold disabled:opacity-60 ${
                person.followedByMe
                  ? "border border-line-20 hover:bg-fill-hover"
                  : "bg-fill-inverse text-on-inverse"
              }`}
            >
              {person.followedByMe ? "Takip ediliyor" : "Takip et"}
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function formatJoined(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(date);
  return `${month} tarihinde katıldı`;
}
