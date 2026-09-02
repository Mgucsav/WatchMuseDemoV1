import { RoomWaiting } from "@/components/rooms/RoomWaiting";

export const metadata = {
  title: "WatchMuse — Oda",
};

export default async function RoomPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;

  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
        <header>
          <h1 className="text-xl font-bold">Oda</h1>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            Birlikte film arayın, gizli oy verin ve ortak çarkı çevirin.
          </p>
        </header>

        <RoomWaiting spaceId={spaceId} />
      </div>
    </main>
  );
}
