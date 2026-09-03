-- =============================================================================
-- WatchMuse — oda bazlı film seçme yöntemi ve belirlenmiş film oturumları
-- =============================================================================

alter table public.spaces
  add column if not exists selection_mode text not null default 'wheel';

alter table public.spaces
  drop constraint if exists spaces_selection_mode_valid,
  add constraint spaces_selection_mode_valid
    check (selection_mode in ('wheel', 'direct'));

comment on column public.spaces.selection_mode is
  'wheel: gizli oy + ortak çark; direct: hostun belirlediği film oturumu.';

-- Tek adaylı direct sonuç turu da aynı seçim/kabul/Teleparty zincirini kullanır.
alter table public.space_rounds
  drop constraint if exists space_rounds_candidate_count_check,
  drop constraint if exists space_rounds_candidate_count_valid,
  add constraint space_rounds_candidate_count_valid
    check (candidate_count between 1 and 10);

alter table public.room_candidates
  drop constraint if exists room_candidates_selection_reason_allowed,
  add constraint room_candidates_selection_reason_allowed check (
    selection_reason in (
      'priority_return', 'fresh_discovery', 'eligible_repeat', 'backfill',
      'direct_choice'
    )
  );

-- Oda oluşturma işlemi seçim yöntemini aynı transaction içinde kaydeder.
-- Altı parametreli önceki fonksiyon kısa dağıtım geçişinde wheel varsayılanıyla
-- çalışmaya devam eder; yeni istemci yedi parametreli imzayı çağırır.
create or replace function public.create_space(
  p_token_hash text,
  p_subscriptions text[],
  p_visibility text,
  p_name text,
  p_capacity integer,
  p_password_hash text,
  p_selection_mode text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_space_id uuid;
  v_display_name text;
  v_is_anonymous boolean;
  c_invitation_ttl constant interval := interval '24 hours';
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_token_hash' using errcode = '22023';
  end if;
  if p_subscriptions is null
     or coalesce(pg_catalog.array_length(p_subscriptions, 1), 0) = 0 then
    raise exception 'subscriptions_required' using errcode = '22023';
  end if;
  if not public.is_valid_subscription_keys(p_subscriptions) then
    raise exception 'invalid_subscriptions' using errcode = '22023';
  end if;
  if p_visibility not in ('private', 'public')
     or p_selection_mode not in ('wheel', 'direct')
     or p_capacity not between 2 and 20
     or p_name is null
     or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 80 then
    raise exception 'invalid_room_settings' using errcode = '22023';
  end if;
  if p_visibility = 'private'
     and (p_password_hash is null or p_password_hash !~ '^scrypt[$][A-Za-z0-9_-]{22}[$][A-Za-z0-9_-]{43}$') then
    raise exception 'room_password_required' using errcode = '22023';
  end if;
  if p_visibility = 'public' and p_password_hash is not null then
    raise exception 'invalid_room_settings' using errcode = '22023';
  end if;

  select coalesce(u.is_anonymous, true) into v_is_anonymous
  from auth.users u where u.id = v_user_id;
  if p_visibility = 'public' and v_is_anonymous then
    raise exception 'registration_required' using errcode = '42501';
  end if;

  select nullif(pg_catalog.btrim(p.display_name), '') into v_display_name
  from public.profiles p where p.id = v_user_id;
  v_display_name := coalesce(
    v_display_name,
    case when v_is_anonymous then 'Anonim oda sahibi' else 'WatchMuse üyesi' end
  );

  insert into public.spaces (
    status, created_by, name, visibility, capacity, selection_mode
  ) values (
    'active'::public.space_status,
    v_user_id,
    pg_catalog.btrim(p_name),
    p_visibility,
    p_capacity,
    p_selection_mode
  ) returning id into v_space_id;

  insert into public.participants (
    space_id, user_id, role, display_name, subscriptions
  ) values (
    v_space_id, v_user_id, 'host'::public.participant_role,
    v_display_name, p_subscriptions
  );

  insert into public.invitations (space_id, token_hash, expires_at, created_by)
  values (v_space_id, p_token_hash, now() + c_invitation_ttl, v_user_id);

  if p_visibility = 'private' then
    insert into public.space_passwords (space_id, password_hash)
    values (v_space_id, p_password_hash);
  end if;

  return v_space_id;
end;
$$;

revoke all on function
  public.create_space(text, text[], text, text, integer, text, text)
  from public, anon;
grant execute on function
  public.create_space(text, text[], text, text, integer, text, text)
  to authenticated;

-- Oda listesi seçim yöntemini gösterir; hassas alan döndürmez.
drop function if exists public.list_discoverable_spaces();

create or replace function public.list_discoverable_spaces()
returns table (
  space_id uuid,
  name text,
  visibility text,
  selection_mode text,
  capacity integer,
  participant_count integer,
  host_display_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.name,
    s.visibility,
    s.selection_mode,
    s.capacity,
    count(p.id)::integer,
    coalesce(
      max(p.display_name) filter (where p.role = 'host'::public.participant_role),
      'Oda sahibi'
    ),
    s.created_at
  from public.spaces s
  join public.participants p on p.space_id = s.id
  where (select auth.uid()) is not null
    and s.status = 'active'::public.space_status
    and (
      s.visibility = 'public'
      or (
        s.visibility = 'private'
        and exists (
          select 1 from public.space_passwords secret
          where secret.space_id = s.id
        )
      )
    )
  group by
    s.id, s.name, s.visibility, s.selection_mode, s.capacity, s.created_at
  having count(p.id) < s.capacity
  order by s.created_at desc
  limit 100
$$;

revoke all on function public.list_discoverable_spaces() from public, anon;
grant execute on function public.list_discoverable_spaces() to authenticated;

-- Güvenilen sunucu, TMDb'den tekrar doğruladığı filmi tek adaylı terminal tur
-- olarak yazar. Böylece mevcut kabul, kütüphane ve Teleparty sistemi değişmez.
create or replace function public.start_direct_space_selection(
  p_space_id uuid,
  p_actor_id uuid,
  p_movie jsonb,
  p_provider_keys text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space public.spaces%rowtype;
  v_round_id uuid;
  v_candidate_id uuid;
  v_selection_id uuid;
  v_round_number integer;
  v_selected_at timestamptz;
  v_movie_id integer;
  v_title text;
  v_original_title text;
  v_poster_path text;
  v_overview text;
  v_release_year smallint;
  v_vote_average numeric(3,1);
begin
  if p_actor_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select * into v_space
  from public.spaces s
  where s.id = p_space_id
  for update;

  if not found or v_space.status <> 'active'::public.space_status then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;
  if v_space.selection_mode <> 'direct' then
    raise exception 'selection_mode_mismatch' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.participants p
    where p.space_id = p_space_id
      and p.user_id = p_actor_id
      and p.role = 'host'::public.participant_role
  ) then
    raise exception 'host_required' using errcode = '42501';
  end if;
  if (select count(*) from public.participants p where p.space_id = p_space_id) < 2 then
    raise exception 'round_not_ready' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.space_rounds r
    where r.space_id = p_space_id
      and r.status in (
        'voting'::public.space_round_status,
        'matching'::public.space_round_status,
        'spinning'::public.space_round_status
      )
  ) then
    raise exception 'room_locked' using errcode = 'P0001';
  end if;

  if p_provider_keys is null
     or coalesce(pg_catalog.array_length(p_provider_keys, 1), 0) = 0
     or not public.is_valid_subscription_keys(p_provider_keys) then
    raise exception 'movie_not_on_shared_provider' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.participants p
    where p.space_id = p_space_id
      and not (p_provider_keys <@ p.subscriptions)
  ) then
    raise exception 'movie_not_on_shared_provider' using errcode = 'P0001';
  end if;

  if p_movie is null
     or jsonb_typeof(p_movie) <> 'object'
     or coalesce(p_movie ->> 'tmdbMovieId', '') !~ '^[1-9][0-9]{0,8}$'
     or nullif(pg_catalog.btrim(coalesce(p_movie ->> 'title', '')), '') is null
     or pg_catalog.char_length(pg_catalog.btrim(p_movie ->> 'title')) > 300
     or pg_catalog.char_length(coalesce(p_movie ->> 'originalTitle', '')) > 300
     or pg_catalog.char_length(coalesce(p_movie ->> 'overview', '')) > 5000
     or (
       nullif(pg_catalog.btrim(coalesce(p_movie ->> 'posterPath', '')), '') is not null
       and pg_catalog.btrim(p_movie ->> 'posterPath') !~ '^/[^[:space:]]+$'
     )
     or (
       nullif(p_movie ->> 'releaseYear', '') is not null
       and p_movie ->> 'releaseYear' !~ '^(1[89][0-9]{2}|20[0-9]{2}|21[0-9]{2}|2200)$'
     )
     or (
       nullif(p_movie ->> 'voteAverage', '') is not null
       and p_movie ->> 'voteAverage' !~ '^(10([.]0+)?|[0-9]([.][0-9]+)?)$'
     ) then
    raise exception 'invalid_candidates' using errcode = '22023';
  end if;

  v_movie_id := (p_movie ->> 'tmdbMovieId')::integer;
  v_title := pg_catalog.btrim(p_movie ->> 'title');
  v_original_title := nullif(pg_catalog.btrim(coalesce(p_movie ->> 'originalTitle', '')), '');
  v_poster_path := nullif(pg_catalog.btrim(coalesce(p_movie ->> 'posterPath', '')), '');
  v_overview := nullif(pg_catalog.btrim(coalesce(p_movie ->> 'overview', '')), '');
  v_release_year := nullif(p_movie ->> 'releaseYear', '')::smallint;
  v_vote_average := nullif(p_movie ->> 'voteAverage', '')::numeric(3,1);
  v_selected_at := pg_catalog.clock_timestamp();

  select s.id into v_selection_id
  from public.room_selections s
  where s.space_id = p_space_id
    and s.tmdb_movie_id = v_movie_id
    and s.response_deadline > v_selected_at
  order by s.selected_at desc
  limit 1;
  if found then return v_selection_id; end if;

  select coalesce(max(r.round_number), 0) + 1 into v_round_number
  from public.space_rounds r where r.space_id = p_space_id;

  insert into public.space_rounds (
    space_id, round_number, status, candidate_count, spin_duration_ms,
    selection_seed, selection_policy_version, ranker_version, provider_keys
  ) values (
    p_space_id, v_round_number, 'voting'::public.space_round_status, 1, 3000,
    'direct-' || gen_random_uuid()::text,
    'direct-v1', 'host-choice-v1', p_provider_keys
  ) returning id into v_round_id;

  insert into public.room_candidates (
    round_id, position, tmdb_movie_id, title, original_title, poster_path,
    overview, release_year, tmdb_vote_average, selection_reason
  ) values (
    v_round_id, 1, v_movie_id, v_title, v_original_title, v_poster_path,
    v_overview, v_release_year, v_vote_average, 'direct_choice'
  ) returning id into v_candidate_id;

  update public.space_rounds
  set status = 'result'::public.space_round_status,
      winner_candidate_id = v_candidate_id,
      spin_started_at = v_selected_at
  where id = v_round_id;

  insert into public.room_selections (
    space_id, round_id, candidate_id, tmdb_movie_id,
    selected_at, response_deadline
  ) values (
    p_space_id, v_round_id, v_candidate_id, v_movie_id,
    v_selected_at, v_selected_at + interval '7 days'
  ) returning id into v_selection_id;

  return v_selection_id;
end;
$$;

revoke all on function
  public.start_direct_space_selection(uuid, uuid, jsonb, text[])
  from public, anon, authenticated;
grant execute on function
  public.start_direct_space_selection(uuid, uuid, jsonb, text[])
  to service_role;

comment on function public.start_direct_space_selection(uuid, uuid, jsonb, text[]) is
  'Yalnız service_role. Hostun TMDb üzerinden doğrulanmış filmini direct odada mevcut seçim/kabul/Teleparty zincirine yazar.';
