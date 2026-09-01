-- =============================================================================
-- Ortak yardımcılar ve fixture kurucular
--
-- Bu dosya diğer test dosyalarından ÖNCE çalışır (alfabetik sıra).
-- Yalnızca atılabilir bir test veritabanında çalıştırın.
-- =============================================================================

create schema if not exists wm_test;

-- Assertion --------------------------------------------------------------------

create or replace function wm_test.assert(
  p_condition boolean,
  p_label text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'ASSERTION FAILED: %', p_label;
  end if;
end;
$$;

create or replace function wm_test.assert_raises(
  p_sql text,
  p_expected_message text,
  p_label text
)
returns void
language plpgsql
as $$
declare
  v_message text;
begin
  begin
    execute p_sql;
    raise exception 'ASSERTION FAILED: % — hata bekleniyordu, olmadı', p_label;
  exception
    when others then
      v_message := sqlerrm;
      -- Kendi assertion hatamızı yeniden fırlat.
      if v_message like 'ASSERTION FAILED:%' then
        raise;
      end if;
      if position(p_expected_message in v_message) = 0 then
        raise exception 'ASSERTION FAILED: % — beklenen "%", gelen "%"',
          p_label, p_expected_message, v_message;
      end if;
  end;
end;
$$;

-- Kimlik taklidi ---------------------------------------------------------------
--
-- `auth.uid()` oturum ayarından okur. Testler bunu değiştirerek üye A, üye B ve
-- yabancı kullanıcıyı taklit eder.

create or replace function wm_test.act_as(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  if p_user_id is null then
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
      true
    );
  end if;
end;
$$;

-- Fixture ----------------------------------------------------------------------

create or replace function wm_test.new_user(p_email text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
  values (v_id, p_email)
  on conflict (id) do nothing;
  return v_id;
end;
$$;

/**
 * Testlerin varsayılan ORTAK abonelik kümesi.
 *
 * Tek yerde tanımlıdır: tur açan her çağrı bunu geçer, böylece kesişim kuralı
 * testlerin konusu olmadığında sabit ve görünür kalır.
 */
create or replace function wm_test.provider_keys()
returns text[]
language sql
as $$
  select array['netflix', 'prime_video']::text[];
$$;

/** İki katılımcılı aktif bir oda kurar ve space id döndürür. */
create or replace function wm_test.new_space(p_host uuid, p_guest uuid)
returns uuid
language plpgsql
as $$
declare
  v_space uuid := gen_random_uuid();
begin
  insert into public.spaces (id, status, created_by)
  values (v_space, 'active', p_host);

  -- İki katılımcı da aynı abonelik beyanıyla girer; kesişim = wm_test.provider_keys().
  insert into public.participants (space_id, user_id, role, subscriptions)
  values
    (v_space, p_host, 'host', wm_test.provider_keys()),
    (v_space, p_guest, 'guest', wm_test.provider_keys());

  return v_space;
end;
$$;

/** `p_count` adet benzersiz, geçerli aday üretir. */
create or replace function wm_test.candidate_pool(
  p_count integer,
  p_first_id integer default 900000
)
returns jsonb
language sql
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tmdbMovieId', p_first_id + g,
    'title', 'Test Film ' || g,
    'originalTitle', null,
    'posterPath', '/test' || g || '.jpg',
    'overview', 'Test',
    'releaseYear', '2020',
    'voteAverage', '7.5'
  )), '[]'::jsonb)
  from generate_series(0, p_count - 1) as g;
$$;

/** Yeterince uzun, geçerli bir seed üretir. */
create or replace function wm_test.seed()
returns text
language sql
as $$
  select replace(gen_random_uuid()::text, '-', '') ;
$$;
