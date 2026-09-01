-- =============================================================================
-- WatchMuse — oda abonelikleri ve ORTAK PLATFORM kesişimi
--
-- Sıra: 20260813000100_reusable_rounds.sql SONRASI. Önceki migration dosyaları
-- değiştirilmez.
--
-- -----------------------------------------------------------------------------
-- NE DEĞİŞİYOR
-- -----------------------------------------------------------------------------
-- Her katılımcı odaya girerken (kuran kişi oluştururken, misafir daveti
-- tüketirken) hangi platformlara abone olduğunu bildirir. Tur adayları
-- YALNIZCA iki katılımcının ORTAK platformlarından toplanır.
--
--   * `participants.subscriptions` — kişinin beyanı
--   * `space_rounds.provider_keys` — o turun toplandığı ORTAK küme
--
-- -----------------------------------------------------------------------------
-- GÜVEN SINIRI — veritabanı neyi doğrular, neyi doğrulayamaz?
-- -----------------------------------------------------------------------------
-- Veritabanında TMDb katalog verisi YOKTUR; bu yüzden "bu film gerçekten
-- Netflix'te mi" sorusu burada yanıtlanamaz. Sağlayıcı filtresi TMDb keşif
-- isteğinin kendisinde uygulanır (`with_watch_providers` + `watch_region` +
-- `with_watch_monetization_types=flatrate`).
--
-- Veritabanının uygulayabildiği kural şudur: bir tur hangi ortak kümeyle
-- toplandıysa o küme kaydedilir; GEÇMİŞTEN tekrar aday alınırken yalnızca
-- bugünün ortak kümesinin ALT KÜMESİYLE toplanmış turlar kullanılabilir
-- (`provider_keys <@ p_provider_keys`). Böylece bir abonelik bırakıldığında
-- eski turlardan gelen film sessizce geri dönemez.
--
-- -----------------------------------------------------------------------------
-- BAKIM PENCERESİ (RR-03 ile aynı desen)
-- -----------------------------------------------------------------------------
-- `create_space` ve `join_space_with_invitation` artık abonelik listesi ister.
-- Eski tek argümanlı imzalar KALDIRILMAZ; çağrıldıklarında
-- `subscriptions_required` domain hatası verirler. Böylece eski bir istemci
-- "function does not exist" yerine anlaşılır bir mesaj alır, ama aboneliği
-- bilinmeyen bir oda ASLA oluşturulamaz.
--
-- -----------------------------------------------------------------------------
-- HATA SÖZLEŞMESİ (bu dosyanın eklediği kodlar)
-- -----------------------------------------------------------------------------
--   subscriptions_required | invalid_subscriptions | no_shared_subscriptions
-- =============================================================================

-- Abonelik anahtarı doğrulaması — TEK kaynak -----------------------------------
--
-- Anahtar kümesinin KENDİSİ bilinçli olarak burada listelenmez: platform
-- kataloğu uygulama kodundadır (`src/lib/tmdb/constants.ts`) ve orada büyür.
-- Veritabanı yalnızca biçimi, tekilliği ve üst sınırı garanti eder; böylece
-- katalog her büyüdüğünde yeni bir migration gerekmez.
--
-- NULL DÖNMEZ: check constraint içinde NULL "geçti" sayılacağı için sonuç daima
-- coalesce ile boolean'a indirgenir.
create or replace function public.is_valid_subscription_keys(p_keys text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    coalesce(pg_catalog.array_length(p_keys, 1), 0) between 1 and 20
    and coalesce(pg_catalog.array_ndims(p_keys), 1) = 1
    and not exists (
      select 1
      from pg_catalog.unnest(p_keys) as entry(key)
      where entry.key is null
         or entry.key !~ '^[a-z][a-z0-9_]{1,31}$'
    )
    and (
      select pg_catalog.count(*)
      from (
        select distinct entry.key
        from pg_catalog.unnest(p_keys) as entry(key)
      ) as unique_keys
    ) = coalesce(pg_catalog.array_length(p_keys, 1), 0),
    false
  );
$$;

