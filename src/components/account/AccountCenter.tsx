"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import type { DirectMessage, DmPrivacy, DmThread, SocialPerson, SocialProfile } from "@/lib/account/types";

type Tab = "profile" | "people" | "messages";
type ChatPeer = Pick<SocialPerson, "userId" | "username" | "displayName" | "avatarUrl">;

export function AccountCenter() {
  const [tab, setTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [connections, setConnections] = useState<SocialPerson[]>([]);
  const [threads, setThreads] = useState<DmThread[]>([]);
  const [people, setPeople] = useState<SocialPerson[]>([]);
  const [query, setQuery] = useState("");
  const [activeChat, setActiveChat] = useState<ChatPeer | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCore = useCallback(async () => {
    try {
      const [account, connectionData, threadData] = await Promise.all([
        fetchJson<{ profile: SocialProfile }>("/api/account"),
        fetchJson<{ connections: SocialPerson[] }>("/api/account/connections"),
        fetchJson<{ threads: DmThread[] }>("/api/account/messages"),
      ]);
      setProfile(account.profile);
      setConnections(connectionData.connections);
      setThreads(threadData.threads);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCore(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCore]);

  const loadMessages = useCallback(async (peer: ChatPeer, quiet = false) => {
    try {
      const result = await fetchJson<{ messages: DirectMessage[] }>(
        `/api/account/messages?userId=${encodeURIComponent(peer.userId)}`,
      );
      setMessages(result.messages);
      if (!quiet) setError(null);
    } catch (caught) {
      if (!quiet) setError(messageFor(caught));
    }
  }, []);

  useEffect(() => {
    if (!activeChat) return;
    const initial = window.setTimeout(() => void loadMessages(activeChat), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadMessages(activeChat, true);
    }, 3000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [activeChat, loadMessages]);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true); setError(null);
    try {
      const result = await fetchJson<{ people: SocialPerson[] }>(
        `/api/account/people?q=${encodeURIComponent(query.trim())}`,
      );
      setPeople(result.people);
    } catch (caught) { setError(messageFor(caught)); }
    finally { setBusy(false); }
  }

  async function connectionAction(method: "POST" | "PATCH" | "DELETE", userId: string, accept?: boolean) {
    setBusy(true); setError(null);
    try {
      await fetchJson<{ ok: true }>("/api/account/connections", undefined, {
        method, body: { userId, ...(accept === undefined ? {} : { accept }) },
      });
      await loadCore();
      if (query.trim().length >= 2) {
        const result = await fetchJson<{ people: SocialPerson[] }>(`/api/account/people?q=${encodeURIComponent(query.trim())}`);
        setPeople(result.people);
      }
    } catch (caught) { setError(messageFor(caught)); }
    finally { setBusy(false); }
  }

  async function sendCurrentMessage() {
    const body = messageBody.trim();
    if (!activeChat || !body || busy) return;
    setBusy(true); setError(null);
    try {
      await fetchJson("/api/account/messages", undefined, { method: "POST", body: { userId: activeChat.userId, body } });
      setMessageBody("");
      await Promise.all([loadMessages(activeChat), loadCore()]);
    } catch (caught) { setError(messageFor(caught)); }
    finally { setBusy(false); }
  }

  function openChat(peer: ChatPeer) {
    setActiveChat(peer); setMessages([]); setTab("messages"); setError(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2 overflow-x-auto border-b border-black/10 pb-3 dark:border-white/15">
        <TabButton selected={tab === "profile"} onClick={() => setTab("profile")}>Profilim</TabButton>
        <TabButton selected={tab === "people"} onClick={() => setTab("people")}>Arkadaşlar</TabButton>
        <TabButton selected={tab === "messages"} onClick={() => setTab("messages")}>Mesajlar{threads.some((item) => item.unreadCount > 0) ? " •" : ""}</TabButton>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</p> : null}
      {!profile ? <p className="text-sm text-black/60 dark:text-white/60">Hesabınız yükleniyor…</p> : null}
      {profile && tab === "profile" ? <ProfileEditor profile={profile} onChange={setProfile} /> : null}
      {profile && tab === "people" ? (
        <PeoplePanel
          query={query} setQuery={setQuery} search={search} people={people}
          connections={connections} busy={busy} act={connectionAction} openChat={openChat}
        />
      ) : null}
      {profile && tab === "messages" ? (
        <MessagesPanel
          threads={threads} activeChat={activeChat} openChat={openChat} messages={messages}
          body={messageBody} setBody={setMessageBody} send={sendCurrentMessage} busy={busy}
        />
      ) : null}
    </div>
  );
}

function ProfileEditor({ profile, onChange }: { profile: SocialProfile; onChange: (value: SocialProfile) => void }) {
  const [username, setUsername] = useState(profile.username ?? "");
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [privacy, setPrivacy] = useState<DmPrivacy>(profile.dmPrivacy);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      const result = await fetchJson<{ profile: SocialProfile }>("/api/account", undefined, {
        method: "PATCH", body: { username, displayName, bio, dmPrivacy: privacy },
      });
      onChange(result.profile); setUsername(result.profile.username ?? ""); setNotice("Profil kaydedildi.");
    } catch (caught) { setNotice(messageFor(caught)); }
    finally { setBusy(false); }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true); setNotice(null);
    try {
      const form = new FormData(); form.set("avatar", file);
      const response = await fetch("/api/account/avatar", { method: "POST", body: form });
      const payload = await response.json() as { avatarUrl?: string; error?: { message?: string } };
      if (!response.ok || !payload.avatarUrl) throw new Error(payload.error?.message || "Fotoğraf yüklenemedi.");
      onChange({ ...profile, avatarUrl: payload.avatarUrl }); setNotice("Profil fotoğrafı güncellendi.");
    } catch (caught) { setNotice(messageFor(caught)); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function removeAvatar() {
    setBusy(true); setNotice(null);
    try {
      await fetchJson("/api/account/avatar", undefined, { method: "DELETE" });
      onChange({ ...profile, avatarUrl: null }); setNotice("Profil fotoğrafı kaldırıldı.");
    } catch (caught) { setNotice(messageFor(caught)); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="grid gap-5">
      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-black/10 p-4 dark:border-white/15">
        <Avatar name={displayName || username || "W"} url={profile.avatarUrl} size="large" />
        <div className="flex flex-wrap gap-2">
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black">Fotoğraf yükle</button>
          {profile.avatarUrl ? <button type="button" disabled={busy} onClick={() => void removeAvatar()} className="rounded-lg border border-black/20 px-4 py-2 text-sm dark:border-white/25">Kaldır</button> : null}
        </div>
        <p className="w-full text-xs text-black/55 dark:text-white/55">JPG, PNG veya WebP · en fazla 5 MB</p>
      </section>
      <label className="text-sm font-medium">Kullanıcı adı
        <input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} minLength={3} maxLength={24} required className="mt-1 min-h-11 w-full rounded-lg border border-black/20 bg-transparent px-3 dark:border-white/25" placeholder="watchmuse_user" />
      </label>
      <label className="text-sm font-medium">Görünen ad
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} required className="mt-1 min-h-11 w-full rounded-lg border border-black/20 bg-transparent px-3 dark:border-white/25" />
      </label>
      <label className="text-sm font-medium">Hakkımda <span className="float-right text-xs font-normal">{bio.length}/300</span>
        <textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={300} rows={4} className="mt-1 w-full resize-y rounded-lg border border-black/20 bg-transparent p-3 dark:border-white/25" placeholder="Filmler, türler, favori yönetmenler…" />
      </label>
      <label className="text-sm font-medium">Kimler DM atabilir?
        <select value={privacy} onChange={(event) => setPrivacy(event.target.value as DmPrivacy)} className="mt-1 min-h-11 w-full rounded-lg border border-black/20 bg-transparent px-3 dark:border-white/25">
          <option value="everyone" className="text-black">Herkes</option><option value="friends" className="text-black">Yalnızca arkadaşlarım</option><option value="nobody" className="text-black">Hiç kimse</option>
        </select>
      </label>
      <button disabled={busy} className="min-h-11 rounded-lg bg-black px-5 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black">{busy ? "Kaydediliyor…" : "Profili kaydet"}</button>
      {notice ? <p role="status" className="text-sm">{notice}</p> : null}
    </form>
  );
}

