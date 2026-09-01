-- =============================================================================
-- Teleparty köprüsü: iki kabul kapısı, host yetkisi, URL doğrulama ve gizlilik
-- =============================================================================

begin;

do $$
declare
  v_host uuid := wm_test.new_user('tp-host@test.invalid');
  v_guest uuid := wm_test.new_user('tp-guest@test.invalid');
  v_outsider uuid := wm_test.new_user('tp-outsider@test.invalid');
  v_space uuid;
  v_round uuid;
  v_candidate uuid;
  v_movie integer;
  v_selection uuid;
  v_state jsonb;
  v_url text := 'https://redirect.teleparty.com/join/390d2c023aec4fcf';
  v_now timestamptz;
begin
  v_space := wm_test.new_space(v_host, v_guest);
  perform wm_test.act_as(null);

  v_round := public.start_next_space_round(
    v_space, v_host, wm_test.candidate_pool(30, 930000), wm_test.seed(),
    'reusable-room-v1', 'seeded-random-v1', false,
    wm_test.provider_keys()
  );

  select id, tmdb_movie_id into v_candidate, v_movie
  from public.room_candidates
  where round_id = v_round order by position limit 1;

  update public.space_rounds
  set status = 'result', winner_candidate_id = v_candidate
  where id = v_round;

  v_now := clock_timestamp();
  insert into public.room_selections (
    space_id, round_id, candidate_id, tmdb_movie_id,
    selected_at, response_deadline
  ) values (
    v_space, v_round, v_candidate, v_movie,
    v_now, v_now + interval '7 days'
  ) returning id into v_selection;

  -- Hiç kabul yokken ortak hazır bilgisi ve URL görünmez.
  perform wm_test.act_as(v_host);
  v_state := public.get_space_teleparty_state(v_space);
  perform wm_test.assert(
    (v_state -> 0 ->> 'bothAccepted')::boolean = false
      and v_state -> 0 -> 'joinUrl' = 'null'::jsonb,
    'kabul olmadan ortak hazirlik veya URL GORUNMEMELI'
  );
  perform wm_test.assert_raises(
    format(
      'select public.share_room_teleparty_link(%L::uuid, %L::uuid, %L)',
      v_space, v_selection, v_url
    ),
    'teleparty_not_ready',
    'iki kabul olmadan host link PAYLASAMAMALI'
  );

  -- Hostun tek kabulü partner sinyalini açmaz.
  perform public.accept_room_selection(v_space, v_selection);
  v_state := public.get_space_teleparty_state(v_space);
  perform wm_test.assert(
    (v_state -> 0 ->> 'bothAccepted')::boolean = false,
    'tek kabul ortak hazirlik SAYILMAMALI'
  );

  -- İkinci kabul ortak kapıyı açar; guest yine de link yazamaz.
  perform wm_test.act_as(v_guest);
  perform public.accept_room_selection(v_space, v_selection);
  v_state := public.get_space_teleparty_state(v_space);
  perform wm_test.assert(
    (v_state -> 0 ->> 'bothAccepted')::boolean = true
      and v_state -> 0 -> 'joinUrl' = 'null'::jsonb,
    'iki kabul ortak hazirligi ACMALI ama link henuz BOS olmali'
  );
  perform wm_test.assert_raises(
    format(
      'select public.share_room_teleparty_link(%L::uuid, %L::uuid, %L)',
      v_space, v_selection, v_url
    ),
    'host_required',
    'guest Teleparty linki YAZAMAMALI'
  );

  -- Host resmi linki yazar; iki üye de aynı tek-tık linkini görür.
  perform wm_test.act_as(v_host);
  perform wm_test.assert_raises(
    format(
      'select public.share_room_teleparty_link(%L::uuid, %L::uuid, %L)',
      v_space, v_selection, 'https://redirect.teleparty.com.evil.test/join/390d2c023aec4fcf'
    ),
    'invalid_teleparty_link',
    'sahte Teleparty alani REDDEDILMELI'
  );
  perform public.share_room_teleparty_link(v_space, v_selection, v_url);

  v_state := public.get_space_teleparty_state(v_space);
  perform wm_test.assert(
    v_state -> 0 ->> 'joinUrl' = v_url,
    'host resmi Teleparty linkini GORMELI'
  );

  perform wm_test.act_as(v_guest);
  v_state := public.get_space_teleparty_state(v_space);
  perform wm_test.assert(
    v_state -> 0 ->> 'joinUrl' = v_url,
    'guest ayni Teleparty linkini GORMELI'
  );

  -- Oda dışındaki kullanıcı ne ortak durumu ne linki okuyabilir.
  perform wm_test.act_as(v_outsider);
  perform wm_test.assert_raises(
    format('select public.get_space_teleparty_state(%L::uuid)', v_space),
    'invalid_invitation',
    'yabanci Teleparty durumunu OKUYAMAMALI'
  );

  perform wm_test.assert(
    not has_table_privilege('authenticated', 'public.room_teleparty_sessions', 'select')
      and not has_table_privilege('authenticated', 'public.room_teleparty_sessions', 'insert')
      and not has_table_privilege('authenticated', 'public.room_teleparty_sessions', 'update'),
    'authenticated role Teleparty tablosuna DOGRUDAN erisememeli'
  );

  raise notice 'OK: 09_teleparty_bridge';
end;
$$;

rollback;
