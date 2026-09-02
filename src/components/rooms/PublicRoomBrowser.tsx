"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { StatusMessage } from "@/components/StatusMessage";
import { SubscriptionPicker } from "@/components/rooms/SubscriptionPicker";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { ensureAnonymousSession } from "@/lib/supabase/browser";
import type { JoinRoomResult, PublicRoomSummary } from "@/lib/rooms/types";
import type { TargetProviderKey } from "@/lib/tmdb/types";

type ListResponse = { rooms: PublicRoomSummary[] };

export function PublicRoomBrowser({ canJoinPublic }: { canJoinPublic: boolean }) {
  const [rooms, setRooms] = useState<PublicRoomSummary[]>([]);
  const [subscriptions, setSubscriptions] = useState<TargetProviderKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureAnonymousSession();
      const result = await fetchJson<ListResponse>("/api/rooms");
      setRooms(result.rooms);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Public odalar alınamadı.");
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
          setError(
            caught instanceof ApiError ? caught.message : "Public odalar alınamadı.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function join(room: PublicRoomSummary) {
    if (!canJoinPublic || subscriptions.length === 0 || joiningId) return;
    setJoiningId(room.spaceId);
    setError(null);
    try {
      const result = await fetchJson<JoinRoomResult>(
        `/api/rooms/${encodeURIComponent(room.spaceId)}/join`,
        undefined,
        { method: "POST", body: { subscriptions } },
      );
      window.location.replace(`/rooms/${encodeURIComponent(result.spaceId)}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Odaya katılınamadı.");
      setJoiningId(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 border-t border-black/10 pt-6 dark:border-white/15">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Public odalar</h2>
          <p className="mt-1 text-sm text-black/65 dark:text-white/65">
            Davet bağlantısı olmadan açık bir film karar odasına katılın.
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

      {canJoinPublic ? (
        <SubscriptionPicker
          idPrefix="public-room-join"
          legend="Public odalarda kullanacağınız abonelikler"
          description="Bir kez seçin; aşağıdaki odalardan birine doğrudan Katıl diyebilirsiniz."
          value={subscriptions}
          onChange={setSubscriptions}
          disabled={joiningId !== null}
        />
      ) : (
        <StatusMessage tone="warning" title="Katılmak için üyelik gerekli">
          Odaları görebilirsiniz; katılmak için anonim hesabınızı kaydedin.{" "}
          <Link href="/hesabini-kaydet?next=/rooms" className="font-semibold underline">
            Hesabımı kaydet
          </Link>
        </StatusMessage>
      )}

      {error ? (
        <StatusMessage tone="error" title="İşlem tamamlanamadı">
          {error}
        </StatusMessage>
      ) : null}

      {!loading && rooms.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/20 p-4 text-sm text-black/60 dark:border-white/25 dark:text-white/60">
          Şu anda katılıma açık public oda yok. İlk odayı siz oluşturabilirsiniz.
        </p>
      ) : null}

      <div className="grid gap-3">
        {rooms.map((room) => (
          <article
            key={room.spaceId}
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-black/10 p-4 dark:border-white/15"
          >
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{room.name}</h3>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                {room.hostDisplayName} · {room.participantCount}/{room.capacity} kişi
              </p>
            </div>
            <button
              type="button"
              onClick={() => void join(room)}
              disabled={
                !canJoinPublic ||
                subscriptions.length === 0 ||
                joiningId !== null ||
                room.participantCount >= room.capacity
              }
              className="min-h-11 rounded-lg bg-black px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {joiningId === room.spaceId ? "Katılıyor…" : "Katıl"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
