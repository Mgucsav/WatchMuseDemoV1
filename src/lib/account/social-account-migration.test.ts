import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260903000300_social_accounts.sql"),
  "utf8",
);

describe("sosyal hesap migration sözleşmesi", () => {
  it("kullanıcı adını benzersiz ve DM tercihini sınırlı tutar", () => {
    expect(sql).toMatch(/profiles_username_unique/);
    expect(sql).toMatch(/dm_privacy in \('everyone', 'friends', 'nobody'\)/);
  });

  it("arkadaşlık çiftini iki yönde de tekilleştirir", () => {
    expect(sql).toMatch(/friendships_unique_pair/);
    expect(sql).toMatch(/least\(requester_id, addressee_id\)/);
  });

  it("DM iznini alıcının tercihi ve arkadaşlık durumuyla zorunlu tutar", () => {
    const send = sql.match(/create or replace function public\.send_direct_message[\s\S]*?\$\$;/)?.[0];
    expect(send).toMatch(/v_privacy = 'nobody'/);
    expect(send).toMatch(/v_privacy = 'friends'/);
    expect(send).toMatch(/f\.status = 'accepted'/);
  });

  it("ham sosyal tabloları istemci rollerine kapatır", () => {
    expect(sql).toMatch(/revoke all on table public\.friendships, public\.direct_messages/);
    expect(sql).toMatch(/enable row level security/);
  });

  it("avatar bucket boyutunu ve MIME tiplerini sınırlar", () => {
    expect(sql).toContain("'profile-avatars'");
    expect(sql).toContain("5242880");
    expect(sql).toContain("'image/jpeg', 'image/png', 'image/webp'");
  });
});
