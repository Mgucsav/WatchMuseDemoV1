-- =============================================================================
-- Abonelik beyanı ve ORTAK PLATFORM kesişimi
--
-- Kapsam: beyan zorunluluğu · geçersiz beyan · turla saklanan ortak küme ·
-- geçmişten tekrarın ALT KÜME kuralı · kendi beyanını güncelleme yetkisi.
--
-- NOT: "bu film gerçekten Netflix'te mi" sorusu burada test EDİLEMEZ; katalog
-- bilgisi veritabanında yoktur ve filtre TMDb keşif isteğinde uygulanır.
-- Burada test edilen, veritabanının uygulayabildiği kurallardır.
-- =============================================================================

begin;

do $$
declare
  v_a uuid := wm_test.new_user('subs-a@test.invalid');
  v_b uuid := wm_test.new_user('subs-b@test.invalid');
  v_space uuid;
  v_round1 uuid;
  v_round2 uuid;
  v_old_movie integer;
  v_pool jsonb;
  v_keys text[];
  v_repeat_count integer;
  v_total integer;
begin
  v_space := wm_test.new_space(v_a, v_b);
  perform wm_test.act_as(null);

  -------------------------------------------------------------------------
  -- Tur, toplandığı ORTAK kümeyi saklar
  -------------------------------------------------------------------------
  v_round1 := public.start_next_space_round(
    v_space, v_a, wm_test.candidate_pool(30, 910000), wm_test.seed(),
    'reusable-room-v1', 'seeded-random-v1', false,
    wm_test.provider_keys()
  );

  select provider_keys into v_keys from public.space_rounds where id = v_round1;
  perform wm_test.assert(
    v_keys = wm_test.provider_keys(),
    'tur, toplandigi ORTAK kumeyi saklamali'
  );

  -------------------------------------------------------------------------
  -- Ortak küme olmadan tur AÇILAMAZ
  -------------------------------------------------------------------------
  update public.space_rounds set status = 'no_match' where id = v_round1;

  perform wm_test.assert_raises(
    format(
      'select public.start_next_space_round(%L::uuid, %L::uuid, %L::jsonb, %L, %L, %L, false, %L::text[])',
      v_space, v_a, wm_test.candidate_pool(30, 920000)::text,
      wm_test.seed(), 'reusable-room-v1', 'seeded-random-v1',
      array[]::text[]
    ),
    'no_shared_subscriptions',
    'ortak abonelik olmadan tur ACILMAMALI'
  );

  perform wm_test.assert_raises(
    format(
      'select public.start_next_space_round(%L::uuid, %L::uuid, %L::jsonb, %L, %L, %L, false, %L::text[])',
      v_space, v_a, wm_test.candidate_pool(30, 920000)::text,
      wm_test.seed(), 'reusable-room-v1', 'seeded-random-v1',
      array['NETFLIX']::text[]
    ),
    'invalid_subscriptions',
    'bicimsiz abonelik anahtari TANIMLI hata uretmeli'
  );

  perform wm_test.assert(
    not exists (
      select 1 from public.space_rounds
      where space_id = v_space and id <> v_round1
    ),
    'basarisiz denemede HICBIR tur yazilmamali'
  );

  -------------------------------------------------------------------------
  -- Geçmişten tekrar: yalnızca ALT KÜMEYLE toplanmış turlar
  --
  -- Havuz 9 taze film + tur 1'den bilinen 1 film içerir. Repeat kapısı açıktır,
  -- yani onuncu slot ancak tekrar ile dolabilir.
  -------------------------------------------------------------------------
  select tmdb_movie_id into v_old_movie
  from public.room_candidates where round_id = v_round1 order by position limit 1;

  v_pool := wm_test.candidate_pool(9, 930000) || jsonb_build_array(
    jsonb_build_object(
      'tmdbMovieId', v_old_movie, 'title', 'Tur 1 filmi',
      'originalTitle', null, 'posterPath', '/old.jpg',
      'overview', 'x', 'releaseYear', '2020', 'voteAverage', '7.0'
    )
  );

  -- Ortak küme DARALDI: tur 1 {netflix, prime_video} ile toplanmıştı; bu küme
  -- {netflix} kümesinin alt kümesi DEĞİLDİR. O filmin hangi platformdan geldiği
  -- bilinmediği için tekrar edilemez ve havuz 10'a tamamlanamaz.
  perform wm_test.assert_raises(
    format(
      'select public.start_next_space_round(%L::uuid, %L::uuid, %L::jsonb, %L, %L, %L, true, %L::text[])',
      v_space, v_a, v_pool::text,
      wm_test.seed(), 'reusable-room-v1', 'seeded-random-v1',
      array['netflix']::text[]
    ),
    'candidate_pool_incomplete',
    'daralan ortak kumede ESKI tur filmi tekrar EDILEMEMELI'
  );

  -- Aynı havuz, aynı kümeyle: tekrar artık uygundur.
  v_round2 := public.start_next_space_round(
    v_space, v_a, v_pool, wm_test.seed(),
    'reusable-room-v1', 'seeded-random-v1', true,
    wm_test.provider_keys()
  );

  select count(*) into v_total from public.room_candidates where round_id = v_round2;
  perform wm_test.assert(v_total = 10, 'tur 2 TAM 10 aday icermeli');

  select count(*) into v_repeat_count
  from public.room_candidates
  where round_id = v_round2 and selection_reason = 'eligible_repeat';
  perform wm_test.assert(
    v_repeat_count = 1,
    'ayni ortak kumede ESKI tur filmi tekrar EDILEBILMELI'
  );

  raise notice 'OK: 08_subscription_intersection (tur kumesi)';
