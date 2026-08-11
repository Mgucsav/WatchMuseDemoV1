-- =============================================================================
-- WatchMuse — 03/03: atomik oda fonksiyonları (RPC)
--
-- Sıra: …000100_rooms_schema.sql ve …000200_rooms_rls.sql SONRASI.
--
-- -----------------------------------------------------------------------------
-- GÜVEN SINIRI — düz metin token neden buraya hiç gelmiyor?
-- -----------------------------------------------------------------------------
-- Bu fonksiyonlar düz metin davet token'ını DEĞİL, yalnızca onun SHA-256
-- özetini (hex) alır. Hash'leme, güvenilen Next.js sunucu kodunda yapılır.
--
--   Tercih edilen tasarım:   [tarayıcı] --token--> [Next.js sunucu] --hash--> [Postgres]
--   Reddedilen alternatif:   [tarayıcı] --token--> [Next.js sunucu] --token-> [Postgres]
--
-- Gerekçe: düz metin token CANLI bir yetkilendirme bilgisidir. Fonksiyon
-- argümanı olarak veritabanına gönderilirse `log_statement`, yavaş sorgu
-- kaydı veya hata ayrıntısı gibi yollarla Postgres loglarına düşebilir.
-- Hash'i gönderdiğimizde düz metin, Next.js sunucu belleğinin dışına hiç
-- çıkmaz ve veritabanı hiçbir koşulda onu göremez.
--
-- Kabul edilen ödünleşim: hash bu RPC için "hamiline yazılı" bir bilgi haline
-- gelir — hash'i bilen daveti kullanabilir. Bu risk sınırlıdır çünkü:
--   * hash hiçbir istemciye okutulmaz (invitations üzerinde RLS politikası yok),
--   * SHA-256 ön görüntü dirençlidir; düz metni bilmeden hash üretilemez,
--   * kullanılmamış davetler 24 saatte sona erer.
-- İleride sertleştirme: SHA-256 yerine sunucu tarafında saklanan bir gizli
-- anahtarla HMAC-SHA256 kullanmak, veritabanı dökümü sızsa bile tekrar
-- kullanımı engeller. Bu aşamada gereksinim SHA-256 olduğu için uygulanmadı.
--
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER kullanımı
-- -----------------------------------------------------------------------------
-- Her iki fonksiyon da SECURITY DEFINER'dır ve bu ZORUNLUDUR: …000200'de
-- istemcilere hiçbir INSERT/UPDATE yetkisi verilmemiştir ve `invitations`
-- okunamaz. Yazma ve davet doğrulama yalnızca buradan geçebilir.
--
-- Uygulanan korumalar:
--   * `set search_path = ''` — arama yolu ele geçirilemez
--   * tüm nesneler şema nitelikli (public.…, auth.…)
--   * `auth.uid()` fonksiyon İÇİNDE doğrulanır
--   * PUBLIC ve anon'dan execute geri alınır; yalnızca authenticated'a verilir
--
-- -----------------------------------------------------------------------------
-- HATA SÖZLEŞMESİ
-- -----------------------------------------------------------------------------
-- Hatalar sabit, makine tarafından okunabilir ve GENEL mesajlarla fırlatılır.
-- İçlerinde SQL ayrıntısı, tablo adı, token veya hash BULUNMAZ:
--   unauthenticated | invalid_invitation | invitation_expired
--   invitation_already_used | room_full | host_cannot_join | room_closed
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_space: oda + host katılımcısı + davet, tek transaction'da
-- -----------------------------------------------------------------------------

