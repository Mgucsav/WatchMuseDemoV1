import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrations = join(process.cwd(), "supabase", "migrations");
const read = (name: string) => readFileSync(join(migrations, name), "utf8");

const sql = read("20261010000200_majority_room_matching.sql");
const rounds = read("20260813000100_reusable_rounds.sql");
const taste = read("20261010000100_taste_ranking_and_round_genres.sql");

/** Fonksiyonun $$ … $$ gövdesi: pg_get_functiondef bunu olduğu gibi döndürür. */
function body(source: string, name: string): string {
  const match = source.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\n\\$\\$;`),
  );
  expect(match, `${name} gövdesi bulunmalı`).toBeTruthy();
  return match![1];
}

/** Migration'daki (fonksiyon, desen, yerine) üçlüleri. */
const targets = [...sql.matchAll(/'public\.([a-z_]+)\([^']*\)'::regprocedure,\s*\$re\$([\s\S]*?)\$re\$,\s*'([^']*)'/g)].map(
  ([, fn, pattern, replacement]) => ({ fn, pattern, replacement }),
);

const bodies: Record<string, string> = {
  cast_space_round_vote: body(rounds, "cast_space_round_vote"),
  start_space_round_wheel: body(rounds, "start_space_round_wheel"),
  get_space_round_state: body(rounds, "get_space_round_state"),
  start_next_space_round: body(taste, "start_next_space_round"),
};

describe("çoğunluk eşleşmesi migration sözleşmesi", () => {
  it("eşleşmeyi hesaplayan dört fonksiyonu yamalar", () => {
    expect(targets.map((target) => target.fn).sort()).toEqual(Object.keys(bodies).sort());
  });

  it("her desen kendi fonksiyonunda tam bir kez eşleşir ve eski oybirliği koşulunu kaldırır", () => {
    for (const { fn, pattern, replacement } of targets) {
      // PostgreSQL ARE ile aynı yapılar: \s, \(, \*, \. JavaScript'te de geçerli.
      const regex = new RegExp(pattern, "g");
      const original = bodies[fn];
      expect(original.match(regex), fn).toHaveLength(1);

      const patched = original.replace(regex, replacement);
      expect(patched, fn).toContain("public.space_candidate_is_match(");
      expect(patched, fn).not.toMatch(/'want'::public\.space_round_vote\s*\)\s*=\s*(v_participant_count|\(select count)/);
    }
  });

  it("kesin kural: 2 kişide oybirliği, 3+ kişide çoğunluk ve vetosuzluk", () => {
    const helper = sql.match(/create or replace function public\.space_candidate_is_match[\s\S]*?\$\$;/)?.[0];
    expect(helper).toMatch(/when p_participant_count <= 2 then t\.wants = p_participant_count/);
    expect(helper).toMatch(/else t\.skips = 0 and t\.wants \* 2 > p_participant_count/);
  });

  it("kesin eşleşme yoksa herkesin en az Belki dediği filmlere düşer", () => {
    const helper = sql.match(/create or replace function public\.space_candidate_is_match[\s\S]*?\$\$;/)?.[0];
    expect(helper).toMatch(/when exists \(select 1 from strict_matches\) then\s+exists \(select 1 from strict_matches s where s\.id = p_candidate_id\)/);
    expect(helper).toMatch(/t\.skips = 0\s+and t\.votes >= p_participant_count/);
  });

  it("yardımcıyı istemci rollerine kapatır ve yeniden çalıştırmada yamalı fonksiyonu atlar", () => {
    expect(sql).toMatch(/revoke all on function public\.space_candidate_is_match\(uuid, uuid, integer\)\s+from public, anon, authenticated/);
    expect(sql).toMatch(/strpos\(v_definition, 'public\.space_candidate_is_match\('\) > 0 then\s+continue;/);
    expect(sql).toMatch(/raise exception 'majority_match_patch_failed/);
  });
});
