-- =============================================================================
-- Seçim kabulü: idempotency, kütüphane etkisi, gizlilik ve süre sınırı
--
-- NOT: `start_space_round_wheel` turu 'spinning' durumuna alır; 'result' geçişi
-- normalde `get_space_round_state` içindeki animasyon süresi dolduğunda olur.
-- Testler bunu beklemek yerine durumu açıkça ilerletir.
-- =============================================================================

begin;

do $$
declare
  v_a uuid := wm_test.new_user('acc-a@test.invalid');
  v_b uuid := wm_test.new_user('acc-b@test.invalid');
  v_x uuid := wm_test.new_user('acc-x@test.invalid');
  v_space uuid;
  v_round uuid;
  v_winner uuid;
  v_movie integer;
  v_selection uuid;
  v_first_accepted timestamptz;
  v_cand record;
begin
  v_space := wm_test.new_space(v_a, v_b);
  perform wm_test.act_as(null);

  v_round := public.start_next_space_round(
    v_space, v_a, wm_test.candidate_pool(30, 100000), wm_test.seed(),
    'reusable-room-v1', 'seeded-random-v1', false,
    wm_test.provider_keys()
  );

  select id, tmdb_movie_id into v_winner, v_movie
  from public.room_candidates where round_id = v_round order by position limit 1;

  -- Her iki taraf da 1. adaya "want", geri kalanına "skip" der.
  for v_cand in
    select id, position from public.room_candidates
    where round_id = v_round order by position
  loop
    perform wm_test.act_as(v_a);
    perform public.cast_space_round_vote(
      v_space, v_cand.id,
      case when v_cand.position = 1 then 'want' else 'skip' end::public.space_round_vote
    );
    perform wm_test.act_as(v_b);
    perform public.cast_space_round_vote(
      v_space, v_cand.id,
      case when v_cand.position = 1 then 'want' else 'skip' end::public.space_round_vote
    );
  end loop;

  perform wm_test.assert(
    (select status from public.space_rounds where id = v_round)
      = 'matching'::public.space_round_status,
    'iki taraf da bitirince tur MATCHING olmali'
  );

  -------------------------------------------------------------------------
  -- Çark: kazanan + yedi günlük seçim penceresi aynı transaction'da
  -------------------------------------------------------------------------
  perform wm_test.act_as(v_a);
  perform public.start_space_round_wheel(v_space);

  select id into v_selection from public.room_selections where round_id = v_round;
  perform wm_test.assert(v_selection is not null, 'cark bir SECIM olayi yazmali');

  perform wm_test.assert(
    (select response_deadline - selected_at from public.room_selections
     where id = v_selection) = interval '7 days',
    'secim penceresi TAM yedi gun olmali'
  );
  perform wm_test.assert(
    (select tmdb_movie_id from public.room_selections where id = v_selection) = v_movie,
    'secim kazanan filmi gostermeli'
  );

  -- Çarkın ikinci çağrısı idempotenttir.
  perform public.start_space_round_wheel(v_space);
  perform wm_test.assert(
    (select count(*) from public.room_selections where round_id = v_round) = 1,
    'ikinci cark cagrisi IKINCI secim yazmamali'
  );

  -------------------------------------------------------------------------
  -- Tur 'result' olmadan kabul edilemez
  -------------------------------------------------------------------------
  perform wm_test.assert_raises(
    format('select public.accept_room_selection(%L::uuid, %L::uuid)', v_space, v_selection),
    'invalid_selection',
    'tur RESULT olmadan kabul EDILEMEMELI'
  );

  update public.space_rounds set status = 'result' where id = v_round;

  -------------------------------------------------------------------------
  -- Yabancı kullanıcı kabul edemez
  -------------------------------------------------------------------------
  perform wm_test.act_as(v_x);
  perform wm_test.assert_raises(
    format('select public.accept_room_selection(%L::uuid, %L::uuid)', v_space, v_selection),
    'invalid_invitation',
    'yabanci kullanici kabul EDEMEMELI'
  );

  -------------------------------------------------------------------------
  -- A kabul eder: kabul satırı + kişisel kütüphane satırı
  -------------------------------------------------------------------------
  perform wm_test.act_as(v_a);
  perform public.accept_room_selection(v_space, v_selection);

  perform wm_test.assert(
    (select count(*) from public.room_selection_acceptances
     where selection_id = v_selection) = 1,
    'A icin TEK kabul satiri olusmali'
  );
  perform wm_test.assert(
    exists (
      select 1 from public.library_items
      where user_id = v_a and tmdb_movie_id = v_movie and status = 'watchlist'
    ),
    'kabul A nin kutuphanesine watchlist satiri yazmali'
  );
  perform wm_test.assert(
    not exists (select 1 from public.library_items where user_id = v_b),
    'A nin kabulu B nin kutuphanesine YAZMAMALI'
  );

  select accepted_at into v_first_accepted
  from public.room_selections where id = v_selection;
  perform wm_test.assert(v_first_accepted is not null, 'secim accepted_at ISARETLENMELI');

  -------------------------------------------------------------------------
  -- Aynı kullanıcının ikinci kabulü: hata yok, çift satır yok, zaman değişmez
  -------------------------------------------------------------------------
  perform public.accept_room_selection(v_space, v_selection);
  perform public.accept_room_selection(v_space, v_selection);

  perform wm_test.assert(
    (select count(*) from public.room_selection_acceptances
     where selection_id = v_selection and user_id = v_a) = 1,
    'tekrar kabul IKINCI satir yazmamali'
  );
  perform wm_test.assert(
    (select accepted_at from public.room_selections where id = v_selection)
      = v_first_accepted,
    'tekrar kabul accepted_at degerini DEGISTIRMEMELI'
  );

  -------------------------------------------------------------------------
  -- "İzlendi" durumu korunmalı: kabul onu watchlist'e geri DÜŞÜRMEMELİ
  -------------------------------------------------------------------------
  perform wm_test.act_as(v_b);
  insert into public.library_items (user_id, tmdb_movie_id, movie_title, status)
  values (v_b, v_movie, 'Onceden izlendi', 'watched');

  perform public.accept_room_selection(v_space, v_selection);

  perform wm_test.assert(
    (select status from public.library_items
     where user_id = v_b and tmdb_movie_id = v_movie) = 'watched'::public.library_status,
    'mevcut WATCHED durumu kabul tarafindan EZILMEMELI'
  );
  perform wm_test.assert(
    (select count(*) from public.room_selection_acceptances
     where selection_id = v_selection) = 2,
    'iki tarafin kabulu de kaydedilmeli'
  );

  -------------------------------------------------------------------------
  -- Kabul edilen film bu oda için hard suppressed olmalı
  -------------------------------------------------------------------------
  perform wm_test.assert(
    public.is_movie_hard_suppressed(v_space, v_movie),
    'kabul edilen film HARD SUPPRESSED olmali'
  );

  -------------------------------------------------------------------------
  -- Gizlilik: durum partnerin kimliğini sızdırmamalı
  -------------------------------------------------------------------------
  perform wm_test.act_as(v_a);
  perform wm_test.assert(
    public.get_space_round_state(v_space)::text not like '%acc-b@test.invalid%',
    'durum partnerin kimligini SIZDIRMAMALI'
  );

  raise notice 'OK: 04_acceptance (temel akis)';
