"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { StatusMessage } from "@/components/StatusMessage";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { ensureAnonymousSession } from "@/lib/supabase/browser";
import type { RoomChatResponse } from "@/lib/rooms/types";
import { MAX_ROOM_MESSAGE_LENGTH } from "@/lib/rooms/validation";

const CHAT_POLL_INTERVAL_MS = 2500;

export function RoomChat({ spaceId }: { spaceId: string }) {
  const [chat, setChat] = useState<RoomChatResponse>({ messages: [] });
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async (signal?: AbortSignal) => {
    await ensureAnonymousSession();
    return fetchJson<RoomChatResponse>(
      `/api/rooms/${encodeURIComponent(spaceId)}/messages`,
      signal,
    );
  }, [spaceId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function poll() {
      try {
        const result = await loadMessages(controller.signal);
        if (cancelled) return;
        setChat(result);
        setError(null);
        setLoading(false);
        timer = setTimeout(poll, CHAT_POLL_INTERVAL_MS);
      } catch (caught) {
        if (cancelled || controller.signal.aborted) return;
        setError(caught instanceof ApiError ? caught.message : "Sohbet yüklenemedi.");
        setLoading(false);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [loadMessages]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
  }, [chat.messages.length]);

  function handleComposerKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (message === "" || sending) return;

    setSending(true);
    setError(null);
    try {
      await fetchJson<{ ok: true }>(
        `/api/rooms/${encodeURIComponent(spaceId)}/messages`,
        undefined,
        { method: "POST", body: { message } },
      );
      setDraft("");
      setChat(await loadMessages());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Mesaj gönderilemedi.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="border-t border-black/10 pt-3 dark:border-white/15">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Oda sohbeti</h2>
          <p className="mt-0.5 text-xs text-black/55 dark:text-white/55">
            Mesajları yalnızca bu odanın katılımcıları görebilir.
          </p>
        </div>
        <span className="text-xs text-black/45 dark:text-white/45">
          {loading ? "Yükleniyor…" : `${chat.messages.length} mesaj`}
        </span>
      </div>

      <div
        ref={messageListRef}
        aria-live="polite"
        className="mt-3 h-[22rem] space-y-2 overflow-y-auto overscroll-contain rounded-lg border border-black/10 p-3 dark:border-white/15"
      >
        {!loading && chat.messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-black/50 dark:text-white/50">
            Henüz mesaj yok. Sohbeti başlatın.
          </p>
        ) : null}

        {chat.messages.map((message) => (
          <article
            key={message.id}
            className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${
              message.isMine
                ? "ml-auto bg-black text-white dark:bg-white dark:text-black"
                : "border border-black/10 dark:border-white/15"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
              <span className="font-semibold">{message.senderDisplayName}</span>
              <time className={message.isMine ? "opacity-70" : "text-black/50 dark:text-white/50"}>
                {formatMessageTime(message.createdAt)}
              </time>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words">{message.body}</p>
          </article>
        ))}
      </div>

      <form onSubmit={sendMessage} className="mt-3 flex items-end gap-2">
        <label className="min-w-0 flex-1 text-xs font-medium">
          Mesaj
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            maxLength={MAX_ROOM_MESSAGE_LENGTH}
            rows={2}
            placeholder="Odaya bir mesaj yaz…"
            className="mt-1 w-full resize-none rounded-lg border border-black/20 bg-transparent px-3 py-2 text-sm outline-none dark:border-white/25"
          />
        </label>
        <button
          type="submit"
          disabled={sending || draft.trim() === ""}
          className="min-h-11 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {sending ? "Gönderiliyor…" : "Gönder"}
        </button>
      </form>

      {error ? (
        <div className="mt-3">
          <StatusMessage tone="error" title="Sohbet kullanılamadı">
            {error}
          </StatusMessage>
        </div>
      ) : null}
    </section>
  );
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
