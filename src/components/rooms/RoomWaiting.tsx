"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StatusMessage } from "@/components/StatusMessage";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import type { RoomState } from "@/lib/rooms/types";
import { ensureAnonymousSession } from "@/lib/supabase/browser";
import { RoomRound } from "./RoomRound";

const POLL_INTERVAL_MS = 5000;

type State =
  | { status: "loading" }
  | { status: "ready"; room: RoomState }
  | { status: "error"; message: string };

/**
 * Bekleme odası.
 *
 * Oda durumunu düzenli aralıklarla yeniler; partner katıldığında güncellenir.
 * Yetkilendirme tamamen sunucu tarafında ve RLS ile yapılır — buradaki
 * `spaceId` yalnızca hangi odanın sorulacağını belirtir, yetki vermez.
 */
export function RoomWaiting({ spaceId }: { spaceId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function poll() {
      try {
        await ensureAnonymousSession();

        const room = await fetchJson<RoomState>(
          `/api/rooms/${spaceId}`,
          controller.signal,
        );

        if (cancelled) return;
        setState({ status: "ready", room });

        // Partner katıldıysa yoklamayı sürdürmenin faydası yok.
        if (!room.partnerJoined && room.status === "active") {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;

        setState({
          status: "error",
          message:
            error instanceof ApiError
              ? error.message
              : "Oda bilgisi alınamadı.",
        });
      }
    }

    void poll();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [spaceId]);

  if (state.status === "loading") {
    return (
      <p role="status" className="text-sm text-black/60 dark:text-white/60">
        Oda yükleniyor…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <StatusMessage tone="error" title="Odaya erişilemedi">
        {state.message}
      </StatusMessage>
    );
  }

  const { room } = state;

  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-3 rounded-xl border border-black/10 p-3 dark:border-white/15"
    >
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-black/60 dark:text-white/60">Oda durumu</dt>
          <dd className="font-medium">
            {room.status === "active" ? "Açık" : "Kapalı"}
          </dd>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-black/60 dark:text-white/60">Katılımcı</dt>
          <dd className="font-medium">{room.participantCount} / 2</dd>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-black/60 dark:text-white/60">Sizin rolünüz</dt>
          <dd className="font-medium">
            {room.myRole === "host" ? "Oda sahibi" : "Misafir"}
          </dd>
        </div>
      </dl>

      <div className="border-t border-black/10 pt-3 dark:border-white/15">
        {room.partnerJoined ? (
          <p className="text-sm font-semibold">
            Partneriniz odaya katıldı.
          </p>
        ) : (
          <p className="text-sm text-black/70 dark:text-white/70">
            Partneriniz henüz katılmadı. Davet bağlantısını paylaştıysanız bu
            sayfa katıldığında kendiliğinden güncellenecek.
          </p>
        )}
      </div>

      {room.partnerJoined && room.status === "active" ? (
        <RoomRound spaceId={spaceId} isHost={room.myRole === "host"} />
      ) : null}

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/" className="underline underline-offset-4">
          Film aramaya dön
        </Link>
        <Link href="/kutuphanem" className="underline underline-offset-4">
          Kütüphanem
        </Link>
      </div>
    </section>
  );
}
