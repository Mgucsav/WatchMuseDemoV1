"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StatusMessage } from "@/components/StatusMessage";
import { SubscriptionPicker } from "@/components/rooms/SubscriptionPicker";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { subscriptionLabel } from "@/lib/rooms/subscriptions";
import type { RoomState } from "@/lib/rooms/types";
import { ensureAnonymousSession } from "@/lib/supabase/browser";
import type { TargetProviderKey } from "@/lib/tmdb/types";
import { RoomRound } from "./RoomRound";

const POLL_INTERVAL_MS = 5000;

type State =
  | { status: "loading" }
  | { status: "ready"; room: RoomState }
  | { status: "error"; message: string };

/**
 * Bekleme odası.
 *
 * Oda durumunu düzenli aralıklarla yeniler; partner katıldığında ve abonelik
 * beyanını değiştirdiğinde güncellenir. Yetkilendirme tamamen sunucu tarafında
 * ve RLS ile yapılır — buradaki `spaceId` yalnızca hangi odanın sorulacağını
 * belirtir, yetki vermez.
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

        // Yoklama, oda seçim yapılabilir duruma gelene kadar sürer: partner
        // katılmamışsa ya da ortak abonelik yoksa (partner beyanını
        // değiştirebilir) sayfanın kendiliğinden güncellenmesi gerekir.
        const settled = room.partnerJoined && room.sharedSubscriptions.length > 0;
        if (!settled && room.status === "active") {
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
  // Açık bir tur, ortak abonelik sonradan kaybolsa bile oynanmaya devam eder:
  // adayları zaten toplanmıştır. Kısıtlanan şey YENİ tur açmaktır.
  const inRoom = room.partnerJoined && room.status === "active";

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
          <p className="text-sm font-semibold">Partneriniz odaya katıldı.</p>
        ) : (
          <p className="text-sm text-black/70 dark:text-white/70">
            Partneriniz henüz katılmadı. Davet bağlantısını paylaştıysanız bu
            sayfa katıldığında kendiliğinden güncellenecek.
          </p>
        )}
      </div>

      <SubscriptionSummary
        spaceId={spaceId}
        room={room}
        onUpdated={(updated) => setState({ status: "ready", room: updated })}
      />

      {inRoom ? (
        <RoomRound
          spaceId={spaceId}
          isHost={room.myRole === "host"}
          canStartRound={room.sharedSubscriptions.length > 0}
          sharedSubscriptions={room.sharedSubscriptions}
        />
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

/**
 * Abonelik özeti ve kendi beyanını güncelleme.
 *
 * Partnerin listesi bilinçli olarak gösterilir: kesişim boşsa kullanıcının
 * neyi değiştireceğini bilmesi gerekir. Gizli oylardan farklı olarak abonelik,
 * ortak zemin arayan bir beyandır.
 */
function SubscriptionSummary({
  spaceId,
  room,
  onUpdated,
}: {
  spaceId: string;
  room: RoomState;
  onUpdated: (room: RoomState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TargetProviderKey[]>(room.mySubscriptions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (draft.length === 0 || saving) return;

    setSaving(true);
    setError(null);

    try {
      await ensureAnonymousSession();
      const updated = await fetchJson<RoomState>(
        `/api/rooms/${spaceId}/subscriptions`,
        undefined,
        { method: "PUT", body: { subscriptions: draft } },
      );
      onUpdated(updated);
      setEditing(false);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Abonelikler güncellenemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-black/10 pt-3 dark:border-white/15">
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-black/60 dark:text-white/60">Abonelikleriniz</dt>
          <dd className="font-medium">{formatList(room.mySubscriptions)}</dd>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-black/60 dark:text-white/60">
            Partnerin abonelikleri
          </dt>
          <dd className="font-medium">
            {room.partnerJoined
              ? formatList(room.partnerSubscriptions)
              : "Henüz katılmadı"}
          </dd>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-black/60 dark:text-white/60">
            Ortak abonelikler
          </dt>
          <dd className="font-semibold">
            {formatList(room.sharedSubscriptions)}
          </dd>
        </div>
      </dl>

      {room.mySubscriptions.length === 0 ? (
        <StatusMessage tone="warning" title="Abonelik seçilmemiş">
          Bu odada abonelik beyanınız yok. Öneri alabilmek için aşağıdan en az
          bir platform seçin.
        </StatusMessage>
      ) : null}

      {room.partnerJoined && room.sharedSubscriptions.length === 0 ? (
        <StatusMessage tone="warning" title="Ortak abonelik yok">
          Film önerileri yalnızca ikinizde de olan platformlardan gelir. Şu anda
          ortak bir platform yok; birinizin listesini güncellemesi gerekiyor.
        </StatusMessage>
      ) : null}

      {editing ? (
        <div className="flex flex-col gap-3">
          <SubscriptionPicker
            idPrefix="room-subscriptions"
            legend="Abonelikleriniz"
            description="Değişiklik, açık olan turu etkilemez; bir sonraki turdan itibaren geçerli olur."
            value={draft}
            onChange={setDraft}
            disabled={saving}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || draft.length === 0}
              className="min-h-11 rounded-lg border border-black/20 px-4 py-2 text-sm font-medium hover:bg-black/[0.04] disabled:opacity-60 dark:border-white/25 dark:hover:bg-white/10"
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(room.mySubscriptions);
                setError(null);
                setEditing(false);
              }}
              disabled={saving}
              className="min-h-11 rounded-lg px-4 py-2 text-sm underline underline-offset-4 disabled:opacity-60"
            >
              Vazgeç
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(room.mySubscriptions);
            setEditing(true);
          }}
          className="min-h-11 self-start rounded-lg border border-black/20 px-4 py-2 text-sm font-medium hover:bg-black/[0.04] dark:border-white/25 dark:hover:bg-white/10"
        >
          Aboneliklerimi güncelle
        </button>
      )}

      {error ? (
        <StatusMessage tone="error" title="Abonelikler güncellenemedi">
          {error}
        </StatusMessage>
      ) : null}
    </div>
  );
}

function formatList(keys: readonly TargetProviderKey[]): string {
  if (keys.length === 0) return "Yok";
  return keys.map(subscriptionLabel).join(", ");
}
