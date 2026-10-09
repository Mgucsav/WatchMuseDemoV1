import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ROOM_INACTIVITY_MINUTES } from "@/lib/constants";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20261009000100_room_inactivity_and_movie_genres.sql",
  ),
  "utf8",
);

describe("hareketsiz oda kapatma ve tür önbelleği migration sözleşmesi", () => {
  it("odayı arayüzdeki süreyle aynı sürede kapatır", () => {
    const close = sql.match(
      /create or replace function public\.close_inactive_spaces[\s\S]*?\$\$;/,
    )?.[0];
    expect(close).toBeTruthy();
    expect(close).toContain(`interval '${ROOM_INACTIVITY_MINUTES} minutes'`);
    expect(close).toMatch(/set status = 'closed'::public\.space_status/);
    // Kapanan odadaki açık oylama yarım kalmaz.
    expect(close).toMatch(/set status = 'no_match'::public\.space_round_status/);
  });

  it("hareket sayılan bütün tablolara tetikleyici kurar", () => {
    for (const table of [
      "participants",
      "room_messages",
      "space_rounds",
      "room_votes",
      "room_selections",
      "room_selection_acceptances",
      "room_teleparty_sessions",
    ]) {
      expect(sql).toContain(`'${table}'`);
    }
    expect(sql).toMatch(/after insert or update or delete on public\.%I/);
  });

  it("zamanlanmış görevi kurar ama pg_cron yoksa migration'ı durdurmaz", () => {
    expect(sql).toMatch(/cron\.schedule\(\s*'watchmuse-close-inactive-rooms'/);
    expect(sql).toMatch(/exception when others then/);
  });

  it("kapatma fonksiyonunu anonim role kapatır", () => {
    expect(sql).toMatch(/revoke all on function public\.close_inactive_spaces\(uuid\) from public, anon/);
    expect(sql).toMatch(/revoke all on function public\.touch_space_activity\(\) from public, anon, authenticated/);
  });

  it("tür önbelleğini yalnız okunabilir açar", () => {
    expect(sql).toMatch(/create table if not exists public\.movie_genres/);
    expect(sql).toMatch(/revoke all on table public\.movie_genres from public, anon, authenticated/);
    expect(sql).toMatch(/grant select on table public\.movie_genres to authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*movie_genres/i);
  });
});
