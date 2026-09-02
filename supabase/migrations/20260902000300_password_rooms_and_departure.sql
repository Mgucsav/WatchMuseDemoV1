-- =============================================================================
-- WatchMuse — listelenen şifreli private odalar, çıkış ve oda kapatma
-- =============================================================================

-- Şifre özeti spaces üzerinde tutulmaz: oda üyelerinin spaces SELECT yetkisi
-- vardır. Bu tabloya istemci rollerinin hiçbir doğrudan erişimi yoktur.
create table if not exists public.space_passwords (
  space_id uuid primary key references public.spaces (id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now(),
  constraint space_passwords_hash_valid check (
    password_hash ~ '^scrypt[$][A-Za-z0-9_-]{22}[$][A-Za-z0-9_-]{43}$'
  )
);

revoke all on table public.space_passwords from public, anon, authenticated;
alter table public.space_passwords enable row level security;

-- Yeni imza private oda için sunucuda üretilmiş scrypt özetini zorunlu kılar.
create or replace function public.create_space(
  p_token_hash text,
  p_subscriptions text[],
  p_visibility text,
  p_name text,
  p_capacity integer,
  p_password_hash text
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

-- Eski beş parametreli oluşturma yolunu kapat; yeni private odalar şifresiz
-- üretilemesin. Yeni uygulama yalnız altı parametreli imzayı kullanır.
revoke all on function public.create_space(text, text[], text, text, integer)
  from public, anon, authenticated;
revoke all on function public.create_space(text, text[], text, text, integer, text)
  from public, anon;
grant execute on function public.create_space(text, text[], text, text, integer, text)
  to authenticated;

-- Public odalar ile yalnız şifre özeti bulunan yeni private odaları aynı güvenli
-- vitrinde gösterir. Hash, token ve user_id dönmez.
create or replace function public.list_discoverable_spaces()
returns table (
  space_id uuid,
  name text,
  visibility text,
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
  group by s.id, s.name, s.visibility, s.capacity, s.created_at
  having count(p.id) < s.capacity
  order by s.created_at desc
  limit 100
$$;

revoke all on function public.list_discoverable_spaces() from public, anon;
grant execute on function public.list_discoverable_spaces() to authenticated;

-- Şifre doğrulandıktan sonra yalnız service_role tarafından çağrılır. Aktör
-- kimliği önce Vercel sunucusunda doğrulanır; bu fonksiyon ayrıca auth.users
-- kaydını ve bütün oda kurallarını yeniden kontrol eder.
create or replace function public.join_private_space_as_actor(
  p_space_id uuid,
  p_actor_id uuid,
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
  v_space public.spaces%rowtype;
  v_existing public.participant_role;
  v_participants integer;
  v_display_name text;
  v_is_anonymous boolean;
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users u where u.id = p_actor_id
  ) then
    raise exception 'unauthenticated' using errcode = '28000';
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
  if not found or v_space.visibility <> 'private' or not exists (
    select 1 from public.space_passwords secret where secret.space_id = p_space_id
  ) then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;
  if v_space.status <> 'active'::public.space_status then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.space_bans b
    where b.space_id = p_space_id and b.user_id = p_actor_id
  ) then
    raise exception 'participant_banned' using errcode = '42501';
  end if;

  select p.role into v_existing
  from public.participants p
  where p.space_id = p_space_id and p.user_id = p_actor_id;
  if found then
    update public.participants p set subscriptions = p_subscriptions
    where p.space_id = p_space_id and p.user_id = p_actor_id;
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

  select coalesce(u.is_anonymous, true) into v_is_anonymous
  from auth.users u where u.id = p_actor_id;
  select nullif(pg_catalog.btrim(p.display_name), '') into v_display_name
  from public.profiles p where p.id = p_actor_id;
  v_display_name := coalesce(
    v_display_name,
    case when v_is_anonymous then 'Anonim misafir' else 'WatchMuse üyesi' end
  );

  insert into public.participants (
    space_id, user_id, role, display_name, subscriptions
  ) values (
    p_space_id, p_actor_id, 'guest'::public.participant_role,
    v_display_name, p_subscriptions
  );

  space_id := p_space_id;
  role := 'guest'::public.participant_role;
  already_member := false;
  return next;
end;
$$;

revoke all on function public.join_private_space_as_actor(uuid, uuid, text[])
  from public, anon, authenticated;
grant execute on function public.join_private_space_as_actor(uuid, uuid, text[])
  to service_role;

-- Listelenen şifreli private odalar davet tokenıyla şifre kontrolünü atlayamaz.
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

  select * into v_invitation from public.invitations i
  where i.token_hash = p_token_hash for update;
  if not found or v_invitation.expires_at <= now() then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.space_passwords secret
    where secret.space_id = v_invitation.space_id
  ) then
    raise exception 'private_password_required' using errcode = '42501';
  end if;

  select * into v_space from public.spaces s
  where s.id = v_invitation.space_id for update;
  if not found then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;
  if v_space.status <> 'active'::public.space_status then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.space_bans b
    where b.space_id = v_space.id and b.user_id = v_user_id) then
    raise exception 'participant_banned' using errcode = '42501';
  end if;
  select p.role into v_existing from public.participants p
  where p.space_id = v_space.id and p.user_id = v_user_id;
  if found then
    if v_existing = 'host'::public.participant_role then
      raise exception 'host_cannot_join' using errcode = 'P0001';
    end if;
    update public.participants p set subscriptions = p_subscriptions
    where p.space_id = v_space.id and p.user_id = v_user_id;
    space_id := v_space.id; role := v_existing; already_member := true;
    return next; return;
  end if;
  if exists (select 1 from public.space_rounds r where r.space_id = v_space.id
    and r.status in ('voting'::public.space_round_status,
      'matching'::public.space_round_status, 'spinning'::public.space_round_status)) then
    raise exception 'room_locked' using errcode = 'P0001';
  end if;
  select count(*) into v_participants from public.participants p
  where p.space_id = v_space.id;
  if v_participants >= v_space.capacity then raise exception 'room_full' using errcode = 'P0001'; end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous
  from auth.users u where u.id = v_user_id;
  select nullif(pg_catalog.btrim(p.display_name), '') into v_display_name
  from public.profiles p where p.id = v_user_id;
  v_display_name := coalesce(v_display_name,
    case when v_is_anonymous then 'Anonim misafir' else 'WatchMuse üyesi' end);
  insert into public.participants (space_id, user_id, role, display_name, subscriptions)
  values (v_space.id, v_user_id, 'guest'::public.participant_role, v_display_name, p_subscriptions);
  space_id := v_space.id; role := 'guest'::public.participant_role; already_member := false;
  return next;
