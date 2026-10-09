"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Film seçim oturumunun tam ekran penceresi.
 *
 * Arka plan bulanıklaşır, odadaki herkes aynı oturumu ortada görür. Sağda
 * (telefonda altta) açılıp kapanabilen oda sohbeti durur. "Odaya dön"
 * pencereyi küçültür; oturum arka planda sürer ve tekrar açılabilir.
 */
export function RoomSessionOverlay({
  roomName,
  chat,
  onMinimize,
  children,
}: {
  roomName: string;
  chat: ReactNode;
  onMinimize: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const chatId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Geniş ekranda sohbet yanda açık başlar; telefonda film öne çıksın diye kapalı.
  const [chatOpen, setChatOpen] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches,
  );
  // Efekt yalnız açılışta çalışsın: her çizimde odağı geri çekmesin.
  const onMinimizeRef = useRef(onMinimize);
  useEffect(() => {
    onMinimizeRef.current = onMinimize;
  }, [onMinimize]);

  // Açılınca odak pencereye taşınır, sayfa kaydırması kilitlenir; Esc küçültür.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onMinimizeRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center bg-scrim backdrop-blur-sm sm:items-center sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex h-dvh w-full max-w-6xl flex-col overflow-hidden bg-wm-background shadow-2xl outline-none sm:h-[90dvh] sm:rounded-2xl sm:border sm:border-line-10"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-10 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-brand-red uppercase">
              Film seçimi
            </p>
            <h2 id={titleId} className="truncate text-lg font-bold">
              {roomName}
            </h2>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChatOpen((open) => !open)}
              aria-expanded={chatOpen}
              aria-controls={chatId}
              className="min-h-10 rounded-lg border border-line-20 px-3 text-sm hover:bg-fill-hover"
            >
              {chatOpen ? "Sohbeti gizle" : "Sohbet"}
            </button>
            <button
              type="button"
              onClick={onMinimize}
              className="min-h-10 rounded-lg border border-line-20 px-3 text-sm hover:bg-fill-hover"
            >
              Odaya dön
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto flex max-w-2xl flex-col gap-4">{children}</div>
          </div>
          {chatOpen ? (
            <aside
              id={chatId}
              aria-label="Oda sohbeti"
              className="flex h-[42dvh] min-h-0 shrink-0 flex-col border-t border-line-10 p-3 lg:h-auto lg:w-96 lg:border-t-0 lg:border-l"
            >
              {chat}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