function PeoplePanel(props: {
  query: string; setQuery: (value: string) => void; search: (event: FormEvent) => void;
  people: SocialPerson[]; connections: SocialPerson[]; busy: boolean;
  act: (method: "POST" | "PATCH" | "DELETE", userId: string, accept?: boolean) => Promise<void>;
  openChat: (peer: ChatPeer) => void;
}) {
  return <div className="grid gap-6">
    <form onSubmit={props.search} className="flex gap-2"><input value={props.query} onChange={(e) => props.setQuery(e.target.value)} minLength={2} maxLength={60} className="min-h-11 min-w-0 flex-1 rounded-lg border border-black/20 bg-transparent px-3 dark:border-white/25" placeholder="Kullanıcı adı veya isim ara" /><button disabled={props.busy || props.query.trim().length < 2} className="rounded-lg bg-black px-5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black">Ara</button></form>
    {props.people.length > 0 ? <PersonList title="Arama sonuçları" people={props.people} busy={props.busy} act={props.act} openChat={props.openChat} /> : null}
    <PersonList title="Bağlantılarım" people={props.connections} busy={props.busy} act={props.act} openChat={props.openChat} />
  </div>;
}

function PersonList({ title, people, busy, act, openChat }: { title: string; people: SocialPerson[]; busy: boolean; act: PeoplePanelParameters["act"]; openChat: (peer: ChatPeer) => void }) {
  return <section><h2 className="mb-3 font-bold">{title}</h2><div className="grid gap-2">
    {people.length === 0 ? <p className="rounded-xl border border-dashed border-black/20 p-4 text-sm text-black/55 dark:border-white/25 dark:text-white/55">Henüz burada kimse yok.</p> : people.map((person) => <article key={person.userId} className="flex flex-wrap items-center gap-3 rounded-xl border border-black/10 p-3 dark:border-white/15">
      <Avatar name={person.displayName} url={person.avatarUrl} /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{person.displayName}</p><p className="truncate text-xs text-black/55 dark:text-white/55">@{person.username}{person.bio ? ` · ${person.bio}` : ""}</p></div>
      <div className="flex flex-wrap gap-2 text-sm">
        {person.relationship === "none" ? <button disabled={busy} onClick={() => void act("POST", person.userId)} className="rounded-lg border px-3 py-2">Arkadaş ekle</button> : null}
        {person.relationship === "incoming" ? <><button disabled={busy} onClick={() => void act("PATCH", person.userId, true)} className="rounded-lg bg-black px-3 py-2 text-white dark:bg-white dark:text-black">Kabul et</button><button disabled={busy} onClick={() => void act("PATCH", person.userId, false)} className="rounded-lg border px-3 py-2">Reddet</button></> : null}
        {person.relationship === "outgoing" ? <button disabled={busy} onClick={() => void act("DELETE", person.userId)} className="rounded-lg border px-3 py-2">İsteği iptal et</button> : null}
        {person.relationship === "friends" ? <button disabled={busy} onClick={() => void act("DELETE", person.userId)} className="rounded-lg border px-3 py-2">Arkadaşlıktan çıkar</button> : null}
        {person.canMessage ? <button onClick={() => openChat(person)} className="rounded-lg border px-3 py-2">Mesaj</button> : null}
      </div>
    </article>)}
  </div></section>;
}

