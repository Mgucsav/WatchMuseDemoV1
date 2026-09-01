import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Abonelik migration'ının sözleşmesi — STATİK metin kontrolü.
 *
 * Bu dosya bir veritabanı entegrasyon testi DEĞİLDİR: yalnızca SQL metnini
 * okur. Kısıtların, grant'lerin ve alt küme kuralının gerçekten uygulandığı
 * `supabase/tests/sql/08_subscription_intersection.sql` ile kanıtlanır ve o
 * paket bu makinede ÇALIŞTIRILMAMIŞTIR (bkz. supabase/tests/README.md).
 */

const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260814000100_room_subscriptions.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("room-subscriptions migration contract (statik; DB entegrasyonu değildir)", () => {
  it("iki tarafın beyanını ve turun ortak kümesini saklar", () => {
    expect(sql).toContain("add column if not exists subscriptions text[]");
    expect(sql).toContain("add column if not exists provider_keys text[]");
    expect(sql).toContain("participants_subscriptions_valid");
    expect(sql).toContain("space_rounds_provider_keys_valid");
  });

  it("doğrulama fonksiyonu NULL döndürmez (check constraint NULL'ı geçirir)", () => {
    expect(sql).toMatch(
      /create or replace function public\.is_valid_subscription_keys[\s\S]*?select coalesce\(/i,
    );
    expect(sql).toMatch(/is_valid_subscription_keys[\s\S]*?immutable/i);
  });

  it("platform kataloğunu SQL'e gömmez", () => {
    // Anahtar listesi uygulama kodundadır; migration yalnızca biçim doğrular.
    expect(sql).not.toMatch(/'netflix'/i);
    expect(sql).not.toMatch(/'prime_video'/i);
    expect(sql).toContain("^[a-z][a-z0-9_]{1,31}$");
  });

  it("boş ortak kümeyle tur açılmasını reddeder", () => {
    expect(sql).toMatch(
      /if p_provider_keys is null[\s\S]{0,160}raise exception 'no_shared_subscriptions'/i,
    );
  });

  it("geçmişten tekrarı ALT KÜME kuralına bağlar", () => {
    expect(sql).toContain("r.provider_keys <@ p_provider_keys");
    expect(sql).toContain("prior_round.provider_keys <@ p_provider_keys");
    // `seen_before` tüm geçmişi kapsamayı sürdürür: bir film "daha önce
    // gösterildi mi" sorusu sağlayıcı kümesinden bağımsızdır.
    expect(sql).toMatch(
      /repeatable_before as \([\s\S]*?provider_keys <@ p_provider_keys/i,
    );
    expect(sql).toContain("legacy_unknown");
  });

  it("beyansız oda oluşturma ve katılma yollarını kapatır", () => {
    expect(sql).toMatch(
      /create or replace function public\.create_space\(p_token_hash text\)[\s\S]*?raise exception 'subscriptions_required'/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.join_space_with_invitation\(p_token_hash text\)[\s\S]*?raise exception 'subscriptions_required'/i,
    );
    // Sağlayıcı kümesiz tur imzası geride BIRAKILMAZ.
    expect(sql).toMatch(
      /drop function if exists public\.start_next_space_round\(\s*uuid, uuid, jsonb, text, text, text, boolean\s*\)/i,
    );
  });

  it("RR-02 güven sınırını korur: tur açma yalnızca service_role'a açıktır", () => {
    expect(sql).toMatch(
      /revoke all on function public\.start_next_space_round\([\s\S]{0,80}text\[\]\s*\) from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.start_next_space_round\([\s\S]{0,80}text\[\]\s*\) to service_role/i,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.start_next_space_round[\s\S]{0,160}to authenticated/i,
    );
  });

  it("beyan güncelleme yalnızca çağıranın kendi satırını hedefler", () => {
    expect(sql).toMatch(
      /update public\.participants p\s+set subscriptions = p_subscriptions\s+where p\.space_id = p_space_id\s+and p\.user_id = v_user_id/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.set_participant_subscriptions\(uuid, text\[\]\)\s+to authenticated/i,
    );
  });
});
