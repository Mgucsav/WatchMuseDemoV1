-- =============================================================================
-- Girdi doğrulama (D)
--
-- Bozuk sayısal JSON alanı, kontrolsüz bir cast exception'ı değil TANIMLI bir
-- domain hatası üretmelidir.
-- =============================================================================

begin;

do $$
declare
  v_a uuid := wm_test.new_user('val-a@test.invalid');
  v_b uuid := wm_test.new_user('val-b@test.invalid');
  v_space uuid;
  v_seed text := wm_test.seed();
begin
  v_space := wm_test.new_space(v_a, v_b);
  perform wm_test.act_as(null);

  -- Sayısal olmayan tmdbMovieId
  perform wm_test.assert_raises(
    format(
      'select public.start_next_space_round(%L::uuid, %L::uuid, %L::jsonb, %L, %L, %L, false, %L::text[])',
      v_space, v_a,
      (wm_test.candidate_pool(15) || jsonb_build_array(jsonb_build_object(
        'tmdbMovieId', 'abc', 'title', 'Bozuk', 'posterPath', '/x.jpg'
      )))::text,
      v_seed, 'reusable-room-v1', 'seeded-random-v1',
      wm_test.provider_keys()
    ),
    'invalid_candidates',
    'sayisal olmayan tmdbMovieId TANIMLI hata uretmeli'
  );

  -- Sayısal olmayan voteAverage
  perform wm_test.assert_raises(
    format(
      'select public.start_next_space_round(%L::uuid, %L::uuid, %L::jsonb, %L, %L, %L, false, %L::text[])',
      v_space, v_a,
      (wm_test.candidate_pool(15) || jsonb_build_array(jsonb_build_object(
        'tmdbMovieId', 111111, 'title', 'Bozuk puan',
        'posterPath', '/x.jpg', 'voteAverage', 'cok-iyi'
      )))::text,
      v_seed, 'reusable-room-v1', 'seeded-random-v1',
      wm_test.provider_keys()
    ),
    'invalid_candidates',
    'sayisal olmayan voteAverage TANIMLI hata uretmeli'
  );

  -- Sayısal olmayan releaseYear
  perform wm_test.assert_raises(
    format(
      'select public.start_next_space_round(%L::uuid, %L::uuid, %L::jsonb, %L, %L, %L, false, %L::text[])',
      v_space, v_a,
      (wm_test.candidate_pool(15) || jsonb_build_array(jsonb_build_object(
        'tmdbMovieId', 222222, 'title', 'Bozuk yil',
        'posterPath', '/x.jpg', 'releaseYear', 'gecen sene'
      )))::text,
      v_seed, 'reusable-room-v1', 'seeded-random-v1',
      wm_test.provider_keys()
    ),
    'invalid_candidates',
    'sayisal olmayan releaseYear TANIMLI hata uretmeli'
  );

  -- Boş başlık
  perform wm_test.assert_raises(
    format(
      'select public.start_next_space_round(%L::uuid, %L::uuid, %L::jsonb, %L, %L, %L, false, %L::text[])',
      v_space, v_a,
      (wm_test.candidate_pool(15) || jsonb_build_array(jsonb_build_object(
        'tmdbMovieId', 333333, 'title', '   ', 'posterPath', '/x.jpg'
      )))::text,
      v_seed, 'reusable-room-v1', 'seeded-random-v1',
      wm_test.provider_keys()
    ),
    'invalid_candidates',
    'bos baslik TANIMLI hata uretmeli'
  );

  -- Biçimsiz posterPath (arayüze rastgele adres yazılamaz)
  perform wm_test.assert_raises(
    format(
      'select public.start_next_space_round(%L::uuid, %L::uuid, %L::jsonb, %L, %L, %L, false, %L::text[])',
      v_space, v_a,
      (wm_test.candidate_pool(15) || jsonb_build_array(jsonb_build_object(
        'tmdbMovieId', 444444, 'title', 'Kotu poster',
        'posterPath', 'https://evil.example.com/x.jpg'
      )))::text,
      v_seed, 'reusable-room-v1', 'seeded-random-v1',
      wm_test.provider_keys()
    ),
    'invalid_candidates',
    'bicimsiz posterPath TANIMLI hata uretmeli'
  );

  -- Geçersiz policy sürümü
  perform wm_test.assert_raises(
    format(
      'select public.start_next_space_round(%L::uuid, %L::uuid, %L::jsonb, %L, %L, %L, false, %L::text[])',
      v_space, v_a, wm_test.candidate_pool(15)::text,
      v_seed, 'GECERSIZ SURUM', 'seeded-random-v1',
      wm_test.provider_keys()
    ),
    'invalid_candidates',
    'gecersiz policy surumu TANIMLI hata uretmeli'
  );

  -- Çok kısa seed
  perform wm_test.assert_raises(
    format(
      'select public.start_next_space_round(%L::uuid, %L::uuid, %L::jsonb, %L, %L, %L, false, %L::text[])',
      v_space, v_a, wm_test.candidate_pool(15)::text,
      'kisa', 'reusable-room-v1', 'seeded-random-v1',
      wm_test.provider_keys()
    ),
    'invalid_candidates',
    'cok kisa seed TANIMLI hata uretmeli'
  );

  -- Yetersiz havuz: dürüst başarısızlık, uygun olmayan filmle doldurma YOK
  perform wm_test.assert_raises(
    format(
      'select public.start_next_space_round(%L::uuid, %L::uuid, %L::jsonb, %L, %L, %L, false, %L::text[])',
      v_space, v_a, wm_test.candidate_pool(3)::text,
      v_seed, 'reusable-room-v1', 'seeded-random-v1',
      wm_test.provider_keys()
    ),
    'candidate_pool_incomplete',
    'yetersiz havuz DURUSTCE basarisiz olmali'
  );

  perform wm_test.assert(
    not exists (select 1 from public.space_rounds where space_id = v_space),
    'basarisiz denemede HICBIR tur yazilmamali'
  );

  raise notice 'OK: 06_input_validation';
end;
$$;

rollback;
