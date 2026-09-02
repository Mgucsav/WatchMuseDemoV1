import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260902000100_public_multi_rooms.sql",
  ),
  "utf8",
);

describe("public ve çok katılımcılı oda migration sözleşmesi", () => {
  it("görünürlük, kapasite ve tek-host kısıtlarını kurar", () => {
    expect(sql).toMatch(/visibility text not null default 'private'/);
    expect(sql).toMatch(/capacity between 2 and 20/);
    expect(sql).toMatch(/participants_one_host_per_space/);
    expect(sql).toMatch(/drop constraint if exists participants_unique_role_per_space/);
  });

  it("public oda üyeliğini veritabanında zorunlu tutar", () => {
    expect(sql).toMatch(/create or replace function public\.join_public_space/);
    expect(sql).toMatch(/if v_is_anonymous then[\s\S]*registration_required/);
    expect(sql).toMatch(/grant execute on function public\.join_public_space/);
  });

  it("host kick ve yeniden katılım engelini birlikte uygular", () => {
    expect(sql).toMatch(/create table if not exists public\.space_bans/);
    expect(sql).toMatch(/create or replace function public\.kick_space_participant/);
    expect(sql).toMatch(/insert into public\.space_bans/);
    expect(sql).toMatch(/delete from public\.participants/);
  });

  it("public vitrin hiçbir davet alanı döndürmez", () => {
    const listFunction = sql.match(
      /create or replace function public\.list_public_spaces\(\)[\s\S]*?\$\$;/,
    )?.[0];
    expect(listFunction).toBeTruthy();
    expect(listFunction).not.toMatch(/token_hash|invite|user_id uuid/);
  });
});