comment on function public.is_valid_subscription_keys(text[]) is
  'IMMUTABLE saf dogrulama: bos olmayan, tekil, en fazla 20 elemanli ve ^[a-z][a-z0-9_]{1,31}$ bicimine uyan abonelik anahtari dizisi. Asla NULL dondurmez. Platform katalogunun kendisi uygulama kodundadir.';

-- participants.subscriptions ---------------------------------------------------
--
-- Boş dizi BİLİNÇLİ olarak kabul edilir: bu migration'dan önce oluşmuş
-- katılımcıların beyanı yoktur. Boş beyan "henüz seçilmedi" demektir; kesişim
-- boş kalacağı için o odada yeni tur başlatılamaz ve arayüz seçim ister.
alter table public.participants
  add column if not exists subscriptions text[] not null default '{}'::text[];

alter table public.participants
  drop constraint if exists participants_subscriptions_valid,
  add constraint participants_subscriptions_valid check (
    subscriptions = '{}'::text[]
    or public.is_valid_subscription_keys(subscriptions)
  );

comment on column public.participants.subscriptions is
  'Katilimcinin beyan ettigi abonelik platformlari. Tur adaylari iki katilimcinin KESISIMINDEN toplanir. Bos dizi = beyan yok (migration oncesi satirlar); bu durumda tur baslatilamaz.';

-- space_rounds.provider_keys ---------------------------------------------------
--
-- Turun hangi ORTAK kümeyle toplandığı. Legacy turlar bilinmeyen bir kümeyle
-- toplanmıştır; `legacy_unknown` sentinel'i onları tekrar havuzundan yapısal
-- olarak dışarıda tutar (alt küme testi hiçbir gerçek katalog anahtarıyla
-- eşleşmez).
alter table public.space_rounds
  add column if not exists provider_keys text[] not null default '{}'::text[];

update public.space_rounds
set provider_keys = array['legacy_unknown']::text[]
where provider_keys = '{}'::text[];

-- Varsayılan kaldırılır: sağlayıcı kümesi HER turda açıkça yazılmalıdır.
alter table public.space_rounds
  alter column provider_keys drop default;

alter table public.space_rounds
  drop constraint if exists space_rounds_provider_keys_valid,
  add constraint space_rounds_provider_keys_valid
    check (public.is_valid_subscription_keys(provider_keys));

comment on column public.space_rounds.provider_keys is
  'Bu turun toplandigi ORTAK abonelik kumesi. Gecmisten tekrar aday alinirken alt kume testi (provider_keys <@ bugunun ortak kumesi) uygulanir. Legacy turlar legacy_unknown tasir.';

-- create_space: abonelik beyanıyla ---------------------------------------------

create or replace function public.create_space(
  p_token_hash text,
  p_subscriptions text[]
)
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

  insert into public.spaces (status, created_by)
  values ('active'::public.space_status, v_user_id)
  returning id into v_space_id;

  insert into public.participants (space_id, user_id, role, subscriptions)
  values (
    v_space_id, v_user_id, 'host'::public.participant_role, p_subscriptions
  );

  insert into public.invitations (space_id, token_hash, expires_at, created_by)
  values (v_space_id, p_token_hash, now() + c_invitation_ttl, v_user_id);

  return v_space_id;
end;
$$;

comment on function public.create_space(text, text[]) is
  'SECURITY DEFINER. Oda, host katilimcisi (abonelik beyaniyla) ve daveti tek transaction icinde olusturur. Yalnizca SHA-256 hash (hex) kabul eder; duz metin token asla saklanmaz. Abonelik listesi bos olamaz.';

-- join_space_with_invitation: abonelik beyanıyla -------------------------------

