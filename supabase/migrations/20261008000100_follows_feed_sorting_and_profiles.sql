-- =============================================================================
-- WatchMuse — takip sistemi, akış sıralaması (Hot / Popüler / Yeni), profil
-- kapak fotoğrafı ve profil sayfası listeleri (paylaşımlar, beğeniler,
-- takipçiler).
--
-- Kurallar önceki sosyal migration'larla aynıdır: tablolar istemci rollerine
-- kapalıdır, her işlem SECURITY DEFINER fonksiyondan geçer ve user_id dışarı
-- verilmez. Kişiler kullanıcı adıyla tanınır.
-- =============================================================================

-- 1. Profil kapak fotoğrafı ---------------------------------------------------

alter table public.profiles
  add column if not exists banner_path text;

alter table public.profiles
  drop constraint if exists profiles_banner_path_format,
  add constraint profiles_banner_path_format check (
    banner_path is null or banner_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-banners', 'profile-banners', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. Takip --------------------------------------------------------------------

create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_distinct_users check (follower_id <> followee_id)
);

create index if not exists follows_followee_idx
  on public.follows (followee_id, created_at desc);

revoke all on table public.follows from public, anon, authenticated;
alter table public.follows enable row level security;

create index if not exists social_posts_user_root_created_idx
  on public.social_posts (user_id, created_at desc) where parent_post_id is null;
create index if not exists social_post_likes_user_created_idx
  on public.social_post_likes (user_id, created_at desc);

-- 3. Ortak gönderi satırı -------------------------------------------------------
-- Akış, cevaplar ve profil listeleri aynı alanları döndürür. View yalnızca
-- aşağıdaki SECURITY DEFINER fonksiyonlardan okunur; istemci rollerine kapalıdır.
-- auth.uid() sorgu anında çağıranı verir.

create or replace view public.social_post_cards as
select
  post.id,
  post.user_id,
  post.parent_post_id,
  author.username as author_username,
  coalesce(
    nullif(pg_catalog.btrim(author.display_name), ''),
    'WatchMuse üyesi ' || pg_catalog.upper(pg_catalog.substr(post.user_id::text, 1, 4))
  ) as author_display_name,
  author.avatar_path as author_avatar_path,
  post.body,
  post.tmdb_movie_id,
  post.movie_title,
  post.movie_poster_path,
  post.created_at,
  stats.like_count,
  stats.reply_count,
  stats.repost_count,
  exists (
    select 1 from public.social_post_likes mine
    where mine.post_id = post.id and mine.user_id = (select auth.uid())
  ) as liked_by_me,
  exists (
    select 1 from public.social_post_reposts mine
    where mine.post_id = post.id and mine.user_id = (select auth.uid())
  ) as reposted_by_me,
  post.user_id = (select auth.uid()) as is_mine,
  latest_repost.display_name as latest_reposter_display_name,
  greatest(post.created_at, coalesce(latest_repost.created_at, post.created_at)) as activity_at,
  -- Hot ve Popüler sıralamasının etkileşim puanı: repost, beğeniden ağır basar.
  stats.like_count + 2 * stats.repost_count + stats.reply_count as engagement
from public.social_posts post
left join public.profiles author on author.id = post.user_id
cross join lateral (
  select
    (select count(*) from public.social_post_likes likes where likes.post_id = post.id)::integer as like_count,
    (select count(*) from public.social_posts replies where replies.parent_post_id = post.id)::integer as reply_count,
    (select count(*) from public.social_post_reposts reposts where reposts.post_id = post.id)::integer as repost_count
) stats
left join lateral (
  select
    coalesce(
      nullif(pg_catalog.btrim(reposter.display_name), ''),
      'WatchMuse üyesi ' || pg_catalog.upper(pg_catalog.substr(repost.user_id::text, 1, 4))
    ) as display_name,
    repost.created_at
  from public.social_post_reposts repost
  left join public.profiles reposter on reposter.id = repost.user_id
  where repost.post_id = post.id
  order by repost.created_at desc
  limit 1
) latest_repost on true;

revoke all on table public.social_post_cards from public, anon, authenticated;

-- 4. Kullanıcı adından profil kimliği (yalnız iç kullanım) ----------------------
-- NULL kullanıcı adı çağıranın kendisi demektir. Anonim hesapların profili yoktur.

