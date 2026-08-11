-- =============================================================================
-- WatchMuse — kullanıcı profilleri ve kişisel film kütüphanesi
--
-- Sıra: rooms migration'larından (…20260811000300) SONRA uygulanır.
-- Mevcut migration dosyaları DEĞİŞTİRİLMEZ; bu dosya yalnızca ekleme yapar.
--
-- Bu migration oda sistemini etkilemez. Anonim kullanıcılar (oda akışı) da
-- `auth.users` içinde satır oluşturduğu için onlara da profil açılır. Aynı
-- `auth.uid()` kişisel kütüphanenin de sahibidir; kullanıcı sonra e-posta
-- bağladığında user_id değişmez.
--
-- EKLENTİ GEREKMEZ: `gen_random_uuid()` PostgreSQL 13'ten beri çekirdektedir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- updated_at yardımcı fonksiyonu
--
-- rooms migration'ında da tanımlıdır; gövdesi birebir aynıdır. Bu migration'ın
-- tek başına da uygulanabilmesi için idempotent şekilde tekrar tanımlanır.
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Enum: kütüphane kaydının durumu
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type t
                 join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'library_status' and n.nspname = 'public') then
    create type public.library_status as enum ('watchlist', 'watched');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint profiles_display_name_length
    check (display_name is null or char_length(btrim(display_name)) between 1 and 60)
);

comment on table public.profiles is
  'auth.users ile bire bir eşleşen kullanıcı profili. Satır, kullanıcı oluşturulduğunda trigger ile açılır.';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Yeni kullanıcı → profil trigger'ı
--
-- SECURITY DEFINER gereklidir: `auth.users` üzerindeki trigger, RLS'in yazmayı
-- engellediği `public.profiles` tablosuna satır ekler.
--
-- Sertleştirme: sabit boş search_path, şema nitelikli isimler, PUBLIC'ten
-- execute geri alımı. Fonksiyon yalnızca trigger bağlamında çalışır.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  -- Kayıt formundan gelen ad. Kısıt ihlali yüzünden KAYIT AKIŞININ BOZULMAMASI
  -- için burada kırpılır; ham metne güvenilmez.
  v_display_name := nullif(
    btrim(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60)),
    ''
  );

  insert into public.profiles (id, display_name)
  values (new.id, v_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'SECURITY DEFINER. auth.users''a eklenen her kullanıcı için public.profiles satırı açar. display_name kırpılarak yazılır; kısıt ihlalinin kayıt akışını bozmaması içindir. Yalnızca trigger tarafından çağrılır.';

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- library_items
-- -----------------------------------------------------------------------------

create table if not exists public.library_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  tmdb_movie_id  integer not null,
  movie_title    text not null,
  poster_path    text,
  status         public.library_status not null default 'watchlist',
  rating         smallint,
  note           text,
  watched_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Bir kullanıcının aynı TMDb filminden yalnızca BİR kaydı olabilir.
  constraint library_items_unique_movie_per_user unique (user_id, tmdb_movie_id),

  constraint library_items_tmdb_id_positive check (tmdb_movie_id > 0),
  constraint library_items_rating_range check (rating is null or rating between 1 and 10),
  constraint library_items_title_length
    check (char_length(btrim(movie_title)) between 1 and 300),
  constraint library_items_note_length check (note is null or char_length(note) <= 2000),
  -- TMDb afiş yolu biçimi; arayüze rastgele bir URL yerleştirilmesini engeller.
  constraint library_items_poster_path_format
    check (poster_path is null or poster_path ~ '^/[A-Za-z0-9._-]+$'),
  -- Puan yalnızca izlenmiş filmlerde anlamlıdır.
  constraint library_items_rating_requires_watched
    check (rating is null or status = 'watched'::public.library_status)
);

comment on table public.library_items is
  'Kullanıcının kişisel film kütüphanesi. Her kullanıcı yalnızca kendi kayıtlarını görebilir ve değiştirebilir (RLS).';

comment on constraint library_items_unique_movie_per_user on public.library_items is
  'Aynı film bir kullanıcıda tekrar edemez; "izleneceklere ekle" işlemi upsert olarak çalışır.';

create index if not exists library_items_user_status_idx
  on public.library_items (user_id, status, created_at desc);

drop trigger if exists library_items_set_updated_at on public.library_items;
create trigger library_items_set_updated_at
  before update on public.library_items
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
--
-- Model: kullanıcı YALNIZCA kendi satırlarını okur/yazar. Başka bir kullanıcının
-- profilini veya kütüphanesini görmenin hiçbir yolu yoktur.
--
-- `(select auth.uid())` biçimi bilinçlidir: alt sorgu olarak sarmalandığında
-- Postgres değeri satır başına değil bir kez hesaplar.
-- -----------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.library_items enable row level security;

-- profiles ------------------------------------------------------------------

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own
  on public.profiles for delete to authenticated
  using ((select auth.uid()) = id);

-- library_items --------------------------------------------------------------

drop policy if exists library_items_select_own on public.library_items;
create policy library_items_select_own
  on public.library_items for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists library_items_insert_own on public.library_items;
create policy library_items_insert_own
  on public.library_items for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists library_items_update_own on public.library_items;
create policy library_items_update_own
  on public.library_items for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists library_items_delete_own on public.library_items;
create policy library_items_delete_own
  on public.library_items for delete to authenticated
  using ((select auth.uid()) = user_id);

-- `anon` API rolüne doğrudan erişim verilmez. Bu, Supabase Auth ile anonim
-- giriş yapan kullanıcıdan farklıdır: anonim giriş gerçek bir `authenticated`
-- rolü ve `auth.uid()` taşır; yukarıdaki RLS politikaları onu yalnızca kendi
-- satırlarıyla sınırlar.
revoke all on public.profiles      from anon;
revoke all on public.library_items from anon;