create or replace function public.join_space_with_invitation(
  p_token_hash text,
  p_subscriptions text[]
)
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
    -- Biçimsiz hash, var olmayan davetle aynı genel hatayı verir.
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  if p_subscriptions is null
     or coalesce(pg_catalog.array_length(p_subscriptions, 1), 0) = 0 then
    raise exception 'subscriptions_required' using errcode = '22023';
  end if;

  if not public.is_valid_subscription_keys(p_subscriptions) then
    raise exception 'invalid_subscriptions' using errcode = '22023';
  end if;

  -- 1) Daveti KİLİTLE.
  select * into v_invitation
  from public.invitations i
  where i.token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  -- 2) Odayı KİLİTLE.
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
  select p.role into v_existing
  from public.participants p
  where p.space_id = v_invitation.space_id
    and p.user_id = v_user_id;

  if found then
    if v_existing = 'host'::public.participant_role then
      raise exception 'host_cannot_join' using errcode = 'P0001';
    end if;

    -- Zaten misafir: idempotent başarı. Beyan tazelenir; üyelik değişmez.
    update public.participants p
    set subscriptions = p_subscriptions
    where p.space_id = v_invitation.space_id
      and p.user_id = v_user_id;

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

  -- 5) Üçüncü katılımcı reddi.
  select count(*) into v_participants
  from public.participants p
  where p.space_id = v_invitation.space_id;

  if v_participants >= 2 then
    raise exception 'room_full' using errcode = 'P0001';
  end if;

  -- 6) Guest olarak ekle
  begin
    insert into public.participants (space_id, user_id, role, subscriptions)
    values (
      v_invitation.space_id,
      v_user_id,
      'guest'::public.participant_role,
      p_subscriptions
    );
  exception
    when unique_violation then
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

comment on function public.join_space_with_invitation(text, text[]) is
  'SECURITY DEFINER. Daveti atomik olarak tuketir ve cagiran kullaniciyi abonelik beyaniyla guest olarak ekler. Tekrar gelen misafirin beyani tazelenir; uyelik ve davet durumu degismez. Abonelik listesi bos olamaz.';

-- Eski imzalar: oda açmayan, anlaşılır hata veren kapılar ----------------------
--
-- İmza KORUNUR ki eski bir istemci "function does not exist" yerine domain
-- hatası alsın; ama aboneliği bilinmeyen bir oda oluşturulamaz.

