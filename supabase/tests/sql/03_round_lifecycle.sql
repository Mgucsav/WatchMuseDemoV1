-- =============================================================================
-- Tur yaşam döngüsü, append-only geçmiş ve eşzamanlılık savunmaları
--
-- NOT: gerçek paralel yarış iki ayrı oturum gerektirir (bkz. dosya sonu).
-- Bu dosya tek oturumda kanıtlanabilen KISIT seviyesindeki savunmaları test eder;
-- kısıtlar, uygulama kilidi başarısız olsa bile son savunma hattıdır.
-- =============================================================================

begin;

do $$
declare
  v_a uuid := wm_test.new_user('life-a@test.invalid');
  v_b uuid := wm_test.new_user('life-b@test.invalid');
  v_space uuid;
  v_round1 uuid;
  v_round2 uuid;
  v_again uuid;
  v_candidate uuid;
  v_count integer;
begin
  v_space := wm_test.new_space(v_a, v_b);
  perform wm_test.act_as(null);

  v_round1 := public.start_next_space_round(
    v_space, v_a, wm_test.candidate_pool(30, 100000), wm_test.seed(),
    'reusable-room-v1', 'seeded-random-v1', false,
    wm_test.provider_keys()
  );

  -------------------------------------------------------------------------
  -- Idempotency: aktif tur varken ikinci çağrı AYNI turu döndürür
  -------------------------------------------------------------------------
  v_again := public.start_next_space_round(
    v_space, v_b, wm_test.candidate_pool(30, 200000), wm_test.seed(),
    'reusable-room-v1', 'seeded-random-v1', false,
    wm_test.provider_keys()
  );

  perform wm_test.assert(v_again = v_round1, 'aktif tur varken AYNI tur donmeli');

  select count(*) into v_count from public.space_rounds where space_id = v_space;
  perform wm_test.assert(v_count = 1, 'ikinci cagri YENI tur olusturmamali');

  -------------------------------------------------------------------------
  -- Kısıt savunması: aynı space'e ikinci AKTİF tur elle bile eklenemez
  -------------------------------------------------------------------------
  perform wm_test.assert_raises(
    format(
      'insert into public.space_rounds (space_id, round_number, selection_seed,
         selection_policy_version, ranker_version, status)
       values (%L::uuid, 99, %L, %L, %L, %L)',
      v_space, wm_test.seed(), 'reusable-room-v1', 'seeded-random-v1', 'voting'
    ),
    'space_rounds_one_active_per_space_idx',
    'ikinci AKTIF tur kisit tarafindan reddedilmeli'
  );

  -------------------------------------------------------------------------
  -- Append-only: terminal tur sonrası yeni tur açılır, ESKİSİ DURUR
  -------------------------------------------------------------------------
  update public.space_rounds set status = 'no_match' where id = v_round1;

  v_round2 := public.start_next_space_round(
    v_space, v_a, wm_test.candidate_pool(30, 300000), wm_test.seed(),
    'reusable-room-v1', 'seeded-random-v1', false,
    wm_test.provider_keys()
  );

  perform wm_test.assert(v_round2 <> v_round1, 'terminal sonrasi YENI tur acilmali');

  perform wm_test.assert(
    exists (select 1 from public.space_rounds where id = v_round1),
    'ESKI tur SILINMEMELI (append-only)'
  );
  perform wm_test.assert(
    (select count(*) from public.room_candidates where round_id = v_round1) = 10,
    'eski turun adaylari KORUNMALI'
  );

  perform wm_test.assert(
    (select round_number from public.space_rounds where id = v_round2) =
    (select round_number from public.space_rounds where id = v_round1) + 1,
    'round_number monoton artmali'
  );

  -------------------------------------------------------------------------
  -- Çark: kazanan kendi turuna ait olmalı (composite FK)
  -------------------------------------------------------------------------
  select id into v_candidate
  from public.room_candidates where round_id = v_round1 order by position limit 1;

  perform wm_test.assert_raises(
    format(
      'update public.space_rounds set status = %L, winner_candidate_id = %L::uuid,
              spin_started_at = now() where id = %L::uuid',
      'spinning', v_candidate, v_round2
    ),
    'space_rounds_winner_belongs_to_round',
    'BASKA turun adayi kazanan olarak yazilamamali'
  );

  raise notice 'OK: 03_round_lifecycle';
end;
$$;

rollback;

-- =============================================================================
-- ⚠️ İKİ OTURUM GEREKTİREN YARIŞLAR — bu dosyada KAPSANMAZ
--
-- Aşağıdakiler gerçek paralel bağlantı gerektirir ve elle çalıştırılmalıdır:
--
--   1) İki eşzamanlı `start_next_space_round`:
--      İki psql oturumunda aynı anda çağırın. Tam olarak biri yeni tur
--      oluşturmalı, diğeri aynı round_id'yi döndürmelidir.
--
--   2) İki eşzamanlı `start_space_round_wheel`:
--      İkisi de aynı `winner_candidate_id` ve `spin_started_at` görmelidir.
--
-- Örnek:
--   Oturum 1: begin; select public.start_next_space_round(...);   -- commit etme
--   Oturum 2: select public.start_next_space_round(...);          -- bloklanmali
--   Oturum 1: commit;
--   Oturum 2: ayni round_id'yi dondurmeli
--
-- Bu senaryolar ÇALIŞTIRILMADIĞI sürece eşzamanlılık davranışı doğrulanmış
-- sayılmaz.
-- =============================================================================
