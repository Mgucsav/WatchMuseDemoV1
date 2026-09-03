-- =============================================================================
-- WatchMuse — gönderi sahipliği ve yalnız yazara açık gönderi silme
-- =============================================================================

-- Önceki liste fonksiyonu dağıtım geçişinde çalışmaya devam eder. V2 yalnız
-- çağıranın kendi gönderileri için is_mine=true döndürür; user_id dışarı çıkmaz.
create or replace function public.list_social_posts_v2(
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
    post.user_id = (select auth.uid()),
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

-- DELETE tablo izni verilmez. SECURITY DEFINER fonksiyon auth.uid() ile yalnız
-- yazara ait satırı siler. Root post silinirse FK cascade cevapları, beğenileri
-- ve repostları da aynı transaction içinde temizler.
create or replace function public.delete_social_post(p_post_id uuid)
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

  delete from public.social_posts post
  where post.id = p_post_id and post.user_id = v_user_id;

  if not found then
    -- Başkasının gönderisi ile var olmayan gönderiyi ayırt ederek sahiplik
    -- bilgisi sızdırılmaz.
    raise exception 'social_post_not_found' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.list_social_posts_v2(uuid, integer)
  from public, anon;
revoke all on function public.delete_social_post(uuid)
  from public, anon;
grant execute on function public.list_social_posts_v2(uuid, integer)
  to authenticated;
grant execute on function public.delete_social_post(uuid)
  to authenticated;

comment on function public.delete_social_post(uuid) is
  'Yalnız kayıtlı yazarın kendi gönderisini siler; sahip olmadığı kayıtlar için varlık bilgisi sızdırmaz.';
