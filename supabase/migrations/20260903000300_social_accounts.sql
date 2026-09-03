-- WatchMuse social accounts: public profile, friendship and private messaging.

alter table public.profiles
  add column if not exists username text,
  add column if not exists bio text,
  add column if not exists avatar_path text,
  add column if not exists dm_privacy text not null default 'friends';

alter table public.profiles
  drop constraint if exists profiles_username_format,
  add constraint profiles_username_format check (
    username is null or username ~ '^[a-z0-9_]{3,24}$'
  ),
  drop constraint if exists profiles_bio_length,
  add constraint profiles_bio_length check (bio is null or char_length(bio) <= 300),
  drop constraint if exists profiles_avatar_path_format,
  add constraint profiles_avatar_path_format check (
    avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
  ),
  drop constraint if exists profiles_dm_privacy_allowed,
  add constraint profiles_dm_privacy_allowed check (
    dm_privacy in ('everyone', 'friends', 'nobody')
  );

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username)) where username is not null;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_distinct_users check (requester_id <> addressee_id),
  constraint friendships_status_allowed check (status in ('pending', 'accepted'))
);

create unique index if not exists friendships_unique_pair
  on public.friendships (
    least(requester_id, addressee_id), greatest(requester_id, addressee_id)
  );
create index if not exists friendships_requester_idx
  on public.friendships (requester_id, status, updated_at desc);
create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status, updated_at desc);

drop trigger if exists friendships_set_updated_at on public.friendships;
create trigger friendships_set_updated_at before update on public.friendships
for each row execute function public.set_updated_at();

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint direct_messages_distinct_users check (sender_id <> recipient_id),
  constraint direct_messages_body_length check (
    char_length(btrim(body)) between 1 and 2000
  )
);

create index if not exists direct_messages_conversation_idx
  on public.direct_messages (
    least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc
  );
create index if not exists direct_messages_unread_idx
  on public.direct_messages (recipient_id, created_at desc) where read_at is null;

revoke all on table public.friendships, public.direct_messages from public, anon, authenticated;
alter table public.friendships enable row level security;
alter table public.direct_messages enable row level security;

-- Existing profile reads remain own-row only. Writes go through validated RPCs.
revoke all on table public.profiles from anon;
revoke update, insert, delete on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars', 'profile-avatars', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.get_my_social_profile()
returns table (
  user_id uuid, username text, display_name text, bio text,
  avatar_path text, dm_privacy text, created_at timestamptz
)
language plpgsql security definer set search_path = '' stable
as $$
declare v_user_id uuid := (select auth.uid()); v_is_anonymous boolean;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous from auth.users u where u.id = v_user_id;
  if v_is_anonymous then raise exception 'registration_required' using errcode = '42501'; end if;
  return query select p.id, p.username, p.display_name, p.bio, p.avatar_path,
    p.dm_privacy, p.created_at from public.profiles p where p.id = v_user_id;
end;
$$;

create or replace function public.update_my_social_profile(
  p_username text, p_display_name text, p_bio text, p_dm_privacy text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_anonymous boolean;
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_bio text := nullif(btrim(coalesce(p_bio, '')), '');
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous from auth.users u where u.id = v_user_id;
  if v_is_anonymous then raise exception 'registration_required' using errcode = '42501'; end if;
  if v_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'invalid_username' using errcode = '22023'; end if;
  if char_length(v_display_name) not between 1 and 60 then raise exception 'invalid_display_name' using errcode = '22023'; end if;
  if v_bio is not null and char_length(v_bio) > 300 then raise exception 'invalid_bio' using errcode = '22023'; end if;
  if p_dm_privacy not in ('everyone', 'friends', 'nobody') then raise exception 'invalid_dm_privacy' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles p where lower(p.username) = v_username and p.id <> v_user_id) then
    raise exception 'username_taken' using errcode = '23505';
  end if;
  update public.profiles p set username = v_username, display_name = v_display_name,
    bio = v_bio, dm_privacy = p_dm_privacy where p.id = v_user_id;
end;
$$;

create or replace function public.set_my_avatar_path(p_avatar_path text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid()); v_is_anonymous boolean;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous from auth.users u where u.id = v_user_id;
  if v_is_anonymous then raise exception 'registration_required' using errcode = '42501'; end if;
  if p_avatar_path is not null and (
    p_avatar_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
    or split_part(p_avatar_path, '/', 1) <> v_user_id::text
  ) then raise exception 'invalid_avatar' using errcode = '22023'; end if;
  update public.profiles p set avatar_path = p_avatar_path where p.id = v_user_id;
