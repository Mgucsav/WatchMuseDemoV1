import Link from "next/link";

import { MovieSearch } from "@/components/MovieSearch";

export default function Home() {
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-2xl px-4 pt-6">
        <Link
          href="/rooms"
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          İki kişilik oda oluştur
        </Link>
      </div>

      <MovieSearch />
    </main>
  );
}
