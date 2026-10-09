-- =============================================================================
-- WatchMuse — kişisel zevk sıralaması ve tur tür filtresi.
--
-- 1. space_rounds.genre_filter: turu başlatan kişinin seçtiği türler
--    ("Komedi", "Anime"…). Herkes aynı turda hangi türlerin istendiğini görür.
-- 2. start_next_space_round: aday sırası artık sunucudaki sıralayıcıdan gelir
--    (p_candidates sırası). Önceki sürüm adayları md5(seed) ile kendi içinde
--    rastgele sıralıyor, sunucunun zevk sıralamasını yok sayıyordu. Varsayılan
--    sıralayıcı (seeded-random) zaten seed'li rastgele sıra gönderdiği için
--    eski davranış korunur. Fonksiyonun geri kalanı, 20260814000100 tanımına
--    20260902000100 migration'ının iki yaması uygulanmış hâliyle (en az 2
--    katılımcı; geçmişten geri dönüşte "herkes istedi") birebir aynıdır;
--    uygunluk kuralları (hard suppression, en az 1 yeni keşif, en fazla 9
--    tekrar) değişmez.
-- =============================================================================

alter table public.space_rounds
  add column if not exists genre_filter text[] not null default '{}'::text[];

alter table public.space_rounds
  drop constraint if exists space_rounds_genre_filter_count,
  add constraint space_rounds_genre_filter_count check (
    pg_catalog.cardinality(genre_filter) <= 5
  );

comment on column public.space_rounds.genre_filter is
  'Turu başlatanın seçtiği tür etiketleri; boşsa tür kısıtı yok. Yalnız sunucu (service role) yazar.';

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

  if (select count(*) from public.participants p where p.space_id = p_space_id) < 2 then
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
        ) = (select count(*) from public.participants current_member where current_member.space_id = p_space_id)
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
      -- Sıra sunucudaki sıralayıcıdan gelir (p_candidates sırası); ranker
      -- yalnızca hard eligibility filtrelerinden geçmiş satırları sıralar,
      -- yeni film kimliği üretemez.
      order by v.ordinal_position, v.movie_id
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

revoke all on function public.start_next_space_round(
  uuid, uuid, jsonb, text, text, text, boolean, text[]
) from public, anon, authenticated;

grant execute on function public.start_next_space_round(
  uuid, uuid, jsonb, text, text, text, boolean, text[]
) to service_role;
