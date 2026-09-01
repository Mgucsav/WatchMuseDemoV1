-- =============================================================================
-- Uygunluk sınırları ve RR-01 değişmez kuralları
--
-- Kapsam: tam 7 / 14 / 30 gün sınırları · İKİ VEYA DAHA ESKİ turda görülmüş film
-- · tam 10 benzersiz aday + en az 1 gerçek keşif · dürüst başarısızlık.
-- =============================================================================

begin;

do $$
declare
  v_a uuid := wm_test.new_user('elig-a@test.invalid');
  v_b uuid := wm_test.new_user('elig-b@test.invalid');
  v_space uuid;
  v_round1 uuid;
  v_round2 uuid;
  v_round3 uuid;
  v_fresh_count integer;
  v_repeat_count integer;
  v_total integer;
  v_movie integer;
begin
  v_space := wm_test.new_space(v_a, v_b);
  perform wm_test.act_as(null);

  -------------------------------------------------------------------------
  -- Tur 1: taban
  -------------------------------------------------------------------------
  v_round1 := public.start_next_space_round(
    v_space, v_a, wm_test.candidate_pool(30, 900000), wm_test.seed(),
    'reusable-room-v1', 'seeded-random-v1', false,
    wm_test.provider_keys()
  );

  select count(*) into v_total from public.room_candidates where round_id = v_round1;
  perform wm_test.assert(v_total = 10, 'tur 1 TAM 10 aday icermeli');

  select count(distinct tmdb_movie_id) into v_total
  from public.room_candidates where round_id = v_round1;
  perform wm_test.assert(v_total = 10, 'tur 1 adaylari BENZERSIZ olmali');

  select count(*) into v_fresh_count
  from public.room_candidates
  where round_id = v_round1 and selection_reason = 'fresh_discovery';
  perform wm_test.assert(v_fresh_count >= 1, 'tur 1 en az 1 GERCEK KESIF icermeli');

  -- Turu terminal duruma getir (oy yok -> no_match)
  update public.space_rounds set status = 'no_match' where id = v_round1;

  -------------------------------------------------------------------------
  -- RR-01: iki veya daha ESKI turda görülmüş film "fresh" sayılmamalı
  --
  -- Tur 2'yi tamamen farklı filmlerle aç, sonra tur 3'te tur 1'in filmlerini
  -- havuza koy. Repeat kapısı KAPALIYKEN bu filmler seçilmemelidir.
  -------------------------------------------------------------------------
  v_round2 := public.start_next_space_round(
    v_space, v_a, wm_test.candidate_pool(30, 800000), wm_test.seed(),
    'reusable-room-v1', 'seeded-random-v1', false,
    wm_test.provider_keys()
  );
  update public.space_rounds set status = 'no_match' where id = v_round2;

  -- Tur 1'in ilk filmini seç ve tur 3 havuzuna karıştır.
  select tmdb_movie_id into v_movie
  from public.room_candidates where round_id = v_round1 order by position limit 1;

  v_round3 := public.start_next_space_round(
    v_space,
    v_a,
    -- 700000 serisi tamamen yeni; ek olarak tur 1'den bilinen bir film.
    wm_test.candidate_pool(30, 700000) || jsonb_build_array(jsonb_build_object(
      'tmdbMovieId', v_movie, 'title', 'Iki tur onceki film',
      'originalTitle', null, 'posterPath', '/old.jpg',
      'overview', 'x', 'releaseYear', '2020', 'voteAverage', '7.0'
    )),
    wm_test.seed(), 'reusable-room-v1', 'seeded-random-v1',
    false,  -- repeat kapisi KAPALI
    wm_test.provider_keys()
  );

  perform wm_test.assert(
    not exists (
      select 1 from public.room_candidates
      where round_id = v_round3 and tmdb_movie_id = v_movie
    ),
    'IKI TUR ONCE gorulmus film, repeat kapisi kapaliyken SECILMEMELI (RR-01)'
  );

  perform wm_test.assert(
    not exists (
      select 1 from public.room_candidates
      where round_id = v_round3 and selection_reason = 'eligible_repeat'
    ),
    'repeat kapisi kapaliyken eligible_repeat etiketi OLMAMALI'
  );

  -- Reason değeri seçen geçişten gelmeli: hepsi bilinen bir değer olmalı.
  perform wm_test.assert(
    not exists (
      select 1 from public.room_candidates
      where round_id = v_round3
        and selection_reason not in
            ('priority_return', 'fresh_discovery', 'eligible_repeat')
    ),
    'her adayin reason degeri gecerli olmali'
  );

  update public.space_rounds set status = 'no_match' where id = v_round3;

  -------------------------------------------------------------------------
  -- Repeat kapısı AÇIKKEN eski film dönebilir, ama en az 1 gerçek keşif kalır
  -------------------------------------------------------------------------
  perform public.start_next_space_round(
    v_space,
    v_a,
    wm_test.candidate_pool(12, 600000) || jsonb_build_array(jsonb_build_object(
      'tmdbMovieId', v_movie, 'title', 'Iki tur onceki film',
      'originalTitle', null, 'posterPath', '/old.jpg',
      'overview', 'x', 'releaseYear', '2020', 'voteAverage', '7.0'
    )),
    wm_test.seed(), 'reusable-room-v1', 'seeded-random-v1',
    true,  -- repeat kapisi ACIK (son sinirli deneme)
    wm_test.provider_keys()
  );

  select count(*) into v_fresh_count
  from public.room_candidates c
  join public.space_rounds r on r.id = c.round_id
  where r.space_id = v_space and r.status = 'voting'
    and c.selection_reason = 'fresh_discovery';

  select count(*) into v_repeat_count
  from public.room_candidates c
  join public.space_rounds r on r.id = c.round_id
  where r.space_id = v_space and r.status = 'voting'
    and c.selection_reason in ('eligible_repeat', 'priority_return');

  perform wm_test.assert(v_fresh_count >= 1, 'son denemede bile en az 1 GERCEK KESIF olmali');
  perform wm_test.assert(v_repeat_count <= 9, 'priority + repeat EN FAZLA 9 slot almali');

  raise notice 'OK: 05_eligibility_boundaries (temel)';
