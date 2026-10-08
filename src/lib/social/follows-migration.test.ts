import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20261008000100_follows_feed_sorting_and_profiles.sql",
  ),
  "utf8",
);

function fn(name: string): string {
  const body = sql.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`),
  )?.[0];
  expect(body, `${name} tanımlı olmalı`).toBeTruthy();
  return body!;
}

describe("takip, akış sıralaması ve profil migration sözleşmesi", () => {
  it("takip tablosunu tekil, kendini takip etmeye kapalı ve istemcilere kapalı tutar", () => {
    expect(sql).toMatch(/create table if not exists public\.follows/);
    expect(sql).toMatch(/primary key \(follower_id, followee_id\)/);
    expect(sql).toMatch(/check \(follower_id <> followee_id\)/);
    expect(sql).toMatch(/revoke all on table public\.follows from public, anon, authenticated/);
    expect(sql).toMatch(/alter table public\.follows enable row level security/);
  });

  it("ortak gönderi görünümünü istemci rollerine kapatır", () => {
    expect(sql).toMatch(/create or replace view public\.social_post_cards/);
    expect(sql).toMatch(
      /revoke all on table public\.social_post_cards from public, anon, authenticated/,
    );
  });

  it("liste fonksiyonları user_id veya e-posta döndürmez", () => {
    for (const name of [
      "list_social_feed",
      "list_social_replies",
      "list_profile_posts",
      "get_social_profile",
      "list_follows",
    ]) {
      const body = fn(name);
      const returns = body.match(/returns table \(([\s\S]*?)\)\s*language/)?.[1] ?? "";
      expect(returns, name).not.toMatch(/user_id|follower_id|followee_id|email/);
    }
  });

  it("akışta yalnız bilinen kapsam ve sıralamaları kabul eder", () => {
    const feed = fn("list_social_feed");
    expect(feed).toMatch(/p_scope not in \('all', 'following'\)/);
    expect(feed).toMatch(/p_sort not in \('new', 'hot', 'top'\)/);
    expect(feed).toMatch(/raise exception 'invalid_feed_option'/);
    // Hot: Reddit tarzı log10(etkileşim) + zaman / 45000.
    expect(feed).toMatch(/pg_catalog\.log\(/);
    expect(feed).toMatch(/\/ 45000/);
    expect(feed).toMatch(/interval '30 days'/);
  });

  it("beğenileri yalnız profil sahibine gösterir", () => {
    const posts = fn("list_profile_posts");
    expect(posts).toMatch(/p_kind = 'likes' and v_target <> v_user_id/);
    expect(posts).toMatch(/raise exception 'likes_private'/);
  });

  it("takibi kalıcı üyelikle sınırlar ve kendini takip etmeyi reddeder", () => {
    const follow = fn("toggle_follow");
    expect(follow).toMatch(/raise exception 'registration_required'/);
    expect(follow).toMatch(/v_target = v_user_id/);
    expect(follow).toMatch(/raise exception 'invalid_follow_target'/);
  });

  it("anonim hesapları profil olarak çözmez", () => {
    const resolve = fn("resolve_social_profile");
    expect(resolve).toMatch(/not coalesce\(u\.is_anonymous, true\)/);
    expect(resolve).toMatch(/raise exception 'profile_not_found'/);
    expect(sql).toMatch(
      /revoke all on function public\.resolve_social_profile\(text\) from public, anon, authenticated/,
    );
  });

  it("kapak yolunu kullanıcının kendi klasörüyle sınırlar", () => {
    const banner = fn("set_my_banner_path");
    expect(banner).toMatch(/split_part\(p_banner_path, '\/', 1\) <> v_user_id::text/);
    expect(sql).toContain("'profile-banners'");
    expect(sql).toContain("5242880");
  });

  it("yeni RPC'leri yalnız authenticated role açar", () => {
    for (const signature of [
      "list_social_feed(text,text,integer)",
      "list_social_replies(uuid,integer)",
      "get_social_profile(text)",
      "list_profile_posts(text,text,integer)",
      "toggle_follow(text)",
      "list_follows(text,text,integer)",
      "set_my_banner_path(text)",
    ]) {
      expect(sql).toContain(`'${signature}'`);
    }
    expect(sql).toMatch(/revoke all on function public\.' \|\| fn \|\| ' from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.' \|\| fn \|\| ' to authenticated/);
  });
});
