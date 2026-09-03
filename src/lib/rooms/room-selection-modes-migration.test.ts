import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260903000100_room_selection_modes.sql",
  ),
  "utf8",
);

describe("oda film seçme yöntemi migration sözleşmesi", () => {
  it("oda yöntemini wheel/direct olarak sınırlar ve oluştururken kaydeder", () => {
    expect(sql).toMatch(/selection_mode text not null default 'wheel'/);
    expect(sql).toMatch(/selection_mode in \('wheel', 'direct'\)/);
    expect(sql).toMatch(/p_selection_mode text/);
    expect(sql).toMatch(/status, created_by, name, visibility, capacity, selection_mode/);
  });

  it("belirlenmiş film RPC'sini yalnız service role'e açar", () => {
    expect(sql).toMatch(/create or replace function public\.start_direct_space_selection/);
    expect(sql).toMatch(/p\.role = 'host'/);
    expect(sql).toMatch(/v_space\.selection_mode <> 'direct'/);
    expect(sql).toMatch(
      /revoke all on function[\s\S]*start_direct_space_selection\(uuid, uuid, jsonb, text\[\]\)[\s\S]*from public, anon, authenticated/,
    );
    expect(sql).toMatch(
      /grant execute on function[\s\S]*start_direct_space_selection\(uuid, uuid, jsonb, text\[\]\)[\s\S]*to service_role/,
    );
  });

  it("filmi ortak abonelik ve mevcut seçim zinciriyle sınırlar", () => {
    expect(sql).toMatch(/p_provider_keys <@ p\.subscriptions/);
    expect(sql).toMatch(/candidate_count between 1 and 10/);
    expect(sql).toContain("'direct_choice'");
    expect(sql).toMatch(/insert into public\.room_selections/);
  });

  it("oda vitrini hassas alan olmadan seçim yöntemini döndürür", () => {
    const listFunction = sql.match(
      /create or replace function public\.list_discoverable_spaces\(\)[\s\S]*?\$\$;/,
    )?.[0];
    expect(listFunction).toBeTruthy();
    expect(listFunction).toMatch(/selection_mode text/);
    expect(listFunction).not.toMatch(/password_hash|token_hash|user_id uuid/);
  });
});
