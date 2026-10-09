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

  it("sıra satırı dışında önceki fonksiyonla birebir aynıdır", () => {
    const strip = (body: string) =>
      body
        .split("\n")
        .filter((line) => !/^\s*--/.test(line) && !/^\s*order by (pg_catalog\.md5|v\.ordinal_position)/.test(line))
        .join("\n");
    expect(strip(roundFunction(sql))).toBe(strip(roundFunction(previous)));
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