type PeoplePanelParameters = Parameters<typeof PeoplePanel>[0];

function MessagesPanel({ threads, activeChat, openChat, messages, body, setBody, send, busy }: {
  threads: DmThread[]; activeChat: ChatPeer | null; openChat: (peer: ChatPeer) => void;
  messages: DirectMessage[]; body: string; setBody: (value: string) => void; send: () => Promise<void>; busy: boolean;
}) {
  function key(event: KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }
  return <div className="grid min-h-[32rem] gap-4 md:grid-cols-[15rem_1fr]">
    <aside className="rounded-xl border border-black/10 p-2 dark:border-white/15"><h2 className="px-2 py-2 font-bold">Sohbetler</h2>{threads.length === 0 ? <p className="p-2 text-sm text-black/55 dark:text-white/55">Henüz mesaj yok.</p> : threads.map((thread) => <button key={thread.userId} onClick={() => openChat(thread)} className={`flex w-full items-center gap-2 rounded-lg p-2 text-left ${activeChat?.userId === thread.userId ? "bg-black/5 dark:bg-white/10" : ""}`}><Avatar name={thread.displayName} url={thread.avatarUrl} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{thread.displayName}</span><span className="block truncate text-xs text-black/50 dark:text-white/50">{thread.lastBody}</span></span>{thread.unreadCount ? <span className="rounded-full bg-black px-2 py-0.5 text-xs text-white dark:bg-white dark:text-black">{thread.unreadCount}</span> : null}</button>)}</aside>
    <section className="flex min-h-[28rem] flex-col rounded-xl border border-black/10 dark:border-white/15">{activeChat ? <><header className="border-b border-black/10 p-3 dark:border-white/15"><p className="font-semibold">{activeChat.displayName}</p><p className="text-xs text-black/55 dark:text-white/55">@{activeChat.username}</p></header><div className="flex max-h-[28rem] flex-1 flex-col gap-2 overflow-y-auto p-3">{messages.map((message) => <div key={message.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${message.isMine ? "ml-auto bg-black text-white dark:bg-white dark:text-black" : "bg-black/5 dark:bg-white/10"}`}><p className="whitespace-pre-wrap break-words">{message.body}</p><time className="mt-1 block text-[10px] opacity-60">{new Date(message.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time></div>)}</div><div className="flex gap-2 border-t border-black/10 p-3 dark:border-white/15"><textarea value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={key} maxLength={2000} rows={2} className="min-w-0 flex-1 resize-none rounded-lg border border-black/20 bg-transparent p-2 dark:border-white/25" placeholder="Mesaj yaz…" /><button disabled={busy || !body.trim()} onClick={() => void send()} className="rounded-lg bg-black px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black">Gönder</button></div></> : <p className="m-auto p-6 text-center text-sm text-black/55 dark:text-white/55">Bir sohbet seçin veya Arkadaşlar bölümünden mesaj başlatın.</p>}</section>
  </div>;
}

function Avatar({ name, url, size = "small" }: { name: string; url: string | null; size?: "small" | "large" }) {
  const classes = size === "large" ? "h-24 w-24 text-2xl" : "h-10 w-10 text-sm";
  return <span className={`${classes} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/10 font-bold dark:bg-white/15`}>{url ? (
    // Public Supabase avatar URL'si kullanıcıya göre dinamik host taşır.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-full w-full object-cover" />
  ) : name.slice(0, 2).toUpperCase()}</span>;
}

function TabButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold ${selected ? "bg-black text-white dark:bg-white dark:text-black" : "border border-black/15 dark:border-white/20"}`}>{children}</button>;
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "Beklenmeyen bir hata oluştu.";
}
