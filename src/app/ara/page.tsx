import { MovieSearch } from "@/components/MovieSearch";

export const metadata = { title: "WatchMuse — Film ara" };

export default function SearchPage() {
  return (
    <main className="flex-1">
      <MovieSearch />
    </main>
  );
}
