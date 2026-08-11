"use client";

import { useEffect, useRef, useState } from "react";

import { StatusMessage } from "@/components/StatusMessage";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import type { JoinRoomResult } from "@/lib/rooms/types";
import { ensureAnonymousSession } from "@/lib/supabase/browser";

type State =
  | { status: "redeeming" }
  | { status: "error"; code: string; message: string };

/**
 * Davet tüketme akışı.
 *
 * Token yalnızca POST gövdesinde taşınır — URL'de, log'da veya hata mesajında
 * asla görünmez. Başarılı olduğunda token içermeyen temiz oda adresine
 * `replace` ile gidilir; böylece token tarayıcı geçmişinde geriye kalmaz.
 */
export function InviteRedeemer({ token }: { token: string }) {
  const [state, setState] = useState<State>({ status: "redeeming" });

  // Aynı yanıt iki effect geçişinden gelse bile yalnızca bir kez yönlendir.
  const redirectedRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function redeem() {
      try {
        await ensureAnonymousSession();

        const result = await fetchJson<JoinRoomResult>(
          "/api/rooms/join",
          undefined,
          { method: "POST", body: { token } },
        );

        if (!active || redirectedRef.current) return;
        redirectedRef.current = true;

        // Temiz URL: token adres çubuğunda kalmaz. Tam sayfa yönlendirmesi
        // burada bilinçlidir: yeni yazılmış Supabase oturum çerezinin sonraki
        // oda isteğinde kesin olarak gönderilmesini sağlar.
        window.location.replace(`/rooms/${encodeURIComponent(result.spaceId)}`);
      } catch (error) {
        if (!active) return;

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

    void redeem();

    return () => {
      active = false;
    };
  }, [token]);

  if (state.status === "redeeming") {
    return (
      <p role="status" className="text-sm text-black/60 dark:text-white/60">
        Davet kontrol ediliyor…
      </p>
    );
  }

  return (
    <StatusMessage tone="error" title={titleFor(state.code)}>
      {state.message}
    </StatusMessage>
  );
}

function titleFor(code: string): string {
  if (code === "invitation_expired") return "Davetin süresi dolmuş";
  if (code === "invitation_already_used") return "Davet zaten kullanılmış";
  if (code === "room_full") return "Oda dolu";
  if (code === "host_cannot_join") return "Bu oda size ait";
  if (code === "room_closed") return "Oda kapatılmış";
  if (code === "not_configured") return "Oda servisi yapılandırılmamış";
  return "Davet kullanılamadı";
}