end;
$$;

create or replace function public.search_social_profiles(p_query text, p_limit integer default 20)
returns table (
  user_id uuid, username text, display_name text, bio text, avatar_path text,
  relationship text, can_message boolean
)
language plpgsql security definer set search_path = '' stable
as $$
declare v_user_id uuid := (select auth.uid()); v_is_anonymous boolean; v_query text := lower(btrim(coalesce(p_query, '')));
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous from auth.users u where u.id = v_user_id;
  if v_is_anonymous then raise exception 'registration_required' using errcode = '42501'; end if;
  if char_length(v_query) < 2 then raise exception 'invalid_user_search' using errcode = '22023'; end if;
  return query
  select p.id, p.username, coalesce(p.display_name, p.username), p.bio, p.avatar_path,
    coalesce((select case
      when f.status = 'accepted' then 'friends'
      when f.requester_id = v_user_id then 'outgoing'
      else 'incoming' end
      from public.friendships f where
        (f.requester_id = v_user_id and f.addressee_id = p.id)
        or (f.requester_id = p.id and f.addressee_id = v_user_id)
      limit 1), 'none')::text,
    (p.dm_privacy = 'everyone' or (
      p.dm_privacy = 'friends' and exists (select 1 from public.friendships f where f.status = 'accepted' and
        ((f.requester_id = v_user_id and f.addressee_id = p.id) or
         (f.requester_id = p.id and f.addressee_id = v_user_id)))))
  from public.profiles p join auth.users u on u.id = p.id
  where p.id <> v_user_id and not coalesce(u.is_anonymous, true) and p.username is not null
    and (lower(p.username) like '%' || v_query || '%' or lower(coalesce(p.display_name, '')) like '%' || v_query || '%')
  order by case when lower(p.username) = v_query then 0 else 1 end, p.username
  limit least(greatest(coalesce(p_limit, 20), 1), 30);
end;
$$;

create or replace function public.list_social_connections()
returns table (
  user_id uuid, username text, display_name text, bio text, avatar_path text,
  relationship text, can_message boolean, updated_at timestamptz
)
language plpgsql security definer set search_path = '' stable
as $$
declare v_user_id uuid := (select auth.uid()); v_is_anonymous boolean;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous from auth.users u where u.id = v_user_id;
  if v_is_anonymous then raise exception 'registration_required' using errcode = '42501'; end if;
  return query
  select other.id, other.username, coalesce(other.display_name, other.username), other.bio, other.avatar_path,
    case when f.status = 'accepted' then 'friends'
      when f.addressee_id = v_user_id then 'incoming' else 'outgoing' end::text,
    (other.dm_privacy = 'everyone' or (other.dm_privacy = 'friends' and f.status = 'accepted')),
    f.updated_at
  from public.friendships f
  join public.profiles other on other.id = case when f.requester_id = v_user_id then f.addressee_id else f.requester_id end
  where f.requester_id = v_user_id or f.addressee_id = v_user_id
  order by f.updated_at desc;
end;
$$;

create or replace function public.request_friendship(p_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid()); v_is_anonymous boolean; v_target_anonymous boolean;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous from auth.users u where u.id = v_user_id;
  select coalesce(u.is_anonymous, true) into v_target_anonymous from auth.users u where u.id = p_user_id;
  if v_is_anonymous then raise exception 'registration_required' using errcode = '42501'; end if;
  if p_user_id is null or p_user_id = v_user_id or v_target_anonymous then raise exception 'invalid_friend_target' using errcode = '22023'; end if;
  if exists (select 1 from public.friendships f where
    (f.requester_id = v_user_id and f.addressee_id = p_user_id) or
    (f.requester_id = p_user_id and f.addressee_id = v_user_id)) then
    raise exception 'friendship_exists' using errcode = 'P0001';
  end if;
  insert into public.friendships (requester_id, addressee_id) values (v_user_id, p_user_id);
end;
$$;