end;
$$;

-- Katılımcı değişirken açık karar turu no_match yapılır; aksi halde kalan üyeler
-- artık tamamlanamayacak bir turda kilitli kalır.
create or replace function public.leave_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_role public.participant_role;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform 1 from public.spaces s where s.id = p_space_id for update;
  if not found then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;
  select p.role into v_role from public.participants p
  where p.space_id = p_space_id and p.user_id = v_user_id;
  if not found then raise exception 'participant_not_found' using errcode = 'P0001'; end if;
  if v_role = 'host'::public.participant_role then
    raise exception 'guest_required' using errcode = '42501';
  end if;
  update public.space_rounds r set status = 'no_match'::public.space_round_status
  where r.space_id = p_space_id and r.status in (
    'voting'::public.space_round_status,
    'matching'::public.space_round_status,
    'spinning'::public.space_round_status
  );
  delete from public.participants p
  where p.space_id = p_space_id and p.user_id = v_user_id;
end;
$$;

create or replace function public.close_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform 1 from public.spaces s where s.id = p_space_id for update;
  if not found then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.participants p where p.space_id = p_space_id
    and p.user_id = v_user_id and p.role = 'host'::public.participant_role) then
    raise exception 'host_required' using errcode = '42501';
  end if;
  update public.space_rounds r set status = 'no_match'::public.space_round_status
  where r.space_id = p_space_id and r.status in (
    'voting'::public.space_round_status,
    'matching'::public.space_round_status,
    'spinning'::public.space_round_status
  );
  update public.spaces s set status = 'closed'::public.space_status
  where s.id = p_space_id;
