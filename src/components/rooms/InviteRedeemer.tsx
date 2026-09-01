"use client";

import { useRef, useState } from "react";

import { StatusMessage } from "@/components/StatusMessage";
import { SubscriptionPicker } from "@/components/rooms/SubscriptionPicker";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import type { JoinRoomResult } from "@/lib/rooms/types";
import { ensureAnonymousSession } from "@/lib/supabase/browser";
import type { TargetProviderKey } from "@/lib/tmdb/types";

type State =
  | { status: "choosing" }
  | { status: "redeeming" }
  | { status: "error"; code: string; message: string };

/**
 * Davet tüketme akışı.
 *
 * Davet, ARTIK KENDİLİĞİNDEN tüketilmez: misafir önce kendi aboneliklerini
 * bildirir. Sebep, davetin tek kullanımlık olmasıdır — beyanı sonradan sormak,
 * beyansız (dolayısıyla ortak kümesi boş) bir üyelik yaratma riski taşırdı.
 *
 * Token yalnızca POST gövdesinde taşınır — URL'de, log'da veya hata mesajında
 * asla görünmez. Başarılı olduğunda token içermeyen temiz oda adresine
 * `replace` ile gidilir; böylece token tarayıcı geçmişinde geriye kalmaz.
 */
export function InviteRedeemer({ token }: { token: string }) {
  const [state, setState] = useState<State>({ status: "choosing" });
  const [subscriptions, setSubscriptions] = useState<TargetProviderKey[]>([]);

  // Aynı yanıt iki kez gelse bile yalnızca bir kez yönlendir.
  const redirectedRef = useRef(false);

  async function handleJoin() {
    if (subscriptions.length === 0 || state.status === "redeeming") return;

    setState({ status: "redeeming" });

    try {
      await ensureAnonymousSession();

      const result = await fetchJson<JoinRoomResult>(
        "/api/rooms/join",
        undefined,
        { method: "POST", body: { token, subscriptions } },
      );

      if (redirectedRef.current) return;
      redirectedRef.current = true;

      // Temiz URL: token adres çubuğunda kalmaz. Tam sayfa yönlendirmesi
      // burada bilinçlidir: yeni yazılmış Supabase oturum çerezinin sonraki
      // oda isteğinde kesin olarak gönderilmesini sağlar.
      window.location.replace(`/rooms/${encodeURIComponent(result.spaceId)}`);
    } catch (error) {
      setState({
        status: "error",
        code: error instanceof ApiError ? error.code : "unexpected",
        message:
          error instanceof ApiError
            ? error.message
            : "Davet kullanılamadı. Lütfen tekrar deneyin.",
      });
    }
  }

  // Davetin kendisi geçersizse (süresi dolmuş, kullanılmış, oda dolu) seçim
  // formunu göstermeye devam etmek yanıltıcı olur.
  if (state.status === "error" && !isRetryable(state.code)) {
    return (
      <StatusMessage tone="error" title={titleFor(state.code)}>
        {state.message}
      </StatusMessage>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SubscriptionPicker
        idPrefix="join-room"
        legend="Hangi aboneliklere sahipsiniz?"
        description="Film önerileri, sizin ve odayı kuran kişinin ORTAK platformlarından gelir. En az bir platform seçin."
        value={subscriptions}
        onChange={setSubscriptions}
        disabled={state.status === "redeeming"}
      />

      <button
        type="button"
        onClick={handleJoin}
        disabled={state.status === "redeeming" || subscriptions.length === 0}
        className="min-h-11 rounded-lg border border-black/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[0.04] disabled:opacity-60 dark:border-white/25 dark:hover:bg-white/10"
      >
        {state.status === "redeeming" ? "Odaya katılıyor…" : "Odaya katıl"}
      </button>

      {subscriptions.length === 0 ? (
        <p className="text-xs text-black/60 dark:text-white/60">
          Devam etmek için en az bir abonelik seçin.
        </p>
      ) : null}

      {state.status === "error" ? (
        <StatusMessage tone="error" title={titleFor(state.code)}>
          {state.message}
        </StatusMessage>
      ) : null}
    </div>
  );
}

/** Yeniden denemenin anlamlı olduğu, geçici veya düzeltilebilir durumlar. */
function isRetryable(code: string): boolean {
  return (
    code === "network" ||
    code === "unexpected" ||
    code === "invalid_subscriptions" ||
    code === "subscriptions_required" ||
    code === "unauthenticated"
  );
}

function titleFor(code: string): string {
  if (code === "invitation_expired") return "Davetin süresi dolmuş";
  if (code === "invitation_already_used") return "Davet zaten kullanılmış";
  if (code === "room_full") return "Oda dolu";
  if (code === "host_cannot_join") return "Bu oda size ait";
  if (code === "room_closed") return "Oda kapatılmış";
  if (code === "not_configured") return "Oda servisi yapılandırılmamış";
  if (code === "invalid_subscriptions" || code === "subscriptions_required") {
    return "Abonelik seçimi gerekli";
  }
  return "Davet kullanılamadı";
}