end;
$$;

rollback;

-- =============================================================================
-- Hard suppression sınırları: tam 30 gün (both-skip) ve 7 gün (seçim penceresi)
-- =============================================================================

begin;

do $$
declare
  v_a uuid := wm_test.new_user('sup-a@test.invalid');
  v_b uuid := wm_test.new_user('sup-b@test.invalid');
  v_space uuid;
  v_round uuid;
  v_candidate uuid;
  v_movie integer;
begin
  v_space := wm_test.new_space(v_a, v_b);
  perform wm_test.act_as(null);

  v_round := public.start_next_space_round(
    v_space, v_a, wm_test.candidate_pool(30, 500000), wm_test.seed(),
    'reusable-room-v1', 'seeded-random-v1', false,
    wm_test.provider_keys()
  );

  select id, tmdb_movie_id into v_candidate, v_movie
  from public.room_candidates where round_id = v_round order by position limit 1;

  -- İki taraf da skip; oy zamanını 29 gün öncesine çek.
  insert into public.room_votes (round_id, candidate_id, user_id, choice)
  values (v_round, v_candidate, v_a, 'skip'), (v_round, v_candidate, v_b, 'skip');

  update public.room_votes
  set updated_at = now() - interval '29 days'
  where round_id = v_round and candidate_id = v_candidate;

  update public.space_rounds set status = 'no_match' where id = v_round;

  -- 29 gün: HÂLÂ bastırılmış olmalı
  perform wm_test.assert(
    public.is_movie_hard_suppressed(v_space, v_movie),
    '29 gunluk both-skip HALA bastirilmis olmali'
  );

  -- 31 gün: artık uygun
  update public.room_votes
  set updated_at = now() - interval '31 days'
  where round_id = v_round and candidate_id = v_candidate;

  perform wm_test.assert(
    not public.is_movie_hard_suppressed(v_space, v_movie),
    '31 gunluk both-skip ARTIK bastirilmamali'
  );

  -- Tek taraflı skip bastırmamalı (karışık karar kuralı)
  delete from public.room_votes
  where round_id = v_round and candidate_id = v_candidate and user_id = v_b;
  insert into public.room_votes (round_id, candidate_id, user_id, choice)
  values (v_round, v_candidate, v_b, 'maybe');
  update public.room_votes
  set updated_at = now() - interval '1 day'
  where round_id = v_round and candidate_id = v_candidate;

  perform wm_test.assert(
    not public.is_movie_hard_suppressed(v_space, v_movie),
    'KARISIK karar (skip + maybe) bastirma URETMEMELI'
  );

  raise notice 'OK: 05_eligibility_boundaries (suppression)';
end;
$$;

rollback;