create or replace function public.respond_friendship(p_user_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_accept then
    update public.friendships f set status = 'accepted'
    where f.requester_id = p_user_id and f.addressee_id = v_user_id and f.status = 'pending';
  else
    delete from public.friendships f
    where f.requester_id = p_user_id and f.addressee_id = v_user_id and f.status = 'pending';
  end if;
  if not found then raise exception 'friendship_not_found' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.remove_social_connection(p_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  delete from public.friendships f where
    (f.requester_id = v_user_id and f.addressee_id = p_user_id) or
    (f.requester_id = p_user_id and f.addressee_id = v_user_id);
  if not found then raise exception 'friendship_not_found' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.send_direct_message(p_recipient_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid()); v_body text := btrim(coalesce(p_body, '')); v_is_anonymous boolean; v_privacy text; v_id uuid;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous from auth.users u where u.id = v_user_id;
  if v_is_anonymous then raise exception 'registration_required' using errcode = '42501'; end if;
  if p_recipient_id is null or p_recipient_id = v_user_id or char_length(v_body) not between 1 and 2000 then
    raise exception 'invalid_direct_message' using errcode = '22023';
  end if;
  select p.dm_privacy into v_privacy from public.profiles p join auth.users u on u.id = p.id
  where p.id = p_recipient_id and not coalesce(u.is_anonymous, true);
  if not found then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if v_privacy = 'nobody' or (v_privacy = 'friends' and not exists (
    select 1 from public.friendships f where f.status = 'accepted' and
      ((f.requester_id = v_user_id and f.addressee_id = p_recipient_id) or
       (f.requester_id = p_recipient_id and f.addressee_id = v_user_id))
  )) then raise exception 'direct_message_forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.direct_messages m where m.sender_id = v_user_id and m.created_at > clock_timestamp() - interval '1 second') then
    raise exception 'direct_message_rate_limited' using errcode = 'P0001';
  end if;
  insert into public.direct_messages (sender_id, recipient_id, body)
  values (v_user_id, p_recipient_id, v_body) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_direct_messages(p_other_user_id uuid, p_limit integer default 50)
returns table (id uuid, sender_id uuid, body text, created_at timestamptz, is_mine boolean)
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid()); v_is_anonymous boolean;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous from auth.users u where u.id = v_user_id;
  if v_is_anonymous then raise exception 'registration_required' using errcode = '42501'; end if;
  update public.direct_messages m set read_at = coalesce(m.read_at, clock_timestamp())
  where m.sender_id = p_other_user_id and m.recipient_id = v_user_id and m.read_at is null;
  return query select picked.id, picked.sender_id, picked.body, picked.created_at,
    picked.sender_id = v_user_id from (
      select m.id, m.sender_id, m.body, m.created_at from public.direct_messages m
      where (m.sender_id = v_user_id and m.recipient_id = p_other_user_id)
         or (m.sender_id = p_other_user_id and m.recipient_id = v_user_id)
      order by m.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) picked order by picked.created_at;
end;
$$;

create or replace function public.list_dm_threads()
returns table (
  user_id uuid, username text, display_name text, avatar_path text,
  last_body text, last_message_at timestamptz, unread_count integer
)
language plpgsql security definer set search_path = '' stable
as $$
declare v_user_id uuid := (select auth.uid()); v_is_anonymous boolean;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous from auth.users u where u.id = v_user_id;
  if v_is_anonymous then raise exception 'registration_required' using errcode = '42501'; end if;
  return query
  with peers as (
    select distinct case when m.sender_id = v_user_id then m.recipient_id else m.sender_id end as peer_id
    from public.direct_messages m where m.sender_id = v_user_id or m.recipient_id = v_user_id
  )
  select p.id, p.username, coalesce(p.display_name, p.username), p.avatar_path,
    latest.body, latest.created_at,
    (select count(*)::integer from public.direct_messages unread where unread.sender_id = p.id
      and unread.recipient_id = v_user_id and unread.read_at is null)
  from peers join public.profiles p on p.id = peers.peer_id
  cross join lateral (
    select m.body, m.created_at from public.direct_messages m
    where (m.sender_id = v_user_id and m.recipient_id = p.id)
       or (m.sender_id = p.id and m.recipient_id = v_user_id)
    order by m.created_at desc limit 1
  ) latest
  order by latest.created_at desc;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'get_my_social_profile()',
    'update_my_social_profile(text,text,text,text)',
    'set_my_avatar_path(text)',
    'search_social_profiles(text,integer)',
    'list_social_connections()',
    'request_friendship(uuid)',
    'respond_friendship(uuid,boolean)',
    'remove_social_connection(uuid)',
    'send_direct_message(uuid,text)',
    'list_direct_messages(uuid,integer)',
    'list_dm_threads()'
  ] loop
    execute 'revoke all on function public.' || fn || ' from public, anon';
    execute 'grant execute on function public.' || fn || ' to authenticated';
  end loop;
end $$;
