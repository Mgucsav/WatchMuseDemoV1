import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrations = join(process.cwd(), "supabase", "migrations");
const sql = readFileSync(join(migrations, "20261010000100_taste_ranking_and_round_genres.sql"), "utf8");
const previous = readFileSync(join(migrations, "20260814000100_room_subscriptions.sql"), "utf8");

function roundFunction(source: string): string {
  const body = source.match(
    /create or replace function public\.start_next_space_round\([\s\S]*?\n\$\$;/,
  )?.[0];
  expect(body).toBeTruthy();
  return body!;
}

describe("zevk sıralaması migration sözleşmesi", () => {
  it("aday sırasını sunucudaki sıralayıcıdan alır", () => {
    const next = roundFunction(sql);
    expect(next).toMatch(/order by v\.ordinal_position, v\.movie_id/);
    expect(next).not.toMatch(/md5\(p_selection_seed/);
  });

  it("sıra satırı dışında, çok kişili oda yamaları uygulanmış önceki fonksiyonla aynıdır", () => {
    // 20260902000100 fonksiyonu çalışma anında iki yerden yamalar; karşılaştırma
    // o yamalı hâlle yapılmalıdır, aksi halde çok kişili odalar geri bozulur.
    const multiRoom = readFileSync(join(migrations, "20260902000100_public_multi_rooms.sql"), "utf8");
    const patches = [...multiRoom.matchAll(/pg_catalog\.replace\(\s*v_definition,\s*'([\s\S]*?)',\s*'([\s\S]*?)'\s*\)/g)];
    expect(patches).toHaveLength(2);
    const patchedPrevious = patches.reduce(
      (body, [, from, to]) => body.replace(from, to),
      roundFunction(previous),
    );
    expect(patchedPrevious).not.toBe(roundFunction(previous));

    const strip = (body: string) =>
      body
        .split("\n")
        .filter((line) => !/^\s*--/.test(line) && !/^\s*order by (pg_catalog\.md5|v\.ordinal_position)/.test(line))
        .join("\n");
    expect(strip(roundFunction(sql))).toBe(strip(patchedPrevious));
  });

  it("çok kişili odalarda tur başlatmayı engellemez", () => {
    const next = roundFunction(sql);
    expect(next).toMatch(/where p\.space_id = p_space_id\) < 2 then/);
    expect(next).not.toMatch(/<> 2 then/);
    expect(next).not.toMatch(/\) = 2\s*\n\s*order by c\.tmdb_movie_id/);
  });

  it("tur fonksiyonunu yalnız service role'a açık tutar", () => {
    expect(sql).toMatch(/\) from public, anon, authenticated;/);
    expect(sql).toMatch(/\) to service_role;/);
  });

  it("tur başına en fazla 5 tür saklar", () => {
    expect(sql).toMatch(/add column if not exists genre_filter text\[\]/);
    expect(sql).toMatch(/cardinality\(genre_filter\) <= 5/);
  });
});