create or replace function public.resolve_social_profile(p_username text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_target uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if p_username is null then
    select u.id into v_target
    from auth.users u
    where u.id = v_user_id and not coalesce(u.is_anonymous, true);
    if v_target is null then
      raise exception 'registration_required' using errcode = '42501';
    end if;
    return v_target;
  end if;

  select p.id into v_target
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username is not null
    and pg_catalog.lower(p.username) = pg_catalog.lower(pg_catalog.btrim(p_username))
    and not coalesce(u.is_anonymous, true);
  if v_target is null then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;
  return v_target;
end;
$$;

-- 5. Akış: Genel / Takip ettiklerin × Hot / Popüler / Yeni ---------------------

create or replace function public.list_social_feed(
  p_scope text default 'all',
  p_sort text default 'new',
  p_limit integer default 30
)
returns table (
  id uuid,
  author_username text,
  author_display_name text,
  author_avatar_path text,
  body text,
  tmdb_movie_id integer,
  movie_title text,
  movie_poster_path text,
  created_at timestamptz,
  like_count integer,
  reply_count integer,
  repost_count integer,
  liked_by_me boolean,
  reposted_by_me boolean,
  is_mine boolean,
  latest_reposter_display_name text,
  activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if p_scope is null or p_scope not in ('all', 'following')
    or p_sort is null or p_sort not in ('new', 'hot', 'top') then
    raise exception 'invalid_feed_option' using errcode = '22023';
  end if;

  return query
  select
    card.id, card.author_username, card.author_display_name, card.author_avatar_path,
    card.body, card.tmdb_movie_id, card.movie_title, card.movie_poster_path,
    card.created_at, card.like_count, card.reply_count, card.repost_count,
    card.liked_by_me, card.reposted_by_me, card.is_mine,
    card.latest_reposter_display_name, card.activity_at
  from public.social_post_cards card
  where card.parent_post_id is null
    -- Takip ettiklerin: takip edilenlerin gönderileri, onların repostları ve
    -- çağıranın kendi gönderileri.
    and (
      p_scope = 'all'
      or card.user_id = v_user_id
      or exists (
        select 1 from public.follows f
        where f.follower_id = v_user_id and f.followee_id = card.user_id
      )
      or exists (
        select 1
        from public.social_post_reposts repost
        join public.follows f
          on f.followee_id = repost.user_id and f.follower_id = v_user_id
        where repost.post_id = card.id
      )
    )
    -- Popüler: son 30 günün en çok etkileşim alan gönderileri.
    and (p_sort <> 'top' or card.created_at > pg_catalog.now() - interval '30 days')
  order by
    -- Hot: Reddit'in sıralaması. log10(etkileşim) + zaman / 45000 saniye;
    -- 10 kat etkileşim yaklaşık 12,5 saatlik yeniliğe denktir.
    case when p_sort = 'hot' then
      pg_catalog.log(greatest(card.engagement, 1)::numeric)
        + extract(epoch from card.created_at)::numeric / 45000
    end desc nulls last,
    case when p_sort = 'top' then card.engagement end desc nulls last,
    card.activity_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

create or replace function public.list_social_replies(
  p_parent_post_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  author_username text,
  author_display_name text,
  author_avatar_path text,
  body text,
  tmdb_movie_id integer,
  movie_title text,
  movie_poster_path text,
  created_at timestamptz,
  like_count integer,
  reply_count integer,
  repost_count integer,
  liked_by_me boolean,
  reposted_by_me boolean,
  is_mine boolean,
  latest_reposter_display_name text,
  activity_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    card.id, card.author_username, card.author_display_name, card.author_avatar_path,
    card.body, card.tmdb_movie_id, card.movie_title, card.movie_poster_path,
    card.created_at, card.like_count, card.reply_count, card.repost_count,
    card.liked_by_me, card.reposted_by_me, card.is_mine,
    card.latest_reposter_display_name, card.activity_at
  from public.social_post_cards card
  where card.parent_post_id = p_parent_post_id
  order by card.created_at
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

-- 6. Profil ---------------------------------------------------------------------

create or replace function public.get_social_profile(p_username text default null)
returns table (
  username text,
  display_name text,
  bio text,
  avatar_path text,
  banner_path text,
  created_at timestamptz,
  follower_count integer,
  following_count integer,
  post_count integer,
  is_me boolean,
  followed_by_me boolean,
  follows_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_target uuid := public.resolve_social_profile(p_username);
begin
  return query
  select
    p.username,
    coalesce(
      nullif(pg_catalog.btrim(p.display_name), ''),
      p.username,
      'WatchMuse üyesi ' || pg_catalog.upper(pg_catalog.substr(p.id::text, 1, 4))
    ),
    p.bio,
    p.avatar_path,
    p.banner_path,
    p.created_at,
    (select count(*) from public.follows f where f.followee_id = v_target)::integer,
    (select count(*) from public.follows f where f.follower_id = v_target)::integer,
    (select count(*) from public.social_posts post
      where post.user_id = v_target and post.parent_post_id is null)::integer,
    v_target = v_user_id,
    exists (select 1 from public.follows f
      where f.follower_id = v_user_id and f.followee_id = v_target),
    exists (select 1 from public.follows f
      where f.follower_id = v_target and f.followee_id = v_user_id)
  from public.profiles p
  where p.id = v_target;
end;
$$;

-- Paylaşımlar herkese açıktır. Beğeniler yalnız profilin sahibine gösterilir.
create or replace function public.list_profile_posts(
  p_username text default null,
  p_kind text default 'posts',
  p_limit integer default 30
)
returns table (
  id uuid,
  author_username text,
  author_display_name text,
  author_avatar_path text,
  body text,
  tmdb_movie_id integer,
  movie_title text,
  movie_poster_path text,
  created_at timestamptz,
  like_count integer,
  reply_count integer,
  repost_count integer,
  liked_by_me boolean,
  reposted_by_me boolean,
  is_mine boolean,
  latest_reposter_display_name text,
  activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_target uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if p_kind is null or p_kind not in ('posts', 'likes') then
    raise exception 'invalid_feed_option' using errcode = '22023';
  end if;
  v_target := public.resolve_social_profile(p_username);
  if p_kind = 'likes' and v_target <> v_user_id then
    raise exception 'likes_private' using errcode = '42501';
  end if;

  if p_kind = 'posts' then
    return query
    select
      card.id, card.author_username, card.author_display_name, card.author_avatar_path,
      card.body, card.tmdb_movie_id, card.movie_title, card.movie_poster_path,
      card.created_at, card.like_count, card.reply_count, card.repost_count,
      card.liked_by_me, card.reposted_by_me, card.is_mine,
      card.latest_reposter_display_name, card.activity_at
    from public.social_post_cards card
    where card.user_id = v_target and card.parent_post_id is null
    order by card.created_at desc
    limit v_limit;
  else
    return query
    select
      card.id, card.author_username, card.author_display_name, card.author_avatar_path,
      card.body, card.tmdb_movie_id, card.movie_title, card.movie_poster_path,
      card.created_at, card.like_count, card.reply_count, card.repost_count,
      card.liked_by_me, card.reposted_by_me, card.is_mine,
      card.latest_reposter_display_name, card.activity_at
    from public.social_post_likes liked
    join public.social_post_cards card on card.id = liked.post_id
    where liked.user_id = v_target
    order by liked.created_at desc
    limit v_limit;
  end if;
end;
$$;

create or replace function public.toggle_follow(p_username text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_anonymous boolean;
  v_target uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous
  from auth.users u where u.id = v_user_id;
  if v_is_anonymous then
    raise exception 'registration_required' using errcode = '42501';
  end if;
  if p_username is null then
    raise exception 'invalid_follow_target' using errcode = '22023';
  end if;

  v_target := public.resolve_social_profile(p_username);
  if v_target = v_user_id then
    raise exception 'invalid_follow_target' using errcode = '22023';
  end if;

  delete from public.follows f
  where f.follower_id = v_user_id and f.followee_id = v_target;
  if found then
    return false;
  end if;

  insert into public.follows (follower_id, followee_id)
  values (v_user_id, v_target)
  on conflict do nothing;
  return true;
end;
$$;

create or replace function public.list_follows(
  p_username text default null,
  p_kind text default 'followers',
  p_limit integer default 50
)
returns table (
  username text,
  display_name text,
  bio text,
  avatar_path text,
  followed_by_me boolean,
  is_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_target uuid;
begin
  if p_kind is null or p_kind not in ('followers', 'following') then
    raise exception 'invalid_feed_option' using errcode = '22023';
  end if;
  v_target := public.resolve_social_profile(p_username);

  return query
  select
    other.username,
    coalesce(nullif(pg_catalog.btrim(other.display_name), ''), other.username),
    other.bio,
    other.avatar_path,
    exists (select 1 from public.follows mine
      where mine.follower_id = v_user_id and mine.followee_id = other.id),
    other.id = v_user_id
  from public.follows f
  join public.profiles other
    on other.id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
  join auth.users u on u.id = other.id
  where (case when p_kind = 'followers' then f.followee_id else f.follower_id end) = v_target
    and other.username is not null
    and not coalesce(u.is_anonymous, true)
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

create or replace function public.set_my_banner_path(p_banner_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
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
  if p_banner_path is not null and (
    p_banner_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
    or pg_catalog.split_part(p_banner_path, '/', 1) <> v_user_id::text
  ) then
    raise exception 'invalid_banner' using errcode = '22023';
  end if;
  update public.profiles p set banner_path = p_banner_path where p.id = v_user_id;
end;
$$;

-- 7. Yetkiler ---------------------------------------------------------------------

revoke all on function public.resolve_social_profile(text) from public, anon, authenticated;

do $$
declare fn text;
begin
  foreach fn in array array[
    'list_social_feed(text,text,integer)',
    'list_social_replies(uuid,integer)',
    'get_social_profile(text)',
    'list_profile_posts(text,text,integer)',
    'toggle_follow(text)',
    'list_follows(text,text,integer)',
    'set_my_banner_path(text)'
  ] loop
    execute 'revoke all on function public.' || fn || ' from public, anon';
    execute 'grant execute on function public.' || fn || ' to authenticated';
  end loop;
end $$;

comment on table public.follows is
  'Tek yönlü takip ilişkisi; doğrudan tablo erişimi kapalıdır, toggle_follow ile yazılır.';
comment on view public.social_post_cards is
  'Akış, cevap ve profil listelerinin ortak gönderi satırı; yalnız SECURITY DEFINER fonksiyonlardan okunur.';
comment on function public.list_social_feed(text, text, integer) is
  'Genel veya takip edilen akışı Hot, Popüler (30 gün) ya da Yeni sırasıyla döndürür; user_id sızdırmaz.';
comment on function public.list_profile_posts(text, text, integer) is
  'Profil paylaşımlarını herkese, beğenileri yalnız profil sahibine döndürür.';
