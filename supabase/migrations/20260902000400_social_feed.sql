-- =============================================================================
-- WatchMuse — üyelerin yazdığı, anonim ziyaretçilerin okuyabildiği sosyal akış
-- =============================================================================

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_post_id uuid references public.social_posts (id) on delete cascade,
  body text not null,
  tmdb_movie_id integer,
  movie_title text,
  movie_poster_path text,
  created_at timestamptz not null default now(),
  constraint social_posts_body_valid
    check (char_length(btrim(body)) between 1 and 1000),
  constraint social_posts_movie_pair_valid check (
    (tmdb_movie_id is null and movie_title is null and movie_poster_path is null)
    or (
      tmdb_movie_id > 0
      and movie_title is not null
      and char_length(btrim(movie_title)) between 1 and 300
      and (movie_poster_path is null or movie_poster_path ~ '^/[A-Za-z0-9._-]+$')
    )
  )
);

create table if not exists public.social_post_likes (
  post_id uuid not null references public.social_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.social_post_reposts (
  post_id uuid not null references public.social_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists social_posts_root_created_idx
  on public.social_posts (created_at desc) where parent_post_id is null;
create index if not exists social_posts_parent_created_idx
  on public.social_posts (parent_post_id, created_at);
create index if not exists social_post_reposts_post_created_idx
  on public.social_post_reposts (post_id, created_at desc);

revoke all on table public.social_posts from public, anon, authenticated;
revoke all on table public.social_post_likes from public, anon, authenticated;
revoke all on table public.social_post_reposts from public, anon, authenticated;
alter table public.social_posts enable row level security;
alter table public.social_post_likes enable row level security;
alter table public.social_post_reposts enable row level security;

-- Ana akış için NULL, cevaplar için parent UUID verilir. Yalnız güvenli profil
-- adı ve film snapshot'ı döner; e-posta ve user_id hiçbir zaman dışarı çıkmaz.
create or replace function public.list_social_posts(
  p_parent_post_id uuid default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  author_display_name text,
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
  latest_reposter_display_name text,
  activity_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    post.id,
    coalesce(
      nullif(pg_catalog.btrim(author.display_name), ''),
      'WatchMuse üyesi ' || pg_catalog.upper(pg_catalog.substr(post.user_id::text, 1, 4))
    ),
    post.body,
    post.tmdb_movie_id,
    post.movie_title,
    post.movie_poster_path,
    post.created_at,
    coalesce(stats.like_count, 0)::integer,
    coalesce(stats.reply_count, 0)::integer,
    coalesce(stats.repost_count, 0)::integer,
    exists (
      select 1 from public.social_post_likes mine
      where mine.post_id = post.id and mine.user_id = (select auth.uid())
    ),
    exists (
      select 1 from public.social_post_reposts mine
      where mine.post_id = post.id and mine.user_id = (select auth.uid())
    ),
    latest_repost.display_name,
    greatest(post.created_at, coalesce(latest_repost.created_at, post.created_at))
  from public.social_posts post
  left join public.profiles author on author.id = post.user_id
  left join lateral (
    select
      (select count(*) from public.social_post_likes likes where likes.post_id = post.id) as like_count,
      (select count(*) from public.social_posts replies where replies.parent_post_id = post.id) as reply_count,
      (select count(*) from public.social_post_reposts reposts where reposts.post_id = post.id) as repost_count
  ) stats on true
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
  ) latest_repost on true
  where (
    (p_parent_post_id is null and post.parent_post_id is null)
    or post.parent_post_id = p_parent_post_id
  )
  order by
    case when p_parent_post_id is null
      then greatest(post.created_at, coalesce(latest_repost.created_at, post.created_at))
      else post.created_at
    end desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

create or replace function public.create_social_post(
  p_body text,
  p_parent_post_id uuid default null,
  p_tmdb_movie_id integer default null,
  p_movie_title text default null,
  p_movie_poster_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_anonymous boolean;
  v_body text := pg_catalog.btrim(coalesce(p_body, ''));
  v_post_id uuid;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous
  from auth.users u where u.id = v_user_id;
  if v_is_anonymous then raise exception 'registration_required' using errcode = '42501'; end if;
  if pg_catalog.char_length(v_body) not between 1 and 1000 then
    raise exception 'invalid_social_post' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.social_posts recent
    where recent.user_id = v_user_id
      and recent.created_at > pg_catalog.clock_timestamp() - interval '2 seconds'
  ) then
    raise exception 'social_post_rate_limited' using errcode = 'P0001';
  end if;
  if p_parent_post_id is not null and not exists (
    select 1 from public.social_posts parent
    where parent.id = p_parent_post_id and parent.parent_post_id is null
  ) then
    raise exception 'invalid_parent_post' using errcode = 'P0001';
  end if;
  if (
    (p_tmdb_movie_id is null and (p_movie_title is not null or p_movie_poster_path is not null))
    or (p_tmdb_movie_id is not null and (
      p_tmdb_movie_id <= 0
      or p_movie_title is null
      or pg_catalog.char_length(pg_catalog.btrim(p_movie_title)) not between 1 and 300
      or (p_movie_poster_path is not null and p_movie_poster_path !~ '^/[A-Za-z0-9._-]+$')
    ))
  ) then
    raise exception 'invalid_social_movie' using errcode = '22023';
  end if;

  insert into public.social_posts (
    user_id, parent_post_id, body, tmdb_movie_id, movie_title, movie_poster_path
  ) values (
    v_user_id,
    p_parent_post_id,
    v_body,
    p_tmdb_movie_id,
    case when p_movie_title is null then null else pg_catalog.btrim(p_movie_title) end,
    p_movie_poster_path
  ) returning id into v_post_id;
  return v_post_id;
end;
$$;

create or replace function public.toggle_social_post_like(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_anonymous boolean;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous
  from auth.users u where u.id = v_user_id;
  if v_is_anonymous then raise exception 'registration_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.social_posts post where post.id = p_post_id) then
    raise exception 'social_post_not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.social_post_likes likes
    where likes.post_id = p_post_id and likes.user_id = v_user_id) then
    delete from public.social_post_likes likes
    where likes.post_id = p_post_id and likes.user_id = v_user_id;
    return false;
  end if;
  insert into public.social_post_likes (post_id, user_id)
  values (p_post_id, v_user_id);
  return true;
end;
$$;

create or replace function public.toggle_social_post_repost(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_anonymous boolean;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select coalesce(u.is_anonymous, true) into v_is_anonymous
  from auth.users u where u.id = v_user_id;
  if v_is_anonymous then raise exception 'registration_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.social_posts post where post.id = p_post_id) then
    raise exception 'social_post_not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.social_post_reposts reposts
    where reposts.post_id = p_post_id and reposts.user_id = v_user_id) then
    delete from public.social_post_reposts reposts
    where reposts.post_id = p_post_id and reposts.user_id = v_user_id;
    return false;
  end if;
  insert into public.social_post_reposts (post_id, user_id)
  values (p_post_id, v_user_id);
  return true;
end;
$$;

revoke all on function public.list_social_posts(uuid, integer) from public, anon;
revoke all on function public.create_social_post(text, uuid, integer, text, text) from public, anon;
revoke all on function public.toggle_social_post_like(uuid) from public, anon;
revoke all on function public.toggle_social_post_repost(uuid) from public, anon;
grant execute on function public.list_social_posts(uuid, integer) to authenticated;
grant execute on function public.create_social_post(text, uuid, integer, text, text) to authenticated;
grant execute on function public.toggle_social_post_like(uuid) to authenticated;
grant execute on function public.toggle_social_post_repost(uuid) to authenticated;

comment on table public.social_posts is
  'Üyelerin ana akış postları ve tek seviyeli cevapları; doğrudan tablo erişimi kapalıdır.';
comment on function public.list_social_posts(uuid, integer) is
  'Anonim veya kayıtlı oturuma user_id/e-posta sızdırmadan sosyal akışı ya da cevapları döndürür.';
