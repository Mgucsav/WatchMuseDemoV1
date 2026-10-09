-- =============================================================================
-- WatchMuse — hareketsiz odaların 30 dakikada otomatik kapanması ve film türü
-- (genre) önbelleği.
-- =============================================================================

-- 1. Odanın son hareket zamanı ---------------------------------------------------
-- Katılım, sohbet, tur, oy, seçim, kabul ve Teleparty bağlantısı hareket
-- sayılır. Sayfayı açık tutmak (yoklama) hareket değildir.

alter table public.spaces
  add column if not exists last_activity_at timestamptz not null default now();

-- Mevcut odalar gerçek son hareketleriyle başlar; uzun süredir boş duranlar
-- ilk kontrolde kapanır.
update public.spaces s
set last_activity_at = greatest(
  s.created_at,
  coalesce((select max(p.joined_at) from public.participants p where p.space_id = s.id), s.created_at),
  coalesce((select max(m.created_at) from public.room_messages m where m.space_id = s.id), s.created_at),
  coalesce((select max(r.updated_at) from public.space_rounds r where r.space_id = s.id), s.created_at),
  coalesce((select max(sel.created_at) from public.room_selections sel where sel.space_id = s.id), s.created_at)
)
where s.status = 'active'::public.space_status;

create index if not exists spaces_active_last_activity_idx
  on public.spaces (last_activity_at) where status = 'active'::public.space_status;

create or replace function public.touch_space_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_space_id uuid;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  if tg_table_name in ('participants', 'room_messages', 'space_rounds', 'room_selections') then
    v_space_id := (v_row ->> 'space_id')::uuid;
  elsif tg_table_name = 'room_votes' then
    select r.space_id into v_space_id
    from public.space_rounds r where r.id = (v_row ->> 'round_id')::uuid;
  elsif tg_table_name in ('room_selection_acceptances', 'room_teleparty_sessions') then
    select sel.space_id into v_space_id
    from public.room_selections sel where sel.id = (v_row ->> 'selection_id')::uuid;
  end if;

  -- 10 saniyelik eşik, art arda oylarda aynı satırın sürekli yazılmasını önler.
  if v_space_id is not null then
    update public.spaces s
    set last_activity_at = pg_catalog.now()
    where s.id = v_space_id
      and s.status = 'active'::public.space_status
      and s.last_activity_at < pg_catalog.now() - interval '10 seconds';
  end if;
  return null;
end;
$$;

revoke all on function public.touch_space_activity() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'participants',
    'room_messages',
    'space_rounds',
    'room_votes',
    'room_selections',
    'room_selection_acceptances',
    'room_teleparty_sessions'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch_space_activity', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      || 'for each row execute function public.touch_space_activity()',
      t || '_touch_space_activity', t
    );
  end loop;
end $$;

-- 2. Hareketsiz odaları kapatma ------------------------------------------------
-- p_space_id verilirse yalnız o oda kontrol edilir (oda açılırken), NULL ise
-- bütün açık odalar (zamanlanmış görev ve oda listesi). Kural herkes için
-- aynıdır: 30 dakika hareketsiz kalan açık oda kapanır; açık bir oylama varsa
-- no_match ile sonlandırılır. Kapatılan oda sayısını döndürür.

create or replace function public.close_inactive_spaces(p_space_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closed uuid[];
begin
  with closed as (
    update public.spaces s
    set status = 'closed'::public.space_status
    where s.status = 'active'::public.space_status
      and s.last_activity_at < pg_catalog.now() - interval '30 minutes'
      and (p_space_id is null or s.id = p_space_id)
    returning s.id
  )
  select coalesce(array_agg(closed.id), '{}'::uuid[]) into v_closed from closed;

  if pg_catalog.cardinality(v_closed) = 0 then
    return 0;
  end if;

  update public.space_rounds r
  set status = 'no_match'::public.space_round_status
  where r.space_id = any(v_closed)
    and r.status in (
      'voting'::public.space_round_status,
      'matching'::public.space_round_status,
      'spinning'::public.space_round_status
    );

  return pg_catalog.cardinality(v_closed);
end;
$$;

revoke all on function public.close_inactive_spaces(uuid) from public, anon;
grant execute on function public.close_inactive_spaces(uuid) to authenticated;

comment on function public.close_inactive_spaces(uuid) is
  '30 dakikadır hareketsiz açık odaları kapatır; zamanlanmış görev ve oda erişimleri çağırır.';

-- 3. Zamanlanmış kapatma (pg_cron) ----------------------------------------------
-- pg_cron açılamazsa migration durmaz: odalar yine de açıldıklarında ve oda
-- listesi yüklenirken kapatılır.

do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule(
    'watchmuse-close-inactive-rooms',
    '*/5 * * * *',
    'select public.close_inactive_spaces()'
  );
exception when others then
  raise notice 'pg_cron zamanlanamadı (%); odalar erişildiğinde kapanmaya devam eder.', sqlerrm;
end $$;

-- 4. Film türü önbelleği ---------------------------------------------------------
-- TMDb'den gelen Türkçe tür etiketleri (Korku, Anime, Romantik komedi…).
-- Kişisel veri değildir; herkes okuyabilir, yalnız sunucu (service role) yazar.

create table if not exists public.movie_genres (
  tmdb_movie_id integer primary key check (tmdb_movie_id > 0),
  genres text[] not null default '{}'::text[],
  updated_at timestamptz not null default now(),
  constraint movie_genres_count check (pg_catalog.cardinality(genres) <= 10)
);

alter table public.movie_genres enable row level security;
revoke all on table public.movie_genres from public, anon, authenticated;
grant select on table public.movie_genres to authenticated;

drop policy if exists movie_genres_read on public.movie_genres;
create policy movie_genres_read on public.movie_genres
  for select to authenticated using (true);

comment on table public.movie_genres is
  'TMDb film türlerinin Türkçe etiket önbelleği; oda adaylarında tür göstermek için.';
