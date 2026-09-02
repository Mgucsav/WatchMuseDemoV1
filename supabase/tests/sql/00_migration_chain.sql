-- =============================================================================
-- Boş veritabanında tam migration zinciri
--
-- NOT: bu dosya `psql` ile ve `-v MIGRATIONS_DIR=...` ile çalıştırılmalıdır.
-- Runner bunu otomatik geçirir.
--
-- ⚠️ Bu dosya `public` şemasını DÜŞÜRÜR. Yalnızca atılabilir bir test
-- veritabanında çalıştırın.
-- =============================================================================

\set ON_ERROR_STOP on

-- Temiz başlangıç ------------------------------------------------------------
drop schema if exists public cascade;
create schema public;

-- Supabase benzeri roller ve auth şeması (yerel Postgres için).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id           uuid primary key default gen_random_uuid(),
  email        text,
  is_anonymous boolean not null default false
);

-- Supabase'in `auth.uid()` karşılığı: JWT claim'inden okur.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::json ->> 'sub',
    ''
  )::uuid;
$$;

grant usage on schema public to anon, authenticated, service_role;

-- Migration zinciri ------------------------------------------------------------
\i :MIGRATIONS_DIR/20260811000100_rooms_schema.sql
\i :MIGRATIONS_DIR/20260811000200_rooms_rls.sql
\i :MIGRATIONS_DIR/20260811000300_rooms_functions.sql
\i :MIGRATIONS_DIR/20260812000100_profiles_and_library.sql
\i :MIGRATIONS_DIR/20260812000200_room_rounds_votes_and_wheel.sql
\i :MIGRATIONS_DIR/20260813000100_reusable_rounds.sql
\i :MIGRATIONS_DIR/20260814000100_room_subscriptions.sql
\i :MIGRATIONS_DIR/20260901000100_teleparty_bridge.sql
\i :MIGRATIONS_DIR/20260902000100_public_multi_rooms.sql
\i :MIGRATIONS_DIR/20260902000200_room_chat.sql

-- Doğrulama --------------------------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  -- Bu dosya helper'lardan ONCE calisir (public semasini dusurdugu icin),
  -- bu yuzden satir ici assertion kullanilir.

  -- Tablolar
  select (select count(*) from pg_tables
     where schemaname = 'public'
       and tablename in (
         'spaces','participants','invitations','profiles','library_items',
         'space_rounds','room_candidates','room_votes',
         'room_selections','room_selection_acceptances','room_teleparty_sessions',
         'space_bans','room_messages'
       )) = 13 into v_ok;
  if not v_ok then raise exception 'ASSERTION FAILED: on uc tablonun tamami olusmali'; end if;

  -- Çok turlu oda: eski unique kısıt kaldırılmış olmalı
  select not exists (
    select 1 from pg_constraint where conname = 'space_rounds_space_id_key'
  ) into v_ok;
  if not v_ok then raise exception 'ASSERTION FAILED: tek-tur kisiti KALDIRILMIS olmali'; end if;

  -- Tek aktif tur indeksi
  select exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'space_rounds_one_active_per_space_idx'
  ) into v_ok;
  if not v_ok then raise exception 'ASSERTION FAILED: tek aktif tur indeksi olusmali'; end if;

  -- İlişkisel bütünlük (D)
  select (select count(*) from pg_constraint
    where conname in (
      'room_selections_round_space_fk',
      'room_selections_candidate_chain_fk',
      'space_rounds_winner_belongs_to_round'
    )) = 3 into v_ok;
  if not v_ok then raise exception 'ASSERTION FAILED: composite butunluk kisitlari olusmali'; end if;

  -- RLS
  select (select bool_and(relrowsecurity) from pg_class
    where relname in (
      'spaces','participants','invitations','profiles','library_items',
      'space_rounds','room_candidates','room_votes',
      'room_selections','room_selection_acceptances','room_teleparty_sessions',
      'space_bans','room_messages'
    )) into v_ok;
  if not v_ok then raise exception 'ASSERTION FAILED: butun tablolarda RLS acik olmali'; end if;

  -- Abonelik kesişimi: iki sütun ve doğrulama fonksiyonu
  select (select count(*) from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        (c.relname = 'participants' and a.attname = 'subscriptions')
        or (c.relname = 'space_rounds' and a.attname = 'provider_keys')
      )
      and not a.attisdropped) = 2 into v_ok;
  if not v_ok then raise exception 'ASSERTION FAILED: abonelik sutunlari olusmali'; end if;

  select public.is_valid_subscription_keys(array['netflix'])
     and not public.is_valid_subscription_keys(array[]::text[])
     and not public.is_valid_subscription_keys(array['netflix', 'netflix'])
     and not public.is_valid_subscription_keys(array['NETFLIX'])
     and not public.is_valid_subscription_keys(null) into v_ok;
  if not v_ok then raise exception 'ASSERTION FAILED: abonelik dogrulamasi hatali'; end if;

  -- Eski tur imzası KALDIRILMIS olmali: saglayici kumesiz tur acilamaz.
  select not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'start_next_space_round'
      and pg_get_function_identity_arguments(p.oid)
          = 'uuid, uuid, jsonb, text, text, text, boolean'
  ) into v_ok;
  if not v_ok then raise exception 'ASSERTION FAILED: eski tur imzasi KALDIRILMIS olmali'; end if;

  raise notice 'OK: 00_migration_chain';
end;
$$;