create or replace function public.create_space(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id  uuid := (select auth.uid());
  v_space_id uuid;
  -- Davet ömrü BİLİNÇLİ OLARAK sunucuda sabittir; istemci uzatamaz.
  c_invitation_ttl constant interval := interval '24 hours';
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  -- Hash biçimi burada da doğrulanır: tablo kısıtına güvenmek yerine erken ve
  -- net bir hata veririz.
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_token_hash' using errcode = '22023';
  end if;

  insert into public.spaces (status, created_by)
  values ('active'::public.space_status, v_user_id)
  returning id into v_space_id;

  insert into public.participants (space_id, user_id, role)
  values (v_space_id, v_user_id, 'host'::public.participant_role);

  insert into public.invitations (space_id, token_hash, expires_at, created_by)
  values (v_space_id, p_token_hash, now() + c_invitation_ttl, v_user_id);

  -- Yalnızca oda kimliği döner. Düz metin token ne saklanır ne de döndürülür.
  return v_space_id;
end;
$$;

comment on function public.create_space(text) is
  'SECURITY DEFINER. Oda, host katılımcısı ve daveti tek transaction''da oluşturur. Yalnızca SHA-256 hash (hex) kabul eder; düz metin token asla saklanmaz veya döndürülmez. Davet ömrü sunucuda sabittir (24 saat). auth.uid() içeride doğrulanır.';

revoke all on function public.create_space(text) from public;
revoke all on function public.create_space(text) from anon;
grant execute on function public.create_space(text) to authenticated;

-- -----------------------------------------------------------------------------
-- join_space_with_invitation: daveti tüket ve guest ekle, tek transaction'da
-- -----------------------------------------------------------------------------

create or replace function public.join_space_with_invitation(p_token_hash text)
returns table (
  space_id       uuid,
  role           public.participant_role,
  already_member boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      uuid := (select auth.uid());
  v_invitation   public.invitations%rowtype;
  v_space_status public.space_status;
  v_existing     public.participant_role;
  v_participants integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    -- Biçimsiz hash, var olmayan davetle aynı genel hatayı verir: davet
    -- varlığı hakkında bilgi sızdırmamak için.
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  -- 1) Daveti KİLİTLE. Aynı davetle gelen eşzamanlı istekler burada sıraya
  --    girer; ikinci istek kilidi aldığında used_at'i dolu görür.
  select * into v_invitation
  from public.invitations i
  where i.token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  -- 2) Odayı KİLİTLE. Farklı davetlerle aynı odaya gelen eşzamanlı istekleri
  --    de sıraya sokar; katılımcı sayımı bu kilit altında güvenilirdir.
  select s.status into v_space_status
  from public.spaces s
  where s.id = v_invitation.space_id
  for update;

  if not found then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  if v_space_status <> 'active'::public.space_status then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;

  -- 3) Kullanıcı zaten bu odanın katılımcısı mı?
  --    Bu kontrol, davetin kullanılmış olmasından ÖNCE gelir: daveti kullanan
  --    misafirin sayfayı yenilemesi ya da geri gelmesi hata üretmemelidir.
  select p.role into v_existing
  from public.participants p
  where p.space_id = v_invitation.space_id
    and p.user_id = v_user_id;

  if found then
    if v_existing = 'host'::public.participant_role then
      -- Host kendi davetini misafir olarak tüketemez.
      raise exception 'host_cannot_join' using errcode = 'P0001';
    end if;

    -- Zaten misafir: idempotent başarı.
    space_id := v_invitation.space_id;
    role := v_existing;
    already_member := true;
    return next;
    return;
  end if;

  -- 4) Davet durumu
  if v_invitation.used_at is not null then
    raise exception 'invitation_already_used' using errcode = 'P0001';
  end if;

  if v_invitation.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;

  -- 5) Üçüncü katılımcı reddi. Oda kilidi altında sayıldığı için eşzamanlı
  --    isteklerde de doğrudur; unique(space_id, role) kısıtı ikinci savunmadır.
  select count(*) into v_participants
  from public.participants p
  where p.space_id = v_invitation.space_id;

  if v_participants >= 2 then
    raise exception 'room_full' using errcode = 'P0001';
  end if;

  -- 6) Guest olarak ekle
  begin
    insert into public.participants (space_id, user_id, role)
    values (v_invitation.space_id, v_user_id, 'guest'::public.participant_role);
  exception
    when unique_violation then
      -- Kısıt seviyesindeki son savunma: guest rolü çoktan dolmuş.
      raise exception 'room_full' using errcode = 'P0001';
  end;

  -- 7) Daveti AYNI transaction'da tüketilmiş işaretle
  update public.invitations
  set used_at = now(),
      used_by = v_user_id
  where id = v_invitation.id;

  space_id := v_invitation.space_id;
  role := 'guest'::public.participant_role;
  already_member := false;
  return next;
end;
$$;

comment on function public.join_space_with_invitation(text) is
  'SECURITY DEFINER. Daveti atomik olarak tüketir ve çağıran kullanıcıyı guest olarak ekler. Davet ve oda satırları FOR UPDATE ile kilitlenir; süre dolumu, tekrar kullanım, kapalı oda, host self-join ve üçüncü katılımcı reddedilir. Sonuç token_hash içermez. Hatalar genel ve sabittir.';

revoke all on function public.join_space_with_invitation(text) from public;
revoke all on function public.join_space_with_invitation(text) from anon;
grant execute on function public.join_space_with_invitation(text) to authenticated;