end;
$$;

-- Host artık aktif tur sırasında da katılımcıyı çıkarabilir; tur güvenli biçimde
-- sonlandırılır ve çıkarılan kişi banlanır.
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
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform 1 from public.spaces s where s.id = p_space_id for update;
  if not found then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.participants p where p.space_id = p_space_id
    and p.user_id = v_user_id and p.role = 'host'::public.participant_role) then
    raise exception 'host_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.participants p where p.space_id = p_space_id
    and p.user_id = p_target_user_id and p.role <> 'host'::public.participant_role) then
    raise exception 'participant_not_found' using errcode = 'P0001';
  end if;
  update public.space_rounds r set status = 'no_match'::public.space_round_status
  where r.space_id = p_space_id and r.status in (
    'voting'::public.space_round_status,
    'matching'::public.space_round_status,
    'spinning'::public.space_round_status
  );
  insert into public.space_bans (space_id, user_id, kicked_by)
  values (p_space_id, p_target_user_id, v_user_id)
  on conflict (space_id, user_id) do update
  set kicked_by = excluded.kicked_by, kicked_at = now();
  delete from public.participants p
  where p.space_id = p_space_id and p.user_id = p_target_user_id;
end;
$$;

-- Kapalı odalarda yeni mesaj gönderilemez.
create or replace function public.send_space_message(p_space_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant public.participants%rowtype;
  v_display_name text;
  v_body text;
  v_message_id uuid;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.spaces s where s.id = p_space_id
    and s.status = 'active'::public.space_status) then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;
  select * into v_participant from public.participants p
  where p.space_id = p_space_id and p.user_id = v_user_id for update;
  if not found then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;
  v_body := pg_catalog.btrim(coalesce(p_body, ''));
  if pg_catalog.char_length(v_body) not between 1 and 1000 then
    raise exception 'invalid_room_message' using errcode = '22023';
  end if;
  if exists (select 1 from public.room_messages m where m.space_id = p_space_id
    and m.user_id = v_user_id
    and m.created_at > pg_catalog.clock_timestamp() - interval '750 milliseconds') then
    raise exception 'room_message_rate_limited' using errcode = 'P0001';
  end if;
  v_display_name := nullif(pg_catalog.btrim(v_participant.display_name), '');
  v_display_name := coalesce(v_display_name,
    case when v_participant.role = 'host'::public.participant_role
      then 'Oda sahibi' else 'Katılımcı' end);
  if v_display_name in ('Anonim misafir', 'Anonim oda sahibi', 'WatchMuse üyesi',
    'Oda sahibi', 'Katılımcı') then
    v_display_name := v_display_name || ' '
      || pg_catalog.upper(pg_catalog.substr(v_user_id::text, 1, 4));
  end if;
  insert into public.room_messages (space_id, user_id, sender_display_name, body)
  values (p_space_id, v_user_id, v_display_name, v_body)
  returning id into v_message_id;
  return v_message_id;
end;
$$;

revoke all on function public.leave_space(uuid) from public, anon;
revoke all on function public.close_space(uuid) from public, anon;
grant execute on function public.leave_space(uuid) to authenticated;
grant execute on function public.close_space(uuid) to authenticated;

comment on table public.space_passwords is
  'Listelenen private odaların saltlı scrypt şifre özetleri; istemciden tamamen kapalıdır.';
comment on function public.list_discoverable_spaces() is
  'Public ve şifre korumalı private aktif odaları hassas alan olmadan listeler.';
comment on function public.leave_space(uuid) is
  'Guest katılımcının kendi isteğiyle odadan ayrılmasını sağlar.';
comment on function public.close_space(uuid) is
  'Oda sahibinin odayı kapatmasını ve listeden kaldırmasını sağlar.';
