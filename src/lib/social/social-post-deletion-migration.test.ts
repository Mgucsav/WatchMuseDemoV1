import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260903000200_social_post_deletion.sql",
  ),
  "utf8",
);

describe("sosyal gönderi silme migration sözleşmesi", () => {
  it("kullanıcı kimliğini açmadan sahiplik alanı döndürür", () => {
    const listFunction = sql.match(
      /create or replace function public\.list_social_posts_v2[\s\S]*?\$\$;/,
    )?.[0];
    expect(listFunction).toBeTruthy();
    expect(listFunction).toMatch(/is_mine boolean/);
    expect(listFunction).toMatch(/post\.user_id = \(select auth\.uid\(\)\)/);
    expect(listFunction).not.toMatch(/returns table \([\s\S]*?user_id uuid/);
  });

  it("silme işlemini yalnız yazara sınırlar", () => {
    expect(sql).toMatch(/create or replace function public\.delete_social_post/);
    expect(sql).toMatch(/post\.id = p_post_id and post\.user_id = v_user_id/);
    expect(sql).toMatch(/raise exception 'social_post_not_found'/);
  });

  it("silme RPC'sini authenticated role açıp doğrudan tablo izni vermez", () => {
    expect(sql).toMatch(/revoke all on function public\.delete_social_post\(uuid\)/);
    expect(sql).toMatch(/grant execute on function public\.delete_social_post\(uuid\)[\s\S]*to authenticated/);
    expect(sql).not.toMatch(/grant delete on.*social_posts/i);
  });
});
