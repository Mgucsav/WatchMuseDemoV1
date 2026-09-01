import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260901000100_teleparty_bridge.sql",
    import.meta.url,
  ),
);
const sql = readFileSync(migrationPath, "utf8");

describe("Teleparty bridge migration sözleşmesi (statik)", () => {
  it("bağlantı tablosunu doğrudan istemci erişimine kapatır", () => {
    expect(sql).toMatch(/revoke all on table public\.room_teleparty_sessions/i);
    expect(sql).toMatch(/room_teleparty_sessions enable row level security/i);
    expect(sql).not.toMatch(/create policy[\s\S]*room_teleparty_sessions/i);
  });

  it("yalnız resmi HTTPS Teleparty katılım adresini kabul eder", () => {
    expect(sql).toContain("https://redirect[.]teleparty[.]com/join/");
    expect(sql).toMatch(/invalid_teleparty_link/);
  });

  it("paylaşımı host ve iki kabul şartıyla sınırlar", () => {
    expect(sql).toMatch(/p\.role = 'host'/);
    expect(sql).toMatch(/v_participant_count <> 2 or v_acceptance_count <> 2/);
    expect(sql).toMatch(/teleparty_not_ready/);
  });

  it("partner kabulünü çağıranın kendi kabulü olmadan açığa çıkarmaz", () => {
    expect(sql).toMatch(/mine\.user_id = v_user_id/);
    expect(sql).toMatch(/case when readiness\.both_accepted then tp\.join_url else null end/);
  });
});