end;
$$;

do $$
declare
  v_a uuid := wm_test.new_user('subs-c@test.invalid');
  v_b uuid := wm_test.new_user('subs-d@test.invalid');
  v_outsider uuid := wm_test.new_user('subs-x@test.invalid');
  v_space uuid;
  v_hash text := repeat('a', 64);
  v_subs text[];
begin
  v_space := wm_test.new_space(v_a, v_b);

  -------------------------------------------------------------------------
  -- Oda oluşturma: beyan zorunlu, eski imza kapalı
  -------------------------------------------------------------------------
  perform wm_test.act_as(v_a);

  perform wm_test.assert_raises(
    format('select public.create_space(%L)', v_hash),
    'subscriptions_required',
    'eski create_space imzasi ODA ACMAMALI'
  );

  perform wm_test.assert_raises(
    format('select public.create_space(%L, %L::text[])', v_hash, array[]::text[]),
    'subscriptions_required',
    'bos beyanla oda ACILMAMALI'
  );

  perform wm_test.assert_raises(
    format(
      'select public.join_space_with_invitation(%L)',
      repeat('b', 64)
    ),
    'subscriptions_required',
    'eski join imzasi ODAYA KATMAMALI'
  );

  -------------------------------------------------------------------------
  -- Kendi beyanını güncelleme
  -------------------------------------------------------------------------
  perform public.set_participant_subscriptions(v_space, array['netflix', 'mubi']);

  select subscriptions into v_subs
  from public.participants where space_id = v_space and user_id = v_a;
  perform wm_test.assert(
    v_subs = array['netflix', 'mubi']::text[],
    'cagiran KENDI beyanini guncelleyebilmeli'
  );

  select subscriptions into v_subs
  from public.participants where space_id = v_space and user_id = v_b;
  perform wm_test.assert(
    v_subs = wm_test.provider_keys(),
    'partnerin beyani DEGISMEMELI'
  );

  perform wm_test.assert_raises(
    format(
      'select public.set_participant_subscriptions(%L::uuid, %L::text[])',
      v_space, array[]::text[]
    ),
    'subscriptions_required',
    'bos beyan REDDEDILMELI'
  );

  -- Yabancı kullanıcı: odanın varlığı bile sızdırılmaz.
  perform wm_test.act_as(v_outsider);
  perform wm_test.assert_raises(
    format(
      'select public.set_participant_subscriptions(%L::uuid, %L::text[])',
      v_space, array['netflix']::text[]
    ),
    'invalid_invitation',
    'yabanci kullanici beyan YAZAMAMALI'
  );

  -- Oturum yoksa reddedilir.
  perform wm_test.act_as(null);
  perform wm_test.assert_raises(
    format(
      'select public.set_participant_subscriptions(%L::uuid, %L::text[])',
      v_space, array['netflix']::text[]
    ),
    'unauthenticated',
    'oturumsuz beyan REDDEDILMELI'
  );

  raise notice 'OK: 08_subscription_intersection (beyan yetkisi)';
end;
$$;

rollback;
