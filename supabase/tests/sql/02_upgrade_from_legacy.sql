-- =============================================================================
-- Mevcut (legacy) veriye sahip bir veritabanının yükseltilmesi
--
-- Bu dosya `public` şemasını sıfırlar, önce YALNIZCA legacy migration'ları
-- uygular, tek turluk şemaya gerçek veri yazar, sonra yeniden kullanılabilir
-- oda migration'ını uygular ve geçmişin KORUNDUĞUNU doğrular.
--
-- ⚠️ Yalnızca atılabilir bir test veritabanında çalıştırın.
-- =============================================================================

drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;

-- auth şeması ve roller 00_migration_chain.sql tarafından zaten kurulmuştur.
truncate auth.users cascade;

-- --- Legacy durum (yeniden kullanılabilir oda migration'ı OLMADAN) -----------
\i :MIGRATIONS_DIR/20260811000100_rooms_schema.sql
\i :MIGRATIONS_DIR/20260811000200_rooms_rls.sql
\i :MIGRATIONS_DIR/20260811000300_rooms_functions.sql
\i :MIGRATIONS_DIR/20260812000100_profiles_and_library.sql
\i :MIGRATIONS_DIR/20260812000200_room_rounds_votes_and_wheel.sql

do $$
declare
  v_ok boolean;
begin
  select exists (
    select 1 from pg_constraint where conname = 'space_rounds_space_id_key'
  ) into v_ok;
  if not v_ok then
    raise exception 'ASSERTION FAILED: legacy durumda tek-tur kisiti BULUNMALI';
  end if;
end;
$$;

-- --- Legacy veri -------------------------------------------------------------
create table wm_legacy_fixture (
  space_id     uuid primary key,
  round_id     uuid not null,
  candidate_id uuid not null,
  host_id      uuid not null,
  guest_id     uuid not null
);

do $$
declare
  v_host  uuid := gen_random_uuid();
  v_guest uuid := gen_random_uuid();
  v_space uuid := gen_random_uuid();
  v_round uuid := gen_random_uuid();
  v_cand  uuid;
begin
  insert into auth.users (id, email)
  values (v_host, 'legacy-host@test.invalid'), (v_guest, 'legacy-guest@test.invalid');

  insert into public.spaces (id, status, created_by) values (v_space, 'active', v_host);
  insert into public.participants (space_id, user_id, role)
  values (v_space, v_host, 'host'), (v_space, v_guest, 'guest');

  insert into public.space_rounds (id, space_id, status)
  values (v_round, v_space, 'result');

  insert into public.room_candidates
    (round_id, position, tmdb_movie_id, title, poster_path)
  select v_round, g, 400000 + g, 'Legacy Film ' || g, '/legacy' || g || '.jpg'
  from generate_series(1, 10) as g;

  select id into v_cand
  from public.room_candidates where round_id = v_round order by position limit 1;

  insert into public.room_votes (round_id, candidate_id, user_id, choice)
  values (v_round, v_cand, v_host, 'like'), (v_round, v_cand, v_guest, 'like');

  update public.space_rounds
  set winner_candidate_id = v_cand, spin_started_at = now()
  where id = v_round;

  insert into wm_legacy_fixture values (v_space, v_round, v_cand, v_host, v_guest);
end;
$$;

-- --- Yükseltme ---------------------------------------------------------------
\i :MIGRATIONS_DIR/20260813000100_reusable_rounds.sql
\i :MIGRATIONS_DIR/20260814000100_room_subscriptions.sql
\i :MIGRATIONS_DIR/20260901000100_teleparty_bridge.sql
\i :MIGRATIONS_DIR/20260902000100_public_multi_rooms.sql

do $$
declare
  f record;
  v_new_round uuid;
begin
  select * into f from wm_legacy_fixture;

  -------------------------------------------------------------------------
  -- Geçmiş korunmalı
  -------------------------------------------------------------------------
  perform wm_test.assert(
    exists (select 1 from public.space_rounds where id = f.round_id),
    'legacy tur yukseltmeden sonra KORUNMALI'
  );
  perform wm_test.assert(
    (select count(*) from public.room_candidates where round_id = f.round_id) = 10,
    'legacy adaylar KORUNMALI'
  );
  perform wm_test.assert(
    (select count(*) from public.room_votes where round_id = f.round_id) = 2,
    'legacy oylar KORUNMALI'
  );
  perform wm_test.assert(
    (select winner_candidate_id from public.space_rounds where id = f.round_id)
      = f.candidate_id,
    'legacy kazanan KORUNMALI'
  );

  -------------------------------------------------------------------------
  -- Geriye dönük doldurulan alanlar
  -------------------------------------------------------------------------
  perform wm_test.assert(
    (select round_number from public.space_rounds where id = f.round_id) is not null,
    'legacy tura round_number ATANMALI'
  );
  perform wm_test.assert(
    (select selection_policy_version from public.space_rounds where id = f.round_id)
      is not null,
    'legacy tura policy surumu ATANMALI'
  );
  perform wm_test.assert(
    not exists (
      select 1 from public.room_candidates
      where round_id = f.round_id and selection_reason is null
    ),
    'legacy adaylara selection_reason ATANMALI'
  );

  -------------------------------------------------------------------------
  -- RR-03: legacy tur oluşturma yolu KAPALI olmalı
  -------------------------------------------------------------------------
  perform wm_test.act_as(f.host_id);
  perform wm_test.assert_raises(
    format(
      'select public.create_or_reset_space_round(%L::uuid, %L::jsonb, true)',
      f.space_id, '[]'
    ),
    'round_creation_moved',
    'legacy tur olusturma yolu KAPALI olmali'
  );

  -------------------------------------------------------------------------
  -- Yükseltmeden sonra yeni tur açılabilmeli (legacy tur terminal)
  -------------------------------------------------------------------------
  perform wm_test.act_as(null);
  update public.space_rounds set status = 'no_match' where id = f.round_id;

  v_new_round := public.start_next_space_round(
    f.space_id, f.host_id, wm_test.candidate_pool(30, 100000), wm_test.seed(),
    'reusable-room-v1', 'seeded-random-v1', false,
    wm_test.provider_keys()
  );

  perform wm_test.assert(v_new_round <> f.round_id, 'yukseltmeden sonra YENI tur acilmali');
  perform wm_test.assert(
    exists (select 1 from public.space_rounds where id = f.round_id),
    'yeni tur acilinca legacy tur SILINMEMELI'
  );

  -- Legacy filmler tam geçmiş sayılmalı: tekrar kapısı kapalıyken gelmemeli.
  perform wm_test.assert(
    not exists (
      select 1 from public.room_candidates
      where round_id = v_new_round and tmdb_movie_id between 400001 and 400010
    ),
    'legacy filmler TAM GECMIS sayilmali (RR-01)'
  );

  raise notice 'OK: 02_upgrade_from_legacy';
end;
$$;

drop table wm_legacy_fixture;

-- Sonraki dosyalar temiz bir zincir bekliyor: şemayı sıfırdan yeniden kur.
drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
truncate auth.users cascade;

\i :MIGRATIONS_DIR/20260811000100_rooms_schema.sql
\i :MIGRATIONS_DIR/20260811000200_rooms_rls.sql
\i :MIGRATIONS_DIR/20260811000300_rooms_functions.sql
\i :MIGRATIONS_DIR/20260812000100_profiles_and_library.sql
\i :MIGRATIONS_DIR/20260812000200_room_rounds_votes_and_wheel.sql
\i :MIGRATIONS_DIR/20260813000100_reusable_rounds.sql
\i :MIGRATIONS_DIR/20260814000100_room_subscriptions.sql
\i :MIGRATIONS_DIR/20260901000100_teleparty_bridge.sql
\i :MIGRATIONS_DIR/20260902000100_public_multi_rooms.sql
