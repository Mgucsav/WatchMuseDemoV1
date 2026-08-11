"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusMessage } from "@/components/StatusMessage";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { ensureAnonymousSession } from "@/lib/supabase/browser";
import type { CreateRoomResult } from "@/lib/rooms/types";

type State =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "created"; room: CreateRoomResult }
  | { status: "error"; message: string };

/** Oda oluşturma ve davet bağlantısını kopyalama arayüzü. */
export function RoomCreator() {
  const [state, setState] = useState<State>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setState({ status: "creating" });
    setCopied(false);

    try {
      // Oda oluşturmadan önce anonim kimlik gerekir; RLS bu kimliğe dayanır.
      await ensureAnonymousSession();

      const room = await fetchJson<CreateRoomResult>("/api/rooms", undefined, {
        method: "POST",
      });

      setState({ status: "created", room });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof ApiError
            ? error.message
            : "Oda oluşturulamadı. Lütfen tekrar deneyin.",
      });
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Pano izni yoksa kullanıcı bağlantıyı elle seçebilir.
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {state.status !== "created" ? (
        <button
          type="button"
          onClick={handleCreate}
          disabled={state.status === "creating"}
          className="min-h-11 rounded-lg border border-black/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[0.04] disabled:opacity-60 dark:border-white/25 dark:hover:bg-white/10"
        >
          {state.status === "creating" ? "Oda oluşturuluyor…" : "Yeni oda oluştur"}
        </button>
      ) : null}

      {state.status === "error" ? (
        <StatusMessage tone="error" title="Oda oluşturulamadı">
          {state.message}
        </StatusMessage>
      ) : null}

      {state.status === "created" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-black/10 p-3 dark:border-white/15">
          <p className="text-sm font-semibold">Oda hazır</p>

          <div>
            <label
              htmlFor="invite-url"
              className="block text-xs text-black/60 dark:text-white/60"
            >
              Davet bağlantısı — partnerinize gönderin
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              <input
                id="invite-url"
                type="text"
                readOnly
                value={state.room.inviteUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-black/20 bg-transparent px-3 py-2 font-mono text-xs dark:border-white/25"
              />
              <button
                type="button"
                onClick={() => handleCopy(state.room.inviteUrl)}
                className="min-h-11 shrink-0 rounded-lg border border-black/20 px-3 py-2 text-sm font-medium hover:bg-black/[0.04] dark:border-white/25 dark:hover:bg-white/10"
              >
                {copied ? "Kopyalandı" : "Kopyala"}
              </button>
            </div>
          </div>

          <p className="text-xs text-black/60 dark:text-white/60">
            Bu bağlantı tek kullanımlıktır ve 24 saat içinde geçerliliğini
            yitirir. Yalnızca birlikte film seçeceğiniz kişiyle paylaşın.
          </p>

          <Link
            href={`/rooms/${state.room.spaceId}`}
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            Odaya git
          </Link>
        </div>
      ) : null}
    </div>
  );
}
