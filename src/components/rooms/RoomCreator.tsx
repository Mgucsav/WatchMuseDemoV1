"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusMessage } from "@/components/StatusMessage";
import { SubscriptionPicker } from "@/components/rooms/SubscriptionPicker";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { ensureAnonymousSession } from "@/lib/supabase/browser";
import type { CreateRoomResult } from "@/lib/rooms/types";
import type { RoomVisibility } from "@/lib/rooms/types";
import type { TargetProviderKey } from "@/lib/tmdb/types";

type State =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "created"; room: CreateRoomResult }
  | { status: "error"; message: string };

/**
 * Oda oluşturma, abonelik beyanı ve davet bağlantısını kopyalama arayüzü.
 *
 * Abonelikler oda AÇILIRKEN sorulur: öneriler bütün katılımcıların ortak
 * platformlarından geleceği için oda sahibinin beyanı ilk girdidir.
 */
export function RoomCreator({ canCreatePublic }: { canCreatePublic: boolean }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [subscriptions, setSubscriptions] = useState<TargetProviderKey[]>([]);
  const [name, setName] = useState("Film gecesi");
  const [visibility, setVisibility] = useState<RoomVisibility>("private");
  const [capacity, setCapacity] = useState(2);
  const [password, setPassword] = useState("");

  async function handleCreate() {
    // Boş beyanla oda açılamaz; buton da bu durumda devre dışıdır.
    if (
      subscriptions.length === 0 ||
      name.trim() === "" ||
      (visibility === "private" && password.length < 6) ||
      (visibility === "public" && !canCreatePublic)
    ) return;

    setState({ status: "creating" });

    try {
      // Oda oluşturmadan önce anonim kimlik gerekir; RLS bu kimliğe dayanır.
      await ensureAnonymousSession();

      const room = await fetchJson<CreateRoomResult>("/api/rooms", undefined, {
        method: "POST",
        body: {
          subscriptions,
          name,
          visibility,
          capacity,
          ...(visibility === "private" ? { password } : {}),
        },
      });

      window.localStorage.setItem(
        "watchmuse_room_subscriptions",
        JSON.stringify(subscriptions),
      );
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

  return (
    <div className="flex flex-col gap-4">
      {state.status !== "created" ? (
        <>
          <fieldset className="rounded-xl border border-black/10 p-3 dark:border-white/15">
            <legend className="px-1 text-sm font-semibold">Oda görünürlüğü</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(["private", "public"] as const).map((option) => (
                <label
                  key={option}
                  className={`cursor-pointer rounded-lg border p-3 text-sm ${
                    visibility === option
                      ? "border-black bg-black/[0.04] dark:border-white dark:bg-white/10"
                      : "border-black/15 dark:border-white/20"
                  }`}
                >
                  <input
                    type="radio"
                    name="room-visibility"
                    value={option}
                    checked={visibility === option}
                    onChange={() => setVisibility(option)}
                    className="mr-2"
                  />
                  <span className="font-semibold">
                    {option === "private" ? "Private" : "Public"}
                  </span>
                  <span className="mt-1 block text-xs text-black/60 dark:text-white/60">
                    {option === "private"
                      ? "Odalar listesinde görünür; şifreyi bilenler anonim olarak da katılabilir."
                      : "Keşfet bölümünde görünür; yalnız kayıtlı üyeler katılabilir."}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <label className="text-sm font-medium">
              Oda adı
              <input
                type="text"
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={state.status === "creating"}
                className="mt-1 min-h-11 w-full rounded-lg border border-black/20 bg-transparent px-3 py-2 text-base dark:border-white/25"
              />
            </label>
            <label className="text-sm font-medium">
              Kişi sınırı
              <select
                value={capacity}
                onChange={(event) => setCapacity(Number(event.target.value))}
                disabled={state.status === "creating"}
                className="mt-1 min-h-11 w-full rounded-lg border border-black/20 bg-transparent px-3 py-2 text-base dark:border-white/25"
              >
                {Array.from({ length: 19 }, (_, index) => index + 2).map((value) => (
                  <option key={value} value={value} className="text-black">
                    {value} kişi
                  </option>
                ))}
              </select>
            </label>
          </div>

          {visibility === "private" ? (
            <label className="text-sm font-medium">
              Oda şifresi
              <input
                type="password"
                minLength={6}
                maxLength={64}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={state.status === "creating"}
                placeholder="En az 6 karakter"
                className="mt-1 min-h-11 w-full rounded-lg border border-black/20 bg-transparent px-3 py-2 text-base dark:border-white/25"
              />
              <span className="mt-1 block text-xs font-normal text-black/60 dark:text-white/60">
                Şifre açık biçimde saklanmaz ve daha sonra gösterilmez.
              </span>
            </label>
          ) : null}

          {visibility === "public" && !canCreatePublic ? (
            <StatusMessage tone="warning" title="Public oda için üyelik gerekli">
              Anonim verileriniz kaybolmadan hesabınızı kaydedebilirsiniz.{" "}
              <Link href="/hesabini-kaydet?next=/rooms" className="font-semibold underline">
                Hesabımı kaydet
              </Link>
            </StatusMessage>
          ) : null}

          <SubscriptionPicker
            idPrefix="create-room"
            legend="Hangi aboneliklere sahipsiniz?"
            description="Film önerileri, odadaki bütün katılımcıların ORTAK platformlarından gelir. En az bir platform seçin."
            value={subscriptions}
            onChange={setSubscriptions}
            disabled={state.status === "creating"}
          />

          <button
            type="button"
            onClick={handleCreate}
            disabled={
              state.status === "creating" ||
              subscriptions.length === 0 ||
              name.trim() === "" ||
              (visibility === "private" && password.length < 6) ||
              (visibility === "public" && !canCreatePublic)
            }
            className="min-h-11 rounded-lg border border-black/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[0.04] disabled:opacity-60 dark:border-white/25 dark:hover:bg-white/10"
          >
            {state.status === "creating" ? "Oda oluşturuluyor…" : "Yeni oda oluştur"}
          </button>

          {subscriptions.length === 0 ? (
            <p className="text-xs text-black/60 dark:text-white/60">
              Devam etmek için en az bir abonelik seçin.
            </p>
          ) : null}
        </>
      ) : null}

      {state.status === "error" ? (
        <StatusMessage tone="error" title="Oda oluşturulamadı">
          {state.message}
        </StatusMessage>
      ) : null}

      {state.status === "created" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-black/10 p-3 dark:border-white/15">
          <p className="text-sm font-semibold">Oda hazır</p>

          <p className="text-sm text-black/70 dark:text-white/70">
            {state.room.name} · {state.room.visibility === "public" ? "Public" : "Private"} ·{" "}
            {state.room.capacity} kişi
          </p>

          <p className="text-xs text-black/60 dark:text-white/60">
            {state.room.visibility === "private"
              ? "Odanız Odalar listesinde PRIVATE etiketiyle görünür. Katılımcılar belirlediğiniz şifreyle girer."
              : "Odanız Public Odalar bölümünde listelenir; kayıtlı üyeler bağlantı olmadan katılabilir."}
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
