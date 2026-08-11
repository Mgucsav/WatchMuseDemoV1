"use client";

import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "redeeming" });

  // React StrictMode geliştirmede effect'i iki kez çalıştırır; davet tek
  // kullanımlık olduğu için ikinci çağrı "zaten kullanılmış" hatası üretirdi.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    async function redeem() {
      try {
        await ensureAnonymousSession();

        const result = await fetchJson<JoinRoomResult>(
          "/api/rooms/join",
          undefined,
          { method: "POST", body: { token } },
        );

        if (cancelled) return;

        // Temiz URL: token adres çubuğunda kalmaz.
        router.replace(`/rooms/${result.spaceId}`);
      } catch (error) {
        if (cancelled) return;

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
      cancelled = true;
    };
  }, [router, token]);

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