create or replace function public.create_space(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Parametre bilinçli olarak kullanılmaz.
  perform p_token_hash;
  raise exception 'subscriptions_required' using errcode = '22023';
end;
$$;

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
begin
  perform p_token_hash;
  raise exception 'subscriptions_required' using errcode = '22023';
end;
$$;

comment on function public.create_space(text) is
  'KULLANIM DISI. Abonelik beyani olmadan oda olusturulamaz; subscriptions_required domain hatasi firlatir. Yeni imza: create_space(text, text[]).';

comment on function public.join_space_with_invitation(text) is
  'KULLANIM DISI. Abonelik beyani olmadan odaya katilinamaz; subscriptions_required domain hatasi firlatir. Yeni imza: join_space_with_invitation(text, text[]).';

-- Katılımcının kendi beyanını güncellemesi -------------------------------------
--
-- Yalnızca `auth.uid()` satırı güncellenir: bir katılımcı partnerinin beyanını
-- değiştiremez. AKTİF TUR ETKİLENMEZ — o turun adayları zaten kalıcıdır; yeni
-- kesişim bir sonraki turdan itibaren geçerlidir.
create or replace function public.set_participant_subscriptions(
  p_space_id uuid,
  p_subscriptions text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_status  public.space_status;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if p_subscriptions is null
     or coalesce(pg_catalog.array_length(p_subscriptions, 1), 0) = 0 then
    raise exception 'subscriptions_required' using errcode = '22023';
  end if;

  if not public.is_valid_subscription_keys(p_subscriptions) then
    raise exception 'invalid_subscriptions' using errcode = '22023';
  end if;

  select s.status into v_status
  from public.spaces s
  where s.id = p_space_id;

  if not found then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  if v_status <> 'active'::public.space_status then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;

  -- Üye olmayan için odanın varlığı sızdırılmaz: aşağıdaki UPDATE hiçbir satır
  -- bulmaz ve aynı genel hata döner.
  update public.participants p
  set subscriptions = p_subscriptions
  where p.space_id = p_space_id
    and p.user_id = v_user_id;

  if not found then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.set_participant_subscriptions(uuid, text[]) is
  'SECURITY DEFINER. Yalnizca cagiranin kendi abonelik beyanini gunceller; partnerin satirina dokunmaz. Aktif turu degistirmez.';

-- Yeni tur: ortak abonelik kümesiyle -------------------------------------------
--
-- İmza değişti (`p_provider_keys` eklendi). Eski imza DÜŞÜRÜLÜR: sağlayıcı
-- kümesi olmadan tur açan bir yol geride BIRAKILMAZ. Eski imza yalnızca
-- service_role'a açıktı, bu yüzden düşürmek istemci yüzeyini etkilemez.
drop function if exists public.start_next_space_round(
  uuid, uuid, jsonb, text, text, text, boolean
);

create or replace function public.start_next_space_round(
  p_space_id uuid,
  p_actor_id uuid,
  p_candidates jsonb,
  p_selection_seed text,
  p_policy_version text,
  p_ranker_version text,
  p_allow_eligible_repeats boolean,
  p_provider_keys text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space public.spaces%rowtype;
  v_active_round public.space_rounds%rowtype;
  v_round_id uuid;
  v_round_number integer;
  v_final jsonb := '[]'::jsonb;
  v_seen_ids integer[] := '{}';
  v_reserved_priority_ids integer[] := '{}';
  v_invalid_count integer;
  v_reserved_slots integer := 0;
  v_fresh_count integer := 0;
  v_passes text[];
  v_pass text;
  v_item record;
  v_position integer;
  v_raw jsonb;
begin
  if p_actor_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select * into v_space
  from public.spaces s
  where s.id = p_space_id
  for update;

  if not found or v_space.status <> 'active'::public.space_status then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.participants p
    where p.space_id = p_space_id and p.user_id = p_actor_id
  ) then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  if (select count(*) from public.participants p where p.space_id = p_space_id) <> 2 then
    raise exception 'round_not_ready' using errcode = 'P0001';
  end if;

  select * into v_active_round
  from public.space_rounds r
  where r.space_id = p_space_id
    and r.status in (
      'voting'::public.space_round_status,
      'matching'::public.space_round_status,
      'spinning'::public.space_round_status
    )
  order by r.round_number desc
  limit 1;

  if found then
    return v_active_round.id;
  end if;

  if p_selection_seed is null
     or pg_catalog.char_length(p_selection_seed) not between 16 and 128
     or p_policy_version is null
     or p_policy_version !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
     or p_ranker_version is null
     or p_ranker_version !~ '^[a-z0-9][a-z0-9._-]{0,63}$' then
    raise exception 'invalid_candidates' using errcode = '22023';
  end if;

  -- Ortak abonelik kumesi zorunludur. Bos kume, filtresiz bir kesif havuzunun
  -- kaydedilmesi anlamina gelirdi; bu yol bilincli olarak kapalidir.
  if p_provider_keys is null
     or coalesce(pg_catalog.array_length(p_provider_keys, 1), 0) = 0 then
    raise exception 'no_shared_subscriptions' using errcode = 'P0001';
  end if;

  if not public.is_valid_subscription_keys(p_provider_keys) then
    raise exception 'invalid_subscriptions' using errcode = '22023';
  end if;

  if p_candidates is null
     or jsonb_typeof(p_candidates) <> 'array'
     or jsonb_array_length(p_candidates) < 10
     or jsonb_array_length(p_candidates) > 200
     or pg_catalog.octet_length(p_candidates::text) > 1000000 then
    raise exception 'candidate_pool_incomplete' using errcode = '22023';
  end if;

  -- Girdi doğrulaması YALNIZCA regex kullanır; bu boolean ifadenin içinde
  -- hiçbir cast yoktur. Bozuk sayısal alan, kontrolsüz cast exception'ı yerine
  -- tanımlı `invalid_candidates` domain hatası üretir.
  select count(*) into v_invalid_count
  from pg_catalog.jsonb_array_elements(p_candidates) as e(value)
  where e.value ->> 'tmdbMovieId' is null
     or e.value ->> 'tmdbMovieId' !~ '^[1-9][0-9]{0,8}$'
     or nullif(pg_catalog.btrim(coalesce(e.value ->> 'title', '')), '') is null
     or pg_catalog.char_length(pg_catalog.btrim(coalesce(e.value ->> 'title', ''))) > 300
     or pg_catalog.char_length(coalesce(e.value ->> 'originalTitle', '')) > 300
     or pg_catalog.char_length(coalesce(e.value ->> 'overview', '')) > 5000
     or (
       nullif(pg_catalog.btrim(coalesce(e.value ->> 'posterPath', '')), '') is not null
       and pg_catalog.btrim(e.value ->> 'posterPath') !~ '^/[^[:space:]]+$'
     )
     or (
       nullif(e.value ->> 'releaseYear', '') is not null
       and e.value ->> 'releaseYear' !~ '^(1[89][0-9]{2}|20[0-9]{2}|21[0-9]{2}|2200)$'
     )
     or (
       nullif(e.value ->> 'voteAverage', '') is not null
       and e.value ->> 'voteAverage' !~ '^(10([.]0+)?|[0-9]([.][0-9]+)?)$'
     );

  if v_invalid_count > 0 then
    raise exception 'invalid_candidates' using errcode = '22023';
  end if;

  ---------------------------------------------------------------------------
  -- 1) priority_return — rezerve slot tavanı 9
  ---------------------------------------------------------------------------
  for v_item in
    with qualifying as (
      select distinct on (c.tmdb_movie_id)
        c.tmdb_movie_id,
        c.title,
        c.original_title,
        c.poster_path,
        c.overview,
        c.release_year,
        c.tmdb_vote_average,
        r.round_number,
        coalesce(r.spin_started_at, r.updated_at) as eligible_at
      from public.space_rounds r
      join public.room_candidates c on c.round_id = r.id
      where r.space_id = p_space_id
        and r.status = 'result'::public.space_round_status
        -- Gecmis tur, bugunku ortak kumenin ALT KUMESIYLE toplanmis olmalidir.
        -- Aksi halde o turdaki film artik paylasilmayan bir platformdan gelmis
        -- olabilir ve iki taraf da izleyemez.
        and r.provider_keys <@ p_provider_keys
        and r.winner_candidate_id is distinct from c.id
        and coalesce(r.spin_started_at, r.updated_at)
            > pg_catalog.clock_timestamp() - interval '14 days'
        and (
          select count(*)
          from public.room_votes v
          where v.round_id = r.id
            and v.candidate_id = c.id
            and v.choice = 'want'::public.space_round_vote
        ) = 2
      order by c.tmdb_movie_id, r.round_number desc
    )
    select q.*
    from qualifying q
    where not exists (
      select 1
      from public.room_candidates consumed
      join public.space_rounds consumed_round on consumed_round.id = consumed.round_id
      where consumed.tmdb_movie_id = q.tmdb_movie_id
        and consumed.selection_reason = 'priority_return'
        and consumed_round.space_id = p_space_id
        and consumed_round.round_number > q.round_number
    )
    and not public.is_movie_hard_suppressed(p_space_id, q.tmdb_movie_id)
    order by q.eligible_at, q.tmdb_movie_id
  loop
    v_reserved_priority_ids := array_append(v_reserved_priority_ids, v_item.tmdb_movie_id);

    exit when v_reserved_slots >= 9 or jsonb_array_length(v_final) >= 10;

    v_final := v_final || jsonb_build_array(jsonb_build_object(
      'tmdbMovieId', v_item.tmdb_movie_id,
      'title', v_item.title,
      'originalTitle', v_item.original_title,
      'posterPath', v_item.poster_path,
      'overview', v_item.overview,
      'releaseYear', v_item.release_year,
      'voteAverage', v_item.tmdb_vote_average,
      'selectionReason', 'priority_return'
    ));
    v_seen_ids := array_append(v_seen_ids, v_item.tmdb_movie_id);
    v_reserved_slots := v_reserved_slots + 1;
  end loop;

  ---------------------------------------------------------------------------
  -- 2) fresh_discovery, sonra 3) eligible_repeat (yalnızca gate açıkken)
  --
  -- Her geçiş kendi reason'ını yazar. `fresh_discovery` bu space'in TÜM
  -- geçmişini dışlar; yalnızca bir önceki turu değil.
  ---------------------------------------------------------------------------
  v_passes := case
    when p_allow_eligible_repeats then array['fresh_discovery', 'eligible_repeat']
    else array['fresh_discovery']
  end;

  foreach v_pass in array v_passes
  loop
    for v_item in
      with parsed as (
        select
          candidate.value as raw,
          candidate.ordinal_position,
          -- Cast YALNIZCA regex'in doğrulandığı CASE dalının içinde yapılır.
          case when candidate.value ->> 'tmdbMovieId' ~ '^[1-9][0-9]{0,8}$'
            then (candidate.value ->> 'tmdbMovieId')::integer
          end as movie_id,
          case when candidate.value ->> 'releaseYear'
                    ~ '^(1[89][0-9]{2}|20[0-9]{2}|21[0-9]{2}|2200)$'
            then (candidate.value ->> 'releaseYear')::smallint
          end as release_year,
          case when candidate.value ->> 'voteAverage'
                    ~ '^(10([.]0+)?|[0-9]([.][0-9]+)?)$'
            then (candidate.value ->> 'voteAverage')::numeric(3,1)
          end as vote_average
        from pg_catalog.jsonb_array_elements(p_candidates) with ordinality
          as candidate(value, ordinal_position)
      ), valid as (
        select distinct on (p.movie_id)
          p.raw, p.movie_id, p.ordinal_position, p.release_year, p.vote_average
        from parsed p
        where p.movie_id is not null
        order by p.movie_id, p.ordinal_position
      ), seen_before as (
        select distinct prior_candidate.tmdb_movie_id as movie_id
        from public.space_rounds prior_round
        join public.room_candidates prior_candidate
          on prior_candidate.round_id = prior_round.id
        where prior_round.space_id = p_space_id
      ), repeatable_before as (
        -- `seen_before` "daha once gosterildi mi" sorusunu yanitlar ve TUM
        -- gecmisi kapsar. Tekrar EDILEBILIRLIK ise daha dardir: yalnizca
        -- bugunku ortak kumenin alt kumesiyle toplanmis turlar.
        select distinct prior_candidate.tmdb_movie_id as movie_id
        from public.space_rounds prior_round
        join public.room_candidates prior_candidate
          on prior_candidate.round_id = prior_round.id
        where prior_round.space_id = p_space_id
          and prior_round.provider_keys <@ p_provider_keys
      )
      select
        v.movie_id,
        pg_catalog.btrim(v.raw ->> 'title') as title,
        nullif(pg_catalog.btrim(coalesce(v.raw ->> 'originalTitle', '')), '') as original_title,
        nullif(pg_catalog.btrim(coalesce(v.raw ->> 'posterPath', '')), '') as poster_path,
        nullif(pg_catalog.btrim(coalesce(v.raw ->> 'overview', '')), '') as overview,
        v.release_year,
        v.vote_average
      from valid v
      where not (v.movie_id = any(v_seen_ids))
        and not (v.movie_id = any(v_reserved_priority_ids))
        and (
          case
            when v_pass = 'fresh_discovery'
              then not exists (select 1 from seen_before b where b.movie_id = v.movie_id)
            else exists (
              select 1 from repeatable_before b where b.movie_id = v.movie_id
            )
          end
        )
        and not public.is_movie_hard_suppressed(p_space_id, v.movie_id)
      -- Ranker yalnızca yukarıdaki hard eligibility filtrelerinden geçmiş
      -- satırları görür ve yeni film kimliği üretemez.
      order by pg_catalog.md5(p_selection_seed || ':' || v.movie_id::text), v.movie_id
    loop
      exit when jsonb_array_length(v_final) >= 10;
      exit when v_pass = 'eligible_repeat' and v_reserved_slots >= 9;

      v_final := v_final || jsonb_build_array(jsonb_build_object(
        'tmdbMovieId', v_item.movie_id,
        'title', v_item.title,
        'originalTitle', v_item.original_title,
        'posterPath', v_item.poster_path,
        'overview', v_item.overview,
        'releaseYear', v_item.release_year,
        'voteAverage', v_item.vote_average,
        'selectionReason', v_pass
      ));
      v_seen_ids := array_append(v_seen_ids, v_item.movie_id);

      if v_pass = 'fresh_discovery' then
        v_fresh_count := v_fresh_count + 1;
      else
        v_reserved_slots := v_reserved_slots + 1;
      end if;
    end loop;

    exit when jsonb_array_length(v_final) >= 10;
  end loop;

  ---------------------------------------------------------------------------
  -- Değişmez kural doğrulaması: tam 10 benzersiz + en az 1 gerçek keşif.
  -- Sağlanamıyorsa dürüstçe başarısız olunur; uygun olmayan film eklenmez.
  ---------------------------------------------------------------------------
  if jsonb_array_length(v_final) <> 10
     or cardinality(v_seen_ids) <> 10
     or v_fresh_count < 1
     or v_reserved_slots > 9 then
    raise exception 'candidate_pool_incomplete' using errcode = '22023';
  end if;

  select coalesce(max(r.round_number), 0) + 1 into v_round_number
  from public.space_rounds r
  where r.space_id = p_space_id;

  insert into public.space_rounds (
    space_id, round_number, selection_seed,
    selection_policy_version, ranker_version, provider_keys
  ) values (
    p_space_id, v_round_number, p_selection_seed,
    p_policy_version, p_ranker_version, p_provider_keys
  ) returning id into v_round_id;

  for v_position in 0..9 loop
    v_raw := v_final -> v_position;
    insert into public.room_candidates (
      round_id, position, tmdb_movie_id, title, original_title, poster_path,
      overview, release_year, tmdb_vote_average, selection_reason
    ) values (
      v_round_id,
      v_position + 1,
      (v_raw ->> 'tmdbMovieId')::integer,
      v_raw ->> 'title',
      nullif(v_raw ->> 'originalTitle', ''),
      nullif(v_raw ->> 'posterPath', ''),
      nullif(v_raw ->> 'overview', ''),
      nullif(v_raw ->> 'releaseYear', '')::smallint,
      nullif(v_raw ->> 'voteAverage', '')::numeric(3,1),
      v_raw ->> 'selectionReason'
    );
  end loop;

  return v_round_id;
