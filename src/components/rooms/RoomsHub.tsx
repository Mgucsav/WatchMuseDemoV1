"use client";

import { useState } from "react";

import { PublicRoomBrowser } from "./PublicRoomBrowser";
import { RoomCreator } from "./RoomCreator";

export function RoomsHub({ isRegistered }: { isRegistered: boolean }) {
  const [mode, setMode] = useState<"browse" | "create">("browse");

  if (mode === "create") {
    return (
      <section className="flex flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Yeni oda oluştur</h1>
            <p className="mt-1 text-sm text-ink-70">
              Görünürlüğü, kişi sınırını ve aboneliklerinizi belirleyin.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMode("browse")}
            className="min-h-10 rounded-lg border border-line-20 px-3 text-sm font-medium"
          >
            Odalara dön
          </button>
        </header>
        <div className="rounded-xl border border-line-10 p-4">
          <RoomCreator canCreatePublic={isRegistered} />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Film karar odaları</h1>
          <p className="mt-1 text-sm text-ink-70">
            Açık odalara katılın veya kendi film karar odanızı kurun.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMode("create")}
          className="min-h-10 rounded-lg bg-fill-inverse px-4 text-sm font-semibold text-on-inverse"
        >
          Yeni oda oluştur
        </button>
      </header>
      <PublicRoomBrowser canJoinPublic={isRegistered} />
    </section>
  );
}
