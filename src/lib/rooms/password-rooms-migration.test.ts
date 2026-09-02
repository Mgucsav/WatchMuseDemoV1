import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260902000300_password_rooms_and_departure.sql",
  ),
  "utf8",
);

describe("şifreli odalar ve ayrılma migration sözleşmesi", () => {
  it("şifre özetlerini doğrudan istemci erişimine kapalı ayrı tabloda tutar", () => {
    expect(sql).toMatch(/create table if not exists public\.space_passwords/);
    expect(sql).toMatch(/password_hash text not null/);
    expect(sql).toMatch(/revoke all on table public\.space_passwords/);
    expect(sql).toMatch(/enable row level security/);
  });

  it("private odayı listeler ama özeti ve tokenı dışarı çıkarmaz", () => {
    const listFunction = sql.match(
      /create or replace function public\.list_discoverable_spaces\(\)[\s\S]*?\$\$;/,
    )?.[0];
    expect(listFunction).toBeTruthy();
    expect(listFunction).toMatch(/s\.visibility = 'private'/);
    expect(listFunction).not.toMatch(/password_hash|token_hash|user_id uuid/);
  });

  it("şifre doğrulanmış private katılım RPC'sini yalnız service role'e açar", () => {
    expect(sql).toMatch(/create or replace function public\.join_private_space_as_actor/);
    expect(sql).toMatch(
      /revoke all on function public\.join_private_space_as_actor\(uuid, uuid, text\[\]\)[\s\S]*from public, anon, authenticated/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.join_private_space_as_actor\(uuid, uuid, text\[\]\)[\s\S]*to service_role/,
    );
  });

  it("host kapatma ve guest ayrılma yollarını sağlar", () => {
    expect(sql).toMatch(/create or replace function public\.leave_space/);
    expect(sql).toMatch(/create or replace function public\.close_space/);
    expect(sql).toMatch(/raise exception 'guest_required'/);
    expect(sql).toMatch(/set status = 'closed'::public\.space_status/);
  });
});
