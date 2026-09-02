"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { StatusMessage } from "@/components/StatusMessage";
import { SubscriptionPicker } from "@/components/rooms/SubscriptionPicker";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { subscriptionLabel } from "@/lib/rooms/subscriptions";
import type { RoomState } from "@/lib/rooms/types";
import { ensureAnonymousSession } from "@/lib/supabase/browser";
import type { TargetProviderKey } from "@/lib/tmdb/types";
import { RoomRound } from "./RoomRound";
import { RoomChat } from "./RoomChat";

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
  const [departing, setDeparting] = useState(false);
  const [departureError, setDepartureError] = useState<string | null>(null);
  const departureStarted = useRef(false);

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

        // Katılımcı katılması, abonelik güncellemesi veya admin kick işlemi
        // bütün açık odalarda kendiliğinden görünmelidir.
        if (room.status === "active") {
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

  const isActiveGuest =
    state.status === "ready" &&
    state.room.status === "active" &&
    state.room.myRole === "guest";

  useEffect(() => {
    if (!isActiveGuest) return;

    function leaveWhenPageCloses() {
      if (departureStarted.current) return;
      departureStarted.current = true;
      navigator.sendBeacon(
        `/api/rooms/${encodeURIComponent(spaceId)}/leave`,
        new Blob([], { type: "application/json" }),
      );
    }

    window.addEventListener("pagehide", leaveWhenPageCloses);
    return () => window.removeEventListener("pagehide", leaveWhenPageCloses);
  }, [isActiveGuest, spaceId]);

  async function depart(action: "leave" | "close") {
    if (departing || departureStarted.current) return;
    if (action === "close" && !window.confirm("Odayı kapatmak istediğinize emin misiniz?")) {
      return;
    }
    departureStarted.current = true;
    setDeparting(true);
    setDepartureError(null);
    try {
      await fetchJson<{ ok: true }>(
        `/api/rooms/${encodeURIComponent(spaceId)}/${action}`,
        undefined,
        { method: "POST" },
      );
      window.location.replace("/rooms");
    } catch (caught) {
      departureStarted.current = false;
      setDeparting(false);
      setDepartureError(
        caught instanceof ApiError
          ? caught.message
          : action === "close"
            ? "Oda kapatılamadı."
            : "Odadan çıkılamadı.",
      );
    }
  }

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
  const inRoom = room.enoughParticipants && room.status === "active";

  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-3 rounded-xl border border-black/10 p-3 dark:border-white/15"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">{room.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-black/20 px-3 py-1 text-xs font-semibold uppercase dark:border-white/25">
            {room.visibility}
          </span>
          {room.status === "active" ? (
            <button
              type="button"
              onClick={() => void depart(room.myRole === "host" ? "close" : "leave")}
              disabled={departing}
              className="min-h-9 rounded-lg border border-red-700/50 px-3 text-xs font-semibold text-red-700 disabled:opacity-50 dark:text-red-300"
            >
              {departing
                ? "İşleniyor…"
                : room.myRole === "host"
                  ? "Odayı kapat"
                  : "Odadan çık"}
            </button>
          ) : null}
        </div>
      </div>

      {departureError ? (
        <StatusMessage tone="error" title="İşlem tamamlanamadı">
          {departureError}
        </StatusMessage>
      ) : null}

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-black/60 dark:text-white/60">Oda durumu</dt>
          <dd className="font-medium">
            {room.status === "active" ? "Açık" : "Kapalı"}
          </dd>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-black/60 dark:text-white/60">Katılımcı</dt>
          <dd className="font-medium">
            {room.participantCount} / {room.capacity}
          </dd>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-black/60 dark:text-white/60">Sizin rolünüz</dt>
          <dd className="font-medium">
            {room.myRole === "host" ? "Oda sahibi" : "Misafir"}
          </dd>
        </div>
      </dl>

      <div className="border-t border-black/10 pt-3 dark:border-white/15">
        {room.enoughParticipants ? (
          <p className="text-sm font-semibold">
            Oda film seçimine hazır. Yeni katılımcılar tur başlamadan katılabilir.
          </p>
        ) : (
          <p className="text-sm text-black/70 dark:text-white/70">
            Film seçimine başlamak için en az bir katılımcı daha gerekiyor.
            Bu sayfa biri katıldığında kendiliğinden güncellenecek.
          </p>
        )}
      </div>

      <ParticipantsPanel
        spaceId={spaceId}
        room={room}
        onUpdated={(updated) => setState({ status: "ready", room: updated })}
      />

      <RoomChat spaceId={spaceId} />

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
        <Link href="/ara" className="underline underline-offset-4">
          Film aramaya dön
        </Link>
        <Link href="/kutuphanem" className="underline underline-offset-4">
          Kütüphanem
        </Link>
      </div>
    </section>
  );
}

function ParticipantsPanel({
  spaceId,
  room,
  onUpdated,
}: {
  spaceId: string;
  room: RoomState;
  onUpdated: (room: RoomState) => void;
}) {
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function kick(participantId: string) {
    if (kickingId) return;
    setKickingId(participantId);
    setError(null);
    try {
      await fetchJson<{ ok: true }>(
        `/api/rooms/${spaceId}/participants/${participantId}`,
        undefined,
        { method: "DELETE" },
      );
      const updated = await fetchJson<RoomState>(`/api/rooms/${spaceId}`);
      onUpdated(updated);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Katılımcı çıkarılamadı.");
    } finally {
      setKickingId(null);
    }
  }

  return (
    <div className="border-t border-black/10 pt-3 dark:border-white/15">
      <h2 className="text-sm font-semibold">Katılımcılar</h2>
      <ul className="mt-2 grid gap-2">
        {room.participants.map((participant) => (
          <li
            key={participant.userId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/15"
          >
            <span>
              <span className="font-medium">{participant.displayName}</span>{" "}
              <span className="text-black/50 dark:text-white/50">
                {participant.isMe
                  ? "(siz)"
                  : participant.role === "host"
                    ? "(admin)"
                    : ""}
              </span>
            </span>
            {room.myRole === "host" && participant.role !== "host" ? (
              <button
                type="button"
                onClick={() => void kick(participant.userId)}
                disabled={kickingId !== null}
                className="rounded-md border border-red-700/50 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50 dark:text-red-300"
              >
                {kickingId === participant.userId ? "Çıkarılıyor…" : "Odadan çıkar"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
    </div>
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

        {room.participants
          .filter((participant) => !participant.isMe)
          .map((participant) => (
            <div
              key={participant.userId}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <dt className="text-black/60 dark:text-white/60">
                {participant.displayName}
              </dt>
              <dd className="font-medium">
                {formatList(participant.subscriptions)}
              </dd>
            </div>
          ))}

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

      {room.enoughParticipants && room.sharedSubscriptions.length === 0 ? (
        <StatusMessage tone="warning" title="Ortak abonelik yok">
          Film önerileri yalnızca bütün katılımcılarda olan platformlardan gelir.
          Şu anda ortak bir platform yok; listelerin güncellenmesi gerekiyor.
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