end;
$$;

rollback;

-- =============================================================================
-- Süresi dolmuş seçim ve ilişkisel bütünlük (D)
-- =============================================================================

begin;

do $$
declare
  v_a uuid := wm_test.new_user('exp-a@test.invalid');
  v_b uuid := wm_test.new_user('exp-b@test.invalid');
  v_space uuid;
  v_round uuid;
  v_other_round uuid;
  v_movie integer;
  v_selection uuid;
  v_foreign_candidate uuid;
  v_cand record;
begin
  v_space := wm_test.new_space(v_a, v_b);
  perform wm_test.act_as(null);

  v_round := public.start_next_space_round(
    v_space, v_a, wm_test.candidate_pool(30, 200000), wm_test.seed(),
    'reusable-room-v1', 'seeded-random-v1', false,
    wm_test.provider_keys()
  );

  for v_cand in
    select id, position from public.room_candidates
    where round_id = v_round order by position
  loop
    perform wm_test.act_as(v_a);
    perform public.cast_space_round_vote(
      v_space, v_cand.id,
      case when v_cand.position = 1 then 'want' else 'skip' end::public.space_round_vote
    );
    perform wm_test.act_as(v_b);
    perform public.cast_space_round_vote(
      v_space, v_cand.id,
      case when v_cand.position = 1 then 'want' else 'skip' end::public.space_round_vote
    );
  end loop;

  perform wm_test.act_as(v_a);
  perform public.start_space_round_wheel(v_space);
  update public.space_rounds set status = 'result' where id = v_round;

  select id, tmdb_movie_id into v_selection, v_movie
  from public.room_selections where round_id = v_round;

  -- Pencereyi geçmişe kaydır (check kısıtı tam yedi gün farkı ister).
  update public.room_selections
  set selected_at = clock_timestamp() - interval '8 days',
      response_deadline = clock_timestamp() - interval '1 day'
  where id = v_selection;

  perform wm_test.assert_raises(
    format('select public.accept_room_selection(%L::uuid, %L::uuid)', v_space, v_selection),
    'selection_expired',
    'suresi dolmus secim kabul EDILEMEMELI'
  );

  perform wm_test.assert(
    not exists (
      select 1 from public.room_selection_acceptances where selection_id = v_selection
    ),
    'suresi dolmus secim kabul satiri YAZMAMALI'
  );

  -- Süresi dolmuş ve kabul edilmemiş seçim artık bastırmamalı.
  perform wm_test.assert(
    not public.is_movie_hard_suppressed(v_space, v_movie),
    'suresi dolmus ve kabul edilmemis secim BASTIRMAMALI'
  );

  -------------------------------------------------------------------------
  -- D: seçim zinciri başka bir turun adayına bağlanamaz
  -------------------------------------------------------------------------
  update public.space_rounds set status = 'no_match' where id = v_round;
  perform wm_test.act_as(null);
  v_other_round := public.start_next_space_round(
    v_space, v_a, wm_test.candidate_pool(30, 300000), wm_test.seed(),
    'reusable-room-v1', 'seeded-random-v1', false,
    wm_test.provider_keys()
  );

  select id into v_foreign_candidate
  from public.room_candidates where round_id = v_other_round order by position limit 1;

  perform wm_test.assert_raises(
    format(
      'update public.room_selections set candidate_id = %L::uuid where id = %L::uuid',
      v_foreign_candidate, v_selection
    ),
    'room_selections_candidate_chain_fk',
    'secim BASKA turun adayina baglanamamali'
  );

  -------------------------------------------------------------------------
  -- D: seçim, turdan bağımsız olarak başka bir space'e taşınamaz
  -------------------------------------------------------------------------
  perform wm_test.assert_raises(
    format(
      'update public.room_selections set space_id = %L::uuid where id = %L::uuid',
      gen_random_uuid(), v_selection
    ),
    'room_selections_round_space_fk',
    'secim space i turdan BAGIMSIZ degistirilememeli'
  );

  raise notice 'OK: 04_acceptance (sure ve butunluk)';
end;
$$;

rollback;
