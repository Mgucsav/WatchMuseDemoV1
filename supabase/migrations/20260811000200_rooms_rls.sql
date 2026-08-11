-- =============================================================================
-- WatchMuse — 02/03: Row Level Security
--
-- Sıra: …000100_rooms_schema.sql SONRASI, …000300_rooms_functions.sql ÖNCESİ.
--
-- GÜVENLİK MODELİ (özet)
--   * Hiçbir istemci bu tablolara DOĞRUDAN YAZAMAZ. Tüm yazma işlemleri
--     …000300 içindeki SECURITY DEFINER fonksiyonlarından geçer.
--   * `spaces` ve `participants` yalnızca odanın katılımcısı tarafından OKUNUR.
--   * `invitations` hiçbir istemci tarafından OKUNAMAZ (politika yok + revoke).
--
--   Böylece şu gereksinimler karşılanır:
--     - kullanıcı kendini doğrudan INSERT ile katılımcı yapamaz
--     - kullanıcı rol değiştiremez (UPDATE politikası yok)
--     - kullanıcı davet hash'lerini göremez
--     - kullanıcı ilgisiz odaları okuyamaz/değiştiremez
--     - istemci tarafı yazımla iki kişi sınırı aşılamaz (yazım zaten yok)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Yardımcı: özyinelemesiz katılımcı kontrolü
--
-- NEDEN GEREKLİ: `participants` tablosu üzerindeki bir politikanın gövdesinde
-- yine `participants` sorgulamak sonsuz özyineleme hatası verir. SECURITY
-- DEFINER bir yardımcı fonksiyon RLS'i atlayarak bu döngüyü kırar.
-- -----------------------------------------------------------------------------

create or replace function public.is_space_participant(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.participants p
    where p.space_id = p_space_id
      and p.user_id = (select auth.uid())
  );
$$;

comment on function public.is_space_participant(uuid) is
  'SECURITY DEFINER: RLS politikalarında kullanılmak üzere, çağıran kullanıcının verilen odanın katılımcısı olup olmadığını döndürür. participants politikalarındaki özyinelemeyi kırmak için gereklidir. Yalnızca boolean döndürür; hiçbir satır içeriği sızdırmaz.';

revoke all on function public.is_space_participant(uuid) from public;
revoke all on function public.is_space_participant(uuid) from anon;
grant execute on function public.is_space_participant(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Tablo ayrıcalıkları (RLS'e ek olarak, derinlemesine savunma)
--
-- RLS tek başına yeterlidir; ancak yazma ayrıcalıklarını da geri almak,
-- "doğrudan istemci yazımı yoktur" niyetini ayrıcalık seviyesinde açık kılar.
-- SECURITY DEFINER fonksiyonlar sahibi (postgres) olarak çalıştığı için
-- bu revoke'lardan etkilenmez.
-- -----------------------------------------------------------------------------

revoke insert, update, delete on public.spaces       from anon, authenticated;
revoke insert, update, delete on public.participants from anon, authenticated;
revoke all                    on public.invitations  from anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS etkinleştirme
-- -----------------------------------------------------------------------------

alter table public.spaces       enable row level security;
alter table public.participants enable row level security;
alter table public.invitations  enable row level security;

-- Tablo sahibinin bile politikaları atlamasını engelle (Supabase'de tabloların
-- sahibi postgres'tir; SECURITY DEFINER fonksiyonlar için FORCE uygulanmaz
-- çünkü onlar zaten sahibi olarak çalışır ve bilinçli olarak muaf tutulur).
-- Not: FORCE burada bilinçli olarak KULLANILMAZ; kullanılırsa …000300'deki
-- fonksiyonlar da politikalara takılır ve tasarım çalışmaz.

-- -----------------------------------------------------------------------------
-- spaces politikaları
-- -----------------------------------------------------------------------------

drop policy if exists spaces_select_participants on public.spaces;
create policy spaces_select_participants
  on public.spaces
  for select
  to authenticated
  using (public.is_space_participant(id));

comment on policy spaces_select_participants on public.spaces is
  'Bir oda ancak kullanıcı o odanın katılımcısı OLDUKTAN SONRA okunabilir. Davet linkine sahip olmak tek başına okuma yetkisi vermez.';

-- INSERT / UPDATE / DELETE politikası bilinçli olarak YOKTUR.
-- Politikası olmayan işlem RLS altında reddedilir.

-- -----------------------------------------------------------------------------
-- participants politikaları
-- -----------------------------------------------------------------------------

drop policy if exists participants_select_same_space on public.participants;
create policy participants_select_same_space
  on public.participants
  for select
  to authenticated
  using (public.is_space_participant(space_id));

comment on policy participants_select_same_space on public.participants is
  'Katılımcılar yalnızca KENDİ odalarının katılımcı listesini okuyabilir. Partnerin katılıp katılmadığı bu politika üzerinden görülür.';

-- INSERT / UPDATE / DELETE politikası bilinçli olarak YOKTUR:
--   * INSERT yok  -> kullanıcı kendini odaya ekleyemez
--   * UPDATE yok  -> kullanıcı rolünü host'a yükseltemez
--   * DELETE yok  -> kullanıcı partnerini odadan atamaz

-- -----------------------------------------------------------------------------
-- invitations politikaları
-- -----------------------------------------------------------------------------

-- HİÇBİR POLİTİKA TANIMLANMAZ.
-- RLS etkin + politika yok = her istemci için tam erişim reddi.
-- Davet hash'leri yalnızca …000300'deki SECURITY DEFINER fonksiyonlar
-- tarafından okunabilir.

comment on table public.invitations is
  'Oda davetleri. RLS etkin ve BİLİNÇLİ OLARAK HİÇ POLİTİKA YOKTUR: hiçbir istemci token_hash okuyamaz veya yazamaz. Yalnızca SECURITY DEFINER fonksiyonlar erişir.';
