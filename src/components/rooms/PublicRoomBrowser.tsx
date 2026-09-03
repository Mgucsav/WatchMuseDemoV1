"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { StatusMessage } from "@/components/StatusMessage";
import { SubscriptionPicker } from "@/components/rooms/SubscriptionPicker";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { requiresRegisteredRoomAccount } from "@/lib/rooms/access-policy";
import { isSubscriptionKey } from "@/lib/rooms/subscriptions";
import type { JoinRoomResult, PublicRoomSummary } from "@/lib/rooms/types";
import { ensureAnonymousSession } from "@/lib/supabase/browser";
import type { TargetProviderKey } from "@/lib/tmdb/types";

type ListResponse = { rooms: PublicRoomSummary[] };
const SAVED_SUBSCRIPTIONS_KEY = "watchmuse_room_subscriptions";

export function PublicRoomBrowser({ canJoinPublic }: { canJoinPublic: boolean }) {
  const [rooms, setRooms] = useState<PublicRoomSummary[]>([]);
  const [subscriptions, setSubscriptions] = useState<TargetProviderKey[]>([]);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [choosingForId, setChoosingForId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureAnonymousSession();
      const result = await fetchJson<ListResponse>("/api/rooms");
      setRooms(result.rooms);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Odalar alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    ensureAnonymousSession()
      .then(() => fetchJson<ListResponse>("/api/rooms"))
      .then((result) => {
        if (!cancelled) setRooms(result.rooms);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : "Odalar alınamadı.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function readSavedSubscriptions(): TargetProviderKey[] {
    try {
      const raw = window.localStorage.getItem(SAVED_SUBSCRIPTIONS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) && parsed.every(isSubscriptionKey)
        ? [...new Set(parsed)]
        : [];
    } catch {
      return [];
    }
  }

  function handleJoinIntent(room: PublicRoomSummary) {
    if (
      joiningId ||
      (requiresRegisteredRoomAccount(room.visibility) && !canJoinPublic)
    ) {
      return;
    }
    const saved = readSavedSubscriptions();
    setSubscriptions(saved);
    setPassword("");
    setError(null);

    if (room.visibility === "public" && saved.length > 0) {
      void join(room, saved, null);
      return;
    }
    setChoosingForId(room.spaceId);
  }

  async function join(
    room: PublicRoomSummary,
    selectedSubscriptions: TargetProviderKey[],
    roomPassword: string | null,
  ) {
    if (
      selectedSubscriptions.length === 0 ||
      joiningId ||
      (requiresRegisteredRoomAccount(room.visibility) && !canJoinPublic) ||
      (room.visibility === "private" && (!roomPassword || roomPassword.length < 6))
    ) {
      return;
    }

    setJoiningId(room.spaceId);
    setError(null);
    try {
      window.localStorage.setItem(
        SAVED_SUBSCRIPTIONS_KEY,
        JSON.stringify(selectedSubscriptions),
      );
      const result = await fetchJson<JoinRoomResult>(
        `/api/rooms/${encodeURIComponent(room.spaceId)}/join`,
        undefined,
        {
          method: "POST",
          body: {
            subscriptions: selectedSubscriptions,
            ...(room.visibility === "private" ? { password: roomPassword } : {}),
          },
        },
      );
      window.location.replace(`/rooms/${encodeURIComponent(result.spaceId)}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Odaya katılınamadı.");
      setJoiningId(null);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Odalar</h2>
          <p className="mt-1 text-sm text-black/65 dark:text-white/65">
            Public odaya doğrudan, private odaya oda şifresiyle katılın.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRooms()}
          disabled={loading}
          className="min-h-10 rounded-lg border border-black/20 px-3 text-sm dark:border-white/25"
        >
          {loading ? "Yenileniyor…" : "Yenile"}
        </button>
      </div>

      {error ? (
        <StatusMessage tone="error" title="İşlem tamamlanamadı">
          {error}
        </StatusMessage>
      ) : null}

      {!loading && rooms.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/20 p-4 text-sm text-black/60 dark:border-white/25 dark:text-white/60">
          Şu anda katılıma açık oda yok. İlk odayı siz oluşturabilirsiniz.
        </p>
      ) : null}

      <div className="grid gap-3">
        {rooms.map((room) => {
          const needsPublicAccount =
            requiresRegisteredRoomAccount(room.visibility) && !canJoinPublic;
          const isChoosing = choosingForId === room.spaceId;
          return (
            <article
              key={room.spaceId}
              className="rounded-xl border border-black/10 p-4 dark:border-white/15"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold">{room.name}</h3>
                    <span className="rounded-full border border-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase dark:border-white/25">
                      {room.visibility}
                    </span>
                    <span className="rounded-full border border-black/20 px-2 py-0.5 text-[10px] font-semibold dark:border-white/25">
                      {room.selectionMode === "wheel" ? "Çark" : "Belirlenmiş film"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                    {room.hostDisplayName} · {room.participantCount}/{room.capacity} kişi
                  </p>
                  {room.visibility === "private" ? (
                    <p className="mt-1 text-xs text-black/55 dark:text-white/55">
                      Üyelik gerekmez · oda şifresiyle katılır
                    </p>
                  ) : null}
                </div>
                {needsPublicAccount ? (
                  <Link
                    href="/hesabini-kaydet?next=/rooms"
                    className="inline-flex min-h-11 items-center rounded-lg border border-black/20 px-4 text-sm font-semibold dark:border-white/25"
                  >
                    Üye ol ve katıl
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleJoinIntent(room)}
                    disabled={joiningId !== null || room.participantCount >= room.capacity}
                    className="min-h-11 rounded-lg bg-black px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
                  >
                    {joiningId === room.spaceId
                      ? "Katılıyor…"
                      : room.visibility === "private"
                        ? "Şifreyle katıl"
                        : "Katıl"}
                  </button>
                )}
              </div>

              {isChoosing ? (
                <div className="mt-4 grid gap-4 border-t border-black/10 pt-4 dark:border-white/15">
                  {room.visibility === "private" ? (
                    <label className="text-sm font-medium">
                      Oda şifresi
                      <input
                        type="password"
                        minLength={6}
                        maxLength={64}
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={joiningId !== null}
                        className="mt-1 min-h-11 w-full rounded-lg border border-black/20 bg-transparent px-3 py-2 text-base dark:border-white/25"
                      />
                    </label>
                  ) : null}

                  {subscriptions.length === 0 ? (
                    <SubscriptionPicker
                      idPrefix={`listed-room-${room.spaceId}`}
                      legend="Hangi aboneliklere sahipsiniz?"
                      description="Bu seçim sonraki oda katılımlarınız için hatırlanır."
                      value={subscriptions}
                      onChange={setSubscriptions}
                      disabled={joiningId !== null}
                    />
                  ) : (
                    <p className="text-xs text-black/60 dark:text-white/60">
                      Kayıtlı abonelik seçiminiz kullanılacak.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void join(
                          room,
                          subscriptions,
                          room.visibility === "private" ? password : null,
                        )
                      }
                      disabled={
                        subscriptions.length === 0 ||
                        joiningId !== null ||
                        (room.visibility === "private" && password.length < 6)
                      }
                      className="min-h-11 rounded-lg bg-black px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
                    >
                      {joiningId === room.spaceId ? "Katılıyor…" : "Odaya katıl"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChoosingForId(null);
                        setPassword("");
                      }}
                      disabled={joiningId !== null}
                      className="min-h-11 px-3 text-sm underline underline-offset-4"
                    >
                      Vazgeç
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
