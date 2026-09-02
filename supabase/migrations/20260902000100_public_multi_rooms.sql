-- =============================================================================
-- WatchMuse — çok katılımcılı private/public karar odaları ve host moderasyonu
-- =============================================================================

alter table public.spaces
  add column if not exists name text not null default 'Özel karar odası',
  add column if not exists visibility text not null default 'private',
  add column if not exists capacity integer not null default 2;

alter table public.spaces
  drop constraint if exists spaces_name_valid,
  add constraint spaces_name_valid
    check (char_length(btrim(name)) between 1 and 80),
  drop constraint if exists spaces_visibility_valid,
  add constraint spaces_visibility_valid
    check (visibility in ('private', 'public')),
  drop constraint if exists spaces_capacity_valid,
  add constraint spaces_capacity_valid check (capacity between 2 and 20);

-- Birden fazla guest artık mümkündür; host yine tek olmalıdır.
alter table public.participants
  drop constraint if exists participants_unique_role_per_space;

create unique index if not exists participants_one_host_per_space
  on public.participants (space_id)
  where role = 'host'::public.participant_role;

create table if not exists public.space_bans (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kicked_by uuid not null references auth.users (id) on delete cascade,
  kicked_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

revoke all on table public.space_bans from public, anon, authenticated;
alter table public.space_bans enable row level security;

-- Yeni oda oluşturma imzası. Public oda oluşturmak kalıcı hesap gerektirir.
create or replace function public.create_space(
  p_token_hash text,
  p_subscriptions text[],
  p_visibility text,
  p_name text,
  p_capacity integer
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
     or p_capacity not between 2 and 20
     or p_name is null
     or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 80 then
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

  insert into public.spaces (status, created_by, name, visibility, capacity)
  values (
    'active'::public.space_status,
    v_user_id,
    pg_catalog.btrim(p_name),
    p_visibility,
    p_capacity
  ) returning id into v_space_id;

  insert into public.participants (
    space_id, user_id, role, display_name, subscriptions
  ) values (
    v_space_id,
    v_user_id,
    'host'::public.participant_role,
    v_display_name,
    p_subscriptions
  );

  insert into public.invitations (space_id, token_hash, expires_at, created_by)
  values (v_space_id, p_token_hash, now() + c_invitation_ttl, v_user_id);

  return v_space_id;
end;
$$;

-- Private davet artık oda kapasitesi dolana kadar tekrar kullanılabilir.
create or replace function public.join_space_with_invitation(
  p_token_hash text,
  p_subscriptions text[]
)
returns table (
  space_id uuid,
  role public.participant_role,
  already_member boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invitation public.invitations%rowtype;
  v_space public.spaces%rowtype;
  v_existing public.participant_role;
  v_participants integer;
  v_display_name text;
  v_is_anonymous boolean;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;
  if p_subscriptions is null
     or coalesce(pg_catalog.array_length(p_subscriptions, 1), 0) = 0 then
    raise exception 'subscriptions_required' using errcode = '22023';
  end if;
  if not public.is_valid_subscription_keys(p_subscriptions) then
    raise exception 'invalid_subscriptions' using errcode = '22023';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.token_hash = p_token_hash
  for update;
  if not found or v_invitation.expires_at <= now() then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  select * into v_space
  from public.spaces s
  where s.id = v_invitation.space_id
  for update;
  if not found then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;
  if v_space.status <> 'active'::public.space_status then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.space_bans b
    where b.space_id = v_space.id and b.user_id = v_user_id
  ) then
    raise exception 'participant_banned' using errcode = '42501';
  end if;

  select p.role into v_existing
  from public.participants p
  where p.space_id = v_space.id and p.user_id = v_user_id;
  if found then
    if v_existing = 'host'::public.participant_role then
      raise exception 'host_cannot_join' using errcode = 'P0001';
    end if;
    update public.participants p
    set subscriptions = p_subscriptions
    where p.space_id = v_space.id and p.user_id = v_user_id;
    space_id := v_space.id;
    role := v_existing;
    already_member := true;
    return next;
    return;
  end if;

  if exists (
    select 1 from public.space_rounds r
    where r.space_id = v_space.id
      and r.status in (
        'voting'::public.space_round_status,
        'matching'::public.space_round_status,
        'spinning'::public.space_round_status
      )
  ) then
    raise exception 'room_locked' using errcode = 'P0001';
  end if;

  select count(*) into v_participants
  from public.participants p where p.space_id = v_space.id;
  if v_participants >= v_space.capacity then
    raise exception 'room_full' using errcode = 'P0001';
  end if;

  select coalesce(u.is_anonymous, true) into v_is_anonymous
  from auth.users u where u.id = v_user_id;
  select nullif(pg_catalog.btrim(p.display_name), '') into v_display_name
  from public.profiles p where p.id = v_user_id;
  v_display_name := coalesce(
    v_display_name,
    case when v_is_anonymous then 'Anonim misafir' else 'WatchMuse üyesi' end
  );

  insert into public.participants (
    space_id, user_id, role, display_name, subscriptions
  ) values (
    v_space.id,
    v_user_id,
    'guest'::public.participant_role,
    v_display_name,
    p_subscriptions
  );

  space_id := v_space.id;
  role := 'guest'::public.participant_role;
  already_member := false;
  return next;
end;
$$;

-- Public vitrin yalnızca güvenli özet alanlarını döndürür.
create or replace function public.list_public_spaces()
returns table (
  space_id uuid,
  name text,
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
    and s.visibility = 'public'
    and s.status = 'active'::public.space_status
  group by s.id, s.name, s.capacity, s.created_at
  having count(p.id) < s.capacity
  order by s.created_at desc
  limit 100
$$;

-- Public katılımda davet yoktur; kalıcı hesap, kapasite ve ban DB'de doğrulanır.
create or replace function public.join_public_space(
  p_space_id uuid,
  p_subscriptions text[]
)
returns table (
  space_id uuid,
  role public.participant_role,
  already_member boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_space public.spaces%rowtype;
  v_existing public.participant_role;
  v_participants integer;
  v_display_name text;
  v_is_anonymous boolean;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous
  from auth.users u where u.id = v_user_id;
  if v_is_anonymous then
    raise exception 'registration_required' using errcode = '42501';
  end if;
  if p_subscriptions is null
     or coalesce(pg_catalog.array_length(p_subscriptions, 1), 0) = 0 then
    raise exception 'subscriptions_required' using errcode = '22023';
  end if;
  if not public.is_valid_subscription_keys(p_subscriptions) then
    raise exception 'invalid_subscriptions' using errcode = '22023';
  end if;

  select * into v_space
  from public.spaces s where s.id = p_space_id
  for update;
  if not found or v_space.visibility <> 'public' then
    raise exception 'public_room_required' using errcode = 'P0001';
  end if;
  if v_space.status <> 'active'::public.space_status then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.space_bans b
    where b.space_id = p_space_id and b.user_id = v_user_id
  ) then
    raise exception 'participant_banned' using errcode = '42501';
  end if;

  select p.role into v_existing
  from public.participants p
  where p.space_id = p_space_id and p.user_id = v_user_id;
  if found then
    update public.participants p
    set subscriptions = p_subscriptions
    where p.space_id = p_space_id and p.user_id = v_user_id;
    space_id := p_space_id;
    role := v_existing;
    already_member := true;
    return next;
    return;
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
  select count(*) into v_participants
  from public.participants p where p.space_id = p_space_id;
  if v_participants >= v_space.capacity then
    raise exception 'room_full' using errcode = 'P0001';
  end if;

  select nullif(pg_catalog.btrim(p.display_name), '') into v_display_name
  from public.profiles p where p.id = v_user_id;
  insert into public.participants (
    space_id, user_id, role, display_name, subscriptions
  ) values (
    p_space_id,
    v_user_id,
    'guest'::public.participant_role,
    coalesce(v_display_name, 'WatchMuse üyesi'),
    p_subscriptions
  );

  space_id := p_space_id;
  role := 'guest'::public.participant_role;
  already_member := false;
  return next;
end;
$$;

create or replace function public.kick_space_participant(
  p_space_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  perform 1 from public.spaces s where s.id = p_space_id for update;
  if not found then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.participants p
    where p.space_id = p_space_id
      and p.user_id = v_user_id
      and p.role = 'host'::public.participant_role
  ) then
    raise exception 'host_required' using errcode = '42501';
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
  if not exists (
    select 1 from public.participants p
    where p.space_id = p_space_id
      and p.user_id = p_target_user_id
      and p.role <> 'host'::public.participant_role
  ) then
    raise exception 'participant_not_found' using errcode = 'P0001';
  end if;

  insert into public.space_bans (space_id, user_id, kicked_by)
  values (p_space_id, p_target_user_id, v_user_id)
  on conflict (space_id, user_id) do update
  set kicked_by = excluded.kicked_by, kicked_at = now();

  delete from public.participants p
  where p.space_id = p_space_id and p.user_id = p_target_user_id;
end;
$$;

-- Hard suppression'daki "herkes skip" kuralını da mevcut katılımcı sayısına
-- bağla; iki kişilik odaların davranışı aynen korunur.
create or replace function public.is_movie_hard_suppressed(
  p_space_id uuid,
  p_tmdb_movie_id integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.room_selections s
      where s.space_id = p_space_id
        and s.tmdb_movie_id = p_tmdb_movie_id
        and (
          s.accepted_at is not null
          or s.response_deadline > pg_catalog.clock_timestamp()
        )
    )
    or exists (
      select 1
      from public.space_rounds sr
      join public.room_candidates sc on sc.round_id = sr.id
      where sr.space_id = p_space_id
        and sc.tmdb_movie_id = p_tmdb_movie_id
        and sr.status in (
          'result'::public.space_round_status,
          'no_match'::public.space_round_status
        )
        and (
          select count(*) from public.room_votes sv
          where sv.round_id = sr.id and sv.candidate_id = sc.id
            and sv.choice = 'skip'::public.space_round_vote
        ) = (
          select count(*) from public.participants current_member
          where current_member.space_id = p_space_id
        )
        and (
          select max(sv.updated_at) from public.room_votes sv
          where sv.round_id = sr.id and sv.candidate_id = sc.id
            and sv.choice = 'skip'::public.space_round_vote
        ) > pg_catalog.clock_timestamp() - interval '30 days'
    );
$$;

revoke all on function public.is_movie_hard_suppressed(uuid, integer)
  from public, anon, authenticated;

-- Önceki seçim fonksiyonu iki kişiyi sabit kabul ediyordu. Gövdenin yalnız bu
-- iki eski sabitini migration-time dönüştürür; eşleşme artık mevcut katılımcı
-- sayısını kullanır. Beklenen kalıplar yoksa migration sessizce ilerlemez.
do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.start_next_space_round(uuid,uuid,jsonb,text,text,text,boolean,text[])'::regprocedure
  ) into v_definition;

  v_updated := pg_catalog.replace(
    v_definition,
    'if (select count(*) from public.participants p where p.space_id = p_space_id) <> 2 then',
    'if (select count(*) from public.participants p where p.space_id = p_space_id) < 2 then'
  );
  if v_updated = v_definition then
    raise exception 'multi_room_round_guard_patch_failed';
  end if;
  v_definition := v_updated;

  v_updated := pg_catalog.replace(
    v_definition,
    ') = 2
      order by c.tmdb_movie_id, r.round_number desc',
    ') = (select count(*) from public.participants current_member where current_member.space_id = p_space_id)
      order by c.tmdb_movie_id, r.round_number desc'
  );
  if v_updated = v_definition then
    raise exception 'multi_room_history_match_patch_failed';
  end if;
  execute v_updated;
end
$migration$;

-- Teleparty hazır olma kapısı artık iki sabiti yerine odadaki herkesin kabulünü
-- ister; istemci sözleşmesini bozmamak için JSON alan adı korunur.
create or replace function public.get_space_teleparty_state(p_space_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_states jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.participants p
    where p.space_id = p_space_id and p.user_id = v_user_id
  ) then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'selectionId', s.id,
    'bothAccepted', readiness.all_accepted,
    'joinUrl', case when readiness.all_accepted then tp.join_url else null end
  ) order by s.selected_at desc), '[]'::jsonb)
  into v_states
  from public.room_selections s
  join public.space_rounds r on r.id = s.round_id
  left join public.room_teleparty_sessions tp on tp.selection_id = s.id
  cross join lateral (
    select (
      (select count(*) from public.participants p
       where p.space_id = p_space_id) >= 2
      and exists (
        select 1 from public.room_selection_acceptances mine
        where mine.selection_id = s.id and mine.user_id = v_user_id
      )
      and (
        select count(distinct accepted.user_id)
        from public.room_selection_acceptances accepted
        join public.participants member
          on member.space_id = p_space_id
         and member.user_id = accepted.user_id
        where accepted.selection_id = s.id
      ) = (
        select count(*) from public.participants p where p.space_id = p_space_id
      )
    ) as all_accepted
  ) readiness
  where s.space_id = p_space_id
    and s.response_deadline > clock_timestamp()
    and r.status = 'result'::public.space_round_status;

  return v_states;
