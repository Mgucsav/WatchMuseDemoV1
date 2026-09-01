-- =============================================================================
-- Yetkilendirme, güven sınırı ve gizlilik
--
-- Kapsam: üye A / üye B / yabancı · doğrudan authenticated RPC çağrısının
-- reddedilmesi (RR-02) · partner verisinin sızmaması · SECURITY DEFINER
-- search_path davranışı.
-- =============================================================================

begin;

do $$
declare
  v_a uuid := wm_test.new_user('a@test.invalid');
  v_b uuid := wm_test.new_user('b@test.invalid');
  v_outsider uuid := wm_test.new_user('x@test.invalid');
  v_space uuid;
  v_state jsonb;
begin
  v_space := wm_test.new_space(v_a, v_b);

  -------------------------------------------------------------------------
  -- RR-02: aday planı kalıcılaştırma authenticated'a KAPALI olmalı
  -------------------------------------------------------------------------
  perform wm_test.assert(
    not has_function_privilege(
      'authenticated',
      'public.start_next_space_round(uuid, uuid, jsonb, text, text, text, boolean, text[])',
      'execute'
    ),
    'authenticated start_next_space_round CALISTIRAMAMALI'
  );

  perform wm_test.assert(
    not has_function_privilege(
      'anon',
      'public.start_next_space_round(uuid, uuid, jsonb, text, text, text, boolean, text[])',
      'execute'
    ),
    'anon start_next_space_round CALISTIRAMAMALI'
  );

  perform wm_test.assert(
    has_function_privilege(
      'service_role',
      'public.start_next_space_round(uuid, uuid, jsonb, text, text, text, boolean, text[])',
      'execute'
    ),
    'service_role start_next_space_round CALISTIRABILMELI'
  );

  -------------------------------------------------------------------------
  -- RR-03: legacy imza authenticated'a KAPALI olmalı
  -------------------------------------------------------------------------
  perform wm_test.assert(
    not has_function_privilege(
      'authenticated',
      'public.create_or_reset_space_round(uuid, jsonb, boolean)',
      'execute'
    ),
    'authenticated legacy create_or_reset_space_round CALISTIRAMAMALI'
  );

  -------------------------------------------------------------------------
  -- Kullanıcı yollarının açık kaldığını doğrula
  -------------------------------------------------------------------------
  perform wm_test.assert(
    has_function_privilege('authenticated', 'public.get_space_round_state(uuid)', 'execute'),
    'authenticated tur durumunu OKUYABILMELI'
  );
  perform wm_test.assert(
    has_function_privilege('authenticated', 'public.accept_room_selection(uuid, uuid)', 'execute'),
    'authenticated kabul EDEBILMELI'
  );

  -------------------------------------------------------------------------
  -- Yabancı kullanıcı odaya erişemez
  -------------------------------------------------------------------------
  perform wm_test.act_as(v_outsider);
  perform wm_test.assert_raises(
    format('select public.get_space_round_state(%L::uuid)', v_space),
    'invalid_invitation',
    'yabanci kullanici oda durumunu OKUYAMAMALI'
  );

  -------------------------------------------------------------------------
  -- Aktör doğrulaması: service_role çağırsa bile üye olmayan aktör reddedilir
  -------------------------------------------------------------------------
  perform wm_test.act_as(null);
  perform wm_test.assert_raises(
    format(
      'select public.start_next_space_round(%L::uuid, %L::uuid, %s, %L, %L, %L, false, %L::text[])',
      v_space, v_outsider, quote_literal(wm_test.candidate_pool(20)::text) || '::jsonb',
      wm_test.seed(), 'reusable-room-v1', 'seeded-random-v1',
      wm_test.provider_keys()
    ),
    'invalid_invitation',
    'uye olmayan aktor icin tur ACILMAMALI'
  );

  -- Aktör kimliği hiç verilmezse de reddedilir.
  perform wm_test.assert_raises(
    format(
      'select public.start_next_space_round(%L::uuid, null::uuid, %s, %L, %L, %L, false, %L::text[])',
      v_space, quote_literal(wm_test.candidate_pool(20)::text) || '::jsonb',
      wm_test.seed(), 'reusable-room-v1', 'seeded-random-v1',
      wm_test.provider_keys()
    ),
    'unauthenticated',
    'aktor kimligi olmadan tur ACILMAMALI'
  );

  -------------------------------------------------------------------------
  -- room_votes doğrudan okunamaz (partner oyu gizli)
  -------------------------------------------------------------------------
  perform wm_test.assert(
    not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'room_votes'
    ),
    'room_votes uzerinde istemci politikasi OLMAMALI'
  );

  perform wm_test.assert(
    not has_table_privilege('authenticated', 'public.room_votes', 'select'),
    'authenticated room_votes tablosunu OKUYAMAMALI'
  );

  perform wm_test.assert(
    not has_table_privilege('authenticated', 'public.room_selections', 'select'),
    'authenticated room_selections tablosunu OKUYAMAMALI'
  );

  -------------------------------------------------------------------------
  -- SECURITY DEFINER + sabit search_path
  -------------------------------------------------------------------------
  perform wm_test.assert(
    (select bool_and(p.prosecdef)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'start_next_space_round', 'cast_space_round_vote',
         'start_space_round_wheel', 'get_space_round_state',
         'accept_room_selection', 'is_movie_hard_suppressed'
       )),
    'tur fonksiyonlarinin tamami SECURITY DEFINER OLMALI'
  );

  perform wm_test.assert(
    (select bool_and(p.proconfig @> array['search_path='])
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'start_next_space_round', 'cast_space_round_vote',
         'start_space_round_wheel', 'get_space_round_state',
         'accept_room_selection', 'is_movie_hard_suppressed'
       )),
    'tur fonksiyonlarinin search_path degeri BOS olmali'
  );

  -------------------------------------------------------------------------
  -- Tur durumu yalnızca çağıranın kendi oyunu döndürür
  -------------------------------------------------------------------------
  perform wm_test.act_as(null);
  perform public.start_next_space_round(
    v_space, v_a, wm_test.candidate_pool(20), wm_test.seed(),
    'reusable-room-v1', 'seeded-random-v1', false,
    wm_test.provider_keys()
  );

  perform wm_test.act_as(v_a);
  v_state := public.get_space_round_state(v_space);

  perform wm_test.assert(
    (v_state -> 'round' ->> 'partnerCompleted') is not null,
    'partner yalnizca tamamlandi/tamamlanmadi olarak gorunmeli'
  );
  perform wm_test.assert(
    v_state::text not like '%partnerVotes%',
    'partnerin tek tek oylari DONMEMELI'
  );
  perform wm_test.assert(
    v_state::text not like '%tokenHash%' and v_state::text not like '%token_hash%',
    'davet hash i DONMEMELI'
  );

  raise notice 'OK: 07_authorization_privacy';
end;
$$;

rollback;