end;
$$;

-- Yetkiler ---------------------------------------------------------------------
--
-- GÜVEN SINIRI (RR-02) korunur: aday planını kalıcılaştıran fonksiyon hiçbir
-- istemci rolüne açık değildir. Ortak abonelik kümesi de bu yüzden istemciden
-- dayatılamaz; sunucu onu oda durumundan türetir.

revoke all on function public.start_next_space_round(
  uuid, uuid, jsonb, text, text, text, boolean, text[]
) from public, anon, authenticated;

grant execute on function public.start_next_space_round(
  uuid, uuid, jsonb, text, text, text, boolean, text[]
) to service_role;

revoke all on function public.create_space(text) from public, anon;
revoke all on function public.create_space(text, text[]) from public, anon;
revoke all on function public.join_space_with_invitation(text) from public, anon;
revoke all on function public.join_space_with_invitation(text, text[])
  from public, anon;
revoke all on function public.set_participant_subscriptions(uuid, text[])
  from public, anon;

grant execute on function public.create_space(text, text[]) to authenticated;
grant execute on function public.join_space_with_invitation(text, text[])
  to authenticated;
grant execute on function public.set_participant_subscriptions(uuid, text[])
  to authenticated;

-- Eski imzalar çağrılabilir kalır ki eski istemci anlaşılır hata alsın.
grant execute on function public.create_space(text) to authenticated;
grant execute on function public.join_space_with_invitation(text) to authenticated;

comment on function public.start_next_space_round(uuid, uuid, jsonb, text, text, text, boolean, text[]) is
  'SECURITY DEFINER, yalnizca service_role. Gecmisi silmeden yeni tur acar. Aday havuzu iki katilimcinin ORTAK abonelik kumesinden toplanir; kume p_provider_keys ile gecilir ve turla birlikte saklanir. Gecmisten tekrar aday alinirken o turun kumesi bugunun kumesinin ALT KUMESI olmak zorundadir. Diger degismezler korunur: priority_return + eligible_repeat en fazla 9 slot, en az 1 gercek kesif, hard suppression son denemede bile acilmaz.';