end;
$$;

create or replace function public.share_room_teleparty_link(
  p_space_id uuid,
  p_selection_id uuid,
  p_join_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_selection public.room_selections%rowtype;
  v_participant_count integer;
  v_acceptance_count integer;
  v_now timestamptz;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.participants p
    where p.space_id = p_space_id and p.user_id = v_user_id
  ) then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.participants p
    where p.space_id = p_space_id
      and p.user_id = v_user_id
      and p.role = 'host'::public.participant_role
  ) then
    raise exception 'host_required' using errcode = '42501';
  end if;
  if p_join_url is null
     or char_length(p_join_url) not between 52 and 256
     or p_join_url !~ '^https://redirect[.]teleparty[.]com/join/[A-Za-z0-9_-]{16,128}$' then
    raise exception 'invalid_teleparty_link' using errcode = '22023';
  end if;

  perform 1 from public.spaces s where s.id = p_space_id for update;
  v_now := clock_timestamp();
  select * into v_selection
  from public.room_selections s
  where s.id = p_selection_id and s.space_id = p_space_id;
  if not found then
    raise exception 'invalid_selection' using errcode = 'P0001';
  end if;
  if v_selection.response_deadline <= v_now then
    raise exception 'selection_expired' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.space_rounds r
    where r.id = v_selection.round_id
      and r.space_id = p_space_id
      and r.status = 'result'::public.space_round_status
  ) then
    raise exception 'invalid_selection' using errcode = 'P0001';
  end if;

  select count(*) into v_participant_count
  from public.participants p where p.space_id = p_space_id;
  select count(distinct accepted.user_id) into v_acceptance_count
  from public.room_selection_acceptances accepted
  join public.participants member
    on member.space_id = p_space_id and member.user_id = accepted.user_id
  where accepted.selection_id = p_selection_id;
  if v_participant_count < 2 or v_acceptance_count <> v_participant_count then
    raise exception 'teleparty_not_ready' using errcode = 'P0001';
  end if;

  insert into public.room_teleparty_sessions (
    selection_id, join_url, shared_by, shared_at, updated_at
  ) values (
    p_selection_id, p_join_url, v_user_id, v_now, v_now
  )
  on conflict (selection_id) do update
  set join_url = excluded.join_url,
      shared_by = excluded.shared_by,
      shared_at = excluded.shared_at,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.create_space(text, text[], text, text, integer)
  from public, anon;
revoke all on function public.list_public_spaces() from public, anon;
revoke all on function public.join_public_space(uuid, text[]) from public, anon;
revoke all on function public.kick_space_participant(uuid, uuid) from public, anon;

grant execute on function public.create_space(text, text[], text, text, integer)
  to authenticated;
grant execute on function public.list_public_spaces() to authenticated;
grant execute on function public.join_public_space(uuid, text[]) to authenticated;
grant execute on function public.kick_space_participant(uuid, uuid) to authenticated;

comment on function public.list_public_spaces() is
  'Hassas davet veya user_id döndürmeden açık public odaları listeler.';
comment on function public.join_public_space(uuid, text[]) is
  'Yalnız kalıcı hesapları davetsiz public odaya kapasite, ban ve aktif tur kontrolleriyle ekler.';
comment on function public.kick_space_participant(uuid, uuid) is
  'Yalnız hostun guest katılımcıyı çıkarmasına ve aynı odaya yeniden girişini engellemesine izin verir.';
