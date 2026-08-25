import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260813000100_reusable_rounds.sql",
    import.meta.url,
  ),
);
const sql = readFileSync(migrationPath, "utf8");
const baseRoundSql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260812000200_room_rounds_votes_and_wheel.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("reusable-round migration contract (statik; DB entegrasyonu değildir)", () => {
  it("eski tur geçmişini silmez ve append-only insert kullanır", () => {
    expect(sql).not.toMatch(/delete\s+from\s+public\.space_rounds/i);
    expect(sql).toContain("insert into public.space_rounds");
    expect(sql).toContain("space_rounds_space_round_number_unique");
  });

  it("eski RPC imzasını silmeyen compatibility wrapper olarak korur", () => {
    expect(sql).toMatch(
      /create or replace function public\.create_or_reset_space_round[\s\S]*?return public\.start_next_space_round/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.create_or_reset_space_round[\s\S]*?to authenticated/i,
    );
  });

  it("tek aktif turu constraint ve oda kilidiyle korur", () => {
    expect(sql).toContain("space_rounds_one_active_per_space_idx");
    expect(sql).toMatch(/from public\.spaces s[\s\S]*?for update/i);
    expect(sql).toMatch(/if found then[\s\S]*?return v_active_round\.id/i);
  });

  it("tam 10 benzersiz adayı ve izinli reason değerlerini zorlar", () => {
    expect(sql).toContain("cardinality(v_seen_ids) <> 10");
    expect(baseRoundSql).toContain("room_candidates_round_tmdb_unique");
    for (const reason of [
      "priority_return",
      "fresh_discovery",
      "eligible_repeat",
      "backfill",
    ]) {
      expect(sql).toContain(`'${reason}'`);
    }
  });

  it("priority return'ü en fazla dokuz slotla sınırlar ve geçmişten tüketir", () => {
    expect(sql).toContain("jsonb_array_length(v_final) < 9");
    expect(sql).toContain("consumed.selection_reason = 'priority_return'");
    expect(sql).toContain("consumed_round.round_number > q.round_number");
  });

  it("priority adaylarını discovery'den önce final listeye ekler", () => {
    expect(sql.indexOf("'selectionReason', 'priority_return'")).toBeGreaterThan(-1);
    expect(sql.indexOf("'selectionReason', 'priority_return'")).toBeLessThan(
      sql.indexOf("for v_reason in"),
    );
  });

  it("terminal durumlar yeni tura izin verir, aktif tur döndürülür", () => {
    const activeRoundQuery = sql.match(
      /r\.status in \([\s\S]*?'voting'[\s\S]*?'matching'[\s\S]*?'spinning'[\s\S]*?\)/i,
    )?.[0];
    expect(activeRoundQuery).toBeDefined();
    expect(activeRoundQuery).not.toContain("'result'");
    expect(activeRoundQuery).not.toContain("'no_match'");
    expect(sql).toMatch(/if found then[\s\S]*?return v_active_round\.id/i);
  });

  it("no_match turlarını both-skip geçmiş sorgusunda tutar", () => {
    expect(sql).toContain(
      "sr.status in ('result'::public.space_round_status, 'no_match'::public.space_round_status)",
    );
  });

  it("acceptance yalnızca auth.uid() kullanıcısına ve aynı transaction'da yazılır", () => {
    expect(sql).toContain("v_user_id uuid := (select auth.uid())");
    expect(sql).toContain("insert into public.room_selection_acceptances");
    expect(sql).toMatch(
      /insert into public\.library_items[\s\S]*?v_user_id,[\s\S]*?on conflict \(user_id, tmdb_movie_id\)/i,
    );
    expect(sql).not.toMatch(/partner_library|partner_user_id/i);
  });

  it("acceptance deadline'ı ve idempotency veritabanında uygulanır", () => {
    expect(sql).toContain("v_selection.response_deadline <= v_accepted_at");
    expect(sql).toContain("on conflict (selection_id, user_id) do nothing");
    expect(sql).not.toMatch(/delete\s+from\s+public\.room_selection_acceptances/i);
  });

  it("acceptance yalnız result turuna ve sınırlı payload'a izin verir", () => {
    expect(sql).toMatch(
      /r\.id = v_selection\.round_id[\s\S]*?r\.status = 'result'::public\.space_round_status/i,
    );
    expect(sql).toContain("octet_length(p_candidates::text) > 1000000");
    expect(sql).toContain("char_length(coalesce(p.raw ->> 'overview', '')) <= 5000");
  });

  it("önceki tur adaylarını normal geçişte dışarıda tutar", () => {
    expect(sql).toMatch(
      /v_reason = 'eligible_repeat'[\s\S]*?previous\.round_id = v_previous_round_id/i,
    );
    expect(sql).toContain("p_allow_eligible_repeats");
  });

  it("selection tablolarını doğrudan istemci okumalarına açmaz", () => {
    expect(sql).toMatch(
      /revoke all on public\.room_selections, public\.room_selection_acceptances\s+from anon, authenticated/i,
    );
    expect(sql).not.toMatch(/create policy .*room_selection/i);
  });

  it("gizlilik sızdıran prototip RPC'lerini içermez", () => {
    expect(sql).not.toMatch(/signal_facts|excluded_movies|signal_counts/i);
  });
});
