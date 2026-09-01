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

  it("RR-03: legacy imza aday planı kabul etmez ve authenticated'a kapalıdır", () => {
    // İmza korunur (eski istemci "function does not exist" yerine domain
    // hatası alır) ama aday planını KAYDETMEZ.
    expect(sql).toMatch(/create or replace function public\.create_or_reset_space_round/i);
    expect(sql).toMatch(
      /create or replace function public\.create_or_reset_space_round[\s\S]*?raise exception 'round_creation_moved'/i,
    );
    // Delegasyon kaldırılmıştır: artık start_next_space_round çağırmaz.
    expect(sql).not.toMatch(
      /create or replace function public\.create_or_reset_space_round[\s\S]*?return public\.start_next_space_round/i,
    );
    // authenticated rolünden EXECUTE geri alınmıştır ve geri verilmez.
    expect(sql).toMatch(
      /revoke all on function public\.create_or_reset_space_round\(uuid, jsonb, boolean\)\s+from public, anon, authenticated/i,
    );
    expect(sql).not.toMatch(
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
    expect(sql).toContain("v_reserved_slots >= 9");
    expect(sql).toContain("consumed.selection_reason = 'priority_return'");
    expect(sql).toContain("consumed_round.round_number > q.round_number");
  });

  it("priority adaylarını discovery'den önce final listeye ekler", () => {
    expect(sql.indexOf("'selectionReason', 'priority_return'")).toBeGreaterThan(-1);
    expect(sql.indexOf("'selectionReason', 'priority_return'")).toBeLessThan(
      sql.indexOf("foreach v_pass in array v_passes"),
    );
  });

  it("terminal durumlar yeni tura izin verir, aktif tur döndürülür", () => {
    // Aktif tur tanimi: yalnizca terminal OLMAYAN durumlar.
    const activeRoundQuery = sql.match(
      /r\.status in \(\s*'voting'[\s\S]*?'spinning'::public\.space_round_status\s*\)/i,
    )?.[0];
    expect(activeRoundQuery).toBeDefined();
    expect(activeRoundQuery).not.toContain("'result'");
    expect(activeRoundQuery).not.toContain("'no_match'");
    expect(sql).toMatch(/if found then[\s\S]*?return v_active_round\.id/i);
  });

  it("no_match turlarını both-skip geçmiş sorgusunda tutar", () => {
    // Kural artik tek kaynakta (is_movie_hard_suppressed) ve cok satirli.
    expect(sql).toMatch(
      /sr\.status in \([\s\S]{0,120}'result'::public\.space_round_status[\s\S]{0,120}'no_match'::public\.space_round_status[\s\S]{0,20}\)/i,
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
    expect(sql).toMatch(
      /char_length\(coalesce\(e\.value ->> 'overview', ''\)\) > 5000/i,
    );
  });

  it("RR-01: fresh geçişi space'in TÜM geçmişini dışlar", () => {
    // Eski davranış yalnızca bir önceki tura bakıyordu; iki tur önce gösterilen
    // film "fresh" olarak geçebiliyordu. Artık tüm geçmiş bir CTE ile dışlanır.
    expect(sql).toContain("seen_before");
    expect(sql).toMatch(
      /seen_before as \([\s\S]*?from public\.space_rounds prior_round[\s\S]*?where prior_round\.space_id = p_space_id/i,
    );
    // Yalnızca önceki turu hedefleyen eski koşul tamamen kaldırılmıştır.
    expect(sql).not.toContain("v_previous_round_id");
    expect(sql).toContain("p_allow_eligible_repeats");
  });

  it("RR-01: eligible_repeat yalnızca açık kapıyla devreye girer", () => {
    expect(sql).toMatch(
      /v_passes := case[\s\S]{0,120}when p_allow_eligible_repeats then array\['fresh_discovery', 'eligible_repeat'\][\s\S]{0,60}else array\['fresh_discovery'\]/i,
    );
  });

  it("RR-01: reason değeri seçimi yapan geçişten gelir, çıkarımla üretilmez", () => {
    expect(sql).toContain("'selectionReason', v_pass");
    // Seçim sonrası geçmişe bakıp reason "düzelten" eski mantık kaldırıldı.
    expect(sql).not.toContain("historical_candidate");
  });

  it("RR-01: en az bir gerçek keşif slotu zorunludur", () => {
    expect(sql).toContain("v_fresh_count < 1");
    expect(sql).toContain("v_reserved_slots > 9");
    expect(sql).toMatch(/v_fresh_count < 1[\s\S]*?raise exception 'candidate_pool_incomplete'/i);
  });

  it("RR-01: hard suppression tek kaynaktan gelir ve her geçişte uygulanır", () => {
    expect(sql).toMatch(/create or replace function public\.is_movie_hard_suppressed/i);
    // Üç geçiş de aynı fonksiyonu çağırır; kural geçişler arasında ayrışamaz.
    const calls = sql.match(/not public\.is_movie_hard_suppressed\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("interval '30 days'");
    expect(sql).toContain("s.accepted_at is not null");
  });

  it("RR-02: aday planı kalıcılaştırma yalnızca service_role'a açıktır", () => {
    expect(sql).toMatch(
      /revoke all on function[\s\S]{0,40}public\.start_next_space_round\(uuid, uuid, jsonb, text, text, text, boolean\)[\s\S]{0,40}from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function[\s\S]{0,40}public\.start_next_space_round\(uuid, uuid, jsonb, text, text, text, boolean\)[\s\S]{0,40}to service_role/i,
    );
    expect(sql).not.toMatch(
      /grant execute on function[\s\S]{0,120}start_next_space_round[\s\S]{0,120}to authenticated/i,
    );
  });

  it("RR-02: aktör kimliği açıkça geçilir ve fonksiyon içinde doğrulanır", () => {
    expect(sql).toContain("p_actor_id uuid");
    expect(sql).toMatch(/if p_actor_id is null then[\s\S]{0,40}raise exception 'unauthenticated'/i);
    // service_role çağırsa bile üyelik bağımsız doğrulanır.
    expect(sql).toMatch(
      /from public\.participants p[\s\S]{0,40}where p\.space_id = p_space_id and p\.user_id = p_actor_id/i,
    );
  });

  it("D: sayısal cast yalnızca regex doğrulanmış CASE dalında yapılır", () => {
    expect(sql).toMatch(
      /case when candidate\.value ->> 'tmdbMovieId' ~ [\s\S]{0,80}?then \(candidate\.value ->> 'tmdbMovieId'\)::integer/i,
    );
    // Bozuk sayısal alan kontrollü domain hatası üretir.
    expect(sql).toMatch(
      /if v_invalid_count > 0 then[\s\S]{0,40}raise exception 'invalid_candidates'/i,
    );
  });

  it("D: seçim zinciri ve kazanan şema seviyesinde bağlanmıştır", () => {
    expect(sql).toContain("room_selections_candidate_chain_fk");
    expect(sql).toContain("room_selections_round_space_fk");
    expect(sql).toContain("space_rounds_winner_belongs_to_round");
    expect(sql).toContain("room_candidates_id_round_movie_unique");
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
