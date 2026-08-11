-- =============================================================================
-- WatchMuse — 01/03: room şeması (spaces, participants, invitations)
--
-- Sıra: bu dosya RLS (…000200) ve fonksiyonlardan (…000300) ÖNCE uygulanmalıdır.
--
-- GEREKLİ EKLENTİLER
--   Bu tasarım çekirdek dışında EKLENTİ GEREKTİRMEZ:
--     * `gen_random_uuid()` PostgreSQL 13'ten beri çekirdektedir (pg_catalog);
--       `pgcrypto` gerekmez.
--     * SHA-256 hash'leme veritabanında DEĞİL, güvenilen Next.js sunucu
--       kodunda yapılır (bkz. …000300 başlığındaki güven sınırı notu), bu
--       yüzden `pgcrypto.digest()` de gerekmez.
--   Gereksiz eklenti kurmamak bilinçli bir tercihtir: yüzey alanını büyütür.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum tipleri
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type t
                 join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'space_status' and n.nspname = 'public') then
    create type public.space_status as enum ('active', 'closed');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type t
                 join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'participant_role' and n.nspname = 'public') then
    -- DİKKAT: Bu enum'un tam olarak İKİ değeri olması, `participants` üzerindeki
    -- unique(space_id, role) kısıtıyla birlikte "bir odada en fazla iki katılımcı"
    -- garantisini VERİTABANI SEVİYESİNDE sağlar. Yeni bir rol eklemek bu
    -- garantiyi sessizce bozar.
    create type public.participant_role as enum ('host', 'guest');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- updated_at tetikleyici fonksiyonu
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

comment on function public.set_updated_at() is
  'updated_at sütununu her UPDATE''te tazeler. SECURITY INVOKER (varsayılan); ayrıcalık yükseltmez.';

-- -----------------------------------------------------------------------------
-- spaces
-- -----------------------------------------------------------------------------

create table if not exists public.spaces (
  id          uuid primary key default gen_random_uuid(),
  status      public.space_status not null default 'active',
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.spaces is
  'İki kişilik özel film karar odası. Doğrudan istemci yazımı yoktur; yalnızca SECURITY DEFINER fonksiyonlarla oluşturulur.';

create index if not exists spaces_created_by_idx on public.spaces (created_by);

drop trigger if exists spaces_set_updated_at on public.spaces;
create trigger spaces_set_updated_at
  before update on public.spaces
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- participants
-- -----------------------------------------------------------------------------

create table if not exists public.participants (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          public.participant_role not null,
  display_name  text,
  joined_at     timestamptz not null default now(),

  -- Aynı kullanıcı bir odaya iki kez katılamaz.
  constraint participants_unique_user_per_space unique (space_id, user_id),

  -- ODANIN İKİ KİŞİ SINIRI BURADA UYGULANIR.
  -- `participant_role` enum'unun tam olarak iki değeri olduğu için, bu kısıt
  -- bir odada en fazla iki satır bulunmasını garanti eder. Bu, uygulama
  -- mantığından bağımsız, eşzamanlılık altında da geçerli bir garantidir:
  -- iki eşzamanlı guest ekleme denemesinden biri unique_violation alır.
  constraint participants_unique_role_per_space unique (space_id, role),

  constraint participants_display_name_length
    check (display_name is null or char_length(btrim(display_name)) between 1 and 60)
);

comment on table public.participants is
  'Bir odanın katılımcıları. unique(space_id, role) + iki değerli enum, iki kişi sınırını veritabanı seviyesinde garanti eder.';

comment on constraint participants_unique_role_per_space on public.participants is
  'İki kişi sınırının uygulandığı yer. Kaldırılırsa üçüncü katılımcı engeli ortadan kalkar.';

create index if not exists participants_space_id_idx on public.participants (space_id);
create index if not exists participants_user_id_idx  on public.participants (user_id);

-- -----------------------------------------------------------------------------
-- invitations
-- -----------------------------------------------------------------------------

create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,

  -- Davet token'ının SHA-256 özeti; 64 haneli küçük harf hex.
  -- DÜZ METİN TOKEN HİÇBİR ZAMAN SAKLANMAZ.
  token_hash  text not null,

  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  created_by  uuid not null references auth.users (id) on delete cascade,

  constraint invitations_token_hash_format check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint invitations_expires_after_creation check (expires_at > created_at),
  -- used_at ve used_by birlikte dolar ya da birlikte boş kalır.
  constraint invitations_used_consistency
    check ((used_at is null and used_by is null) or (used_at is not null and used_by is not null))
);

comment on table public.invitations is
  'Oda davetleri. Yalnızca token''ın SHA-256 özeti saklanır; düz metin token asla veritabanına yazılmaz ve istemciye hash gösterilmez.';

comment on column public.invitations.token_hash is
  'Güvenilen sunucu kodunda hesaplanan SHA-256 özeti (hex). RLS ile hiçbir istemciye okutulmaz.';

-- Hash benzersiz olmalı: aynı token iki odaya bağlanamaz ve arama tek satır döner.
create unique index if not exists invitations_token_hash_key on public.invitations (token_hash);
create index if not exists invitations_space_id_idx on public.invitations (space_id);
