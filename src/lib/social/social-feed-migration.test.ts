import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260902000400_social_feed.sql",
  ),
  "utf8",
);

describe("sosyal akış migration sözleşmesi", () => {
  it("post, beğeni ve repost tablolarını doğrudan erişime kapatır", () => {
    expect(sql).toMatch(/create table if not exists public\.social_posts/);
    expect(sql).toMatch(/create table if not exists public\.social_post_likes/);
    expect(sql).toMatch(/create table if not exists public\.social_post_reposts/);
    expect(sql).toMatch(/revoke all on table public\.social_posts/);
    expect(sql).toMatch(/alter table public\.social_posts enable row level security/);
  });

  it("okumada kimlik ve e-posta sızdırmayan güvenli RPC kullanır", () => {
    const listFunction = sql.match(
      /create or replace function public\.list_social_posts[\s\S]*?\$\$;/,
    )?.[0];
    expect(listFunction).toBeTruthy();
    expect(listFunction).not.toMatch(/returns table[\s\S]*user_id uuid/);
    expect(listFunction).not.toMatch(/email/);
    expect(sql).toMatch(/grant execute on function public\.list_social_posts/);
  });

  it("bütün yazma işlemlerinde kalıcı üyeliği veritabanında zorunlu tutar", () => {
    expect(sql.match(/raise exception 'registration_required'/g)).toHaveLength(3);
    expect(sql).toMatch(/create or replace function public\.create_social_post/);
    expect(sql).toMatch(/create or replace function public\.toggle_social_post_like/);
    expect(sql).toMatch(/create or replace function public\.toggle_social_post_repost/);
  });

  it("cevapları tek seviyede ve beğeni/repostları kullanıcı başına tekil tutar", () => {
    expect(sql).toMatch(/parent\.parent_post_id is null/);
    expect(sql).toMatch(/primary key \(post_id, user_id\)/);
  });
});
