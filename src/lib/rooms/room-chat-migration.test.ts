import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260902000200_room_chat.sql",
  ),
  "utf8",
);

describe("oda sohbeti migration sözleşmesi", () => {
  it("mesaj tablosunu RLS ve doğrudan erişim yasağıyla kurar", () => {
    expect(sql).toMatch(/create table if not exists public\.room_messages/);
    expect(sql).toMatch(/revoke all on table public\.room_messages/);
    expect(sql).toMatch(/alter table public\.room_messages enable row level security/);
  });

  it("okuma ve yazmayı yalnız güvenli RPC'lerden geçirir", () => {
    expect(sql).toMatch(/create or replace function public\.get_space_messages/);
    expect(sql).toMatch(/create or replace function public\.send_space_message/);
    expect(sql).toMatch(/where p\.space_id = p_space_id and p\.user_id = v_user_id/);
    expect(sql).toMatch(/grant execute on function public\.get_space_messages/);
    expect(sql).toMatch(/grant execute on function public\.send_space_message/);
  });

  it("mesaj boyutu ve hız sınırını veritabanında uygular", () => {
    expect(sql).toMatch(/char_length\(v_body\) not between 1 and 1000/);
    expect(sql).toMatch(/interval '750 milliseconds'/);
    expect(sql).toMatch(/room_message_rate_limited/);
  });

  it("user_id alanını okuma RPC sonucuna dahil etmez", () => {
    const signature = sql.match(
      /create or replace function public\.get_space_messages[\s\S]*?\)\nlanguage plpgsql/,
    )?.[0];
    expect(signature).toBeTruthy();
    expect(signature).not.toMatch(/user_id uuid/);
  });
});
