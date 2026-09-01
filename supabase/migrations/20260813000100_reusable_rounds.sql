-- =============================================================================
-- WatchMuse — yeniden kullanılabilir odalar, kalıcı tur geçmişi ve seçim kabulü
--
-- Sıra: 20260812000200_room_rounds_votes_and_wheel.sql SONRASI.
-- Önceki migration dosyaları değiştirilmez. Bu dosya prototip sinyal tablosu
-- veya partner kütüphanesi kullanmaz; kaynak gerçekler kalıcı oda olaylarıdır.
-- =============================================================================

-- Çok turlu, sürümlenmiş seçim kaydı ------------------------------------------

alter table public.space_rounds
  drop constraint if exists space_rounds_space_id_key;

alter table public.space_rounds
  add column if not exists round_number integer,
  add column if not exists selection_seed text,
  add column if not exists selection_policy_version text,
  add column if not exists ranker_version text;

with numbered as (
  select r.id,
         row_number() over (
           partition by r.space_id order by r.created_at, r.id
         )::integer as round_number
  from public.space_rounds r
)
update public.space_rounds r
set round_number = n.round_number,
    selection_seed = coalesce(r.selection_seed, 'legacy-' || r.id::text),
    selection_policy_version = coalesce(r.selection_policy_version, 'legacy-v1'),
    ranker_version = coalesce(r.ranker_version, 'legacy-random-v1')
from numbered n
where n.id = r.id;

alter table public.space_rounds
  alter column round_number set not null,
  alter column selection_seed set not null,
  alter column selection_policy_version set not null,
  alter column ranker_version set not null;

alter table public.space_rounds
  drop constraint if exists space_rounds_round_number_positive,
  add constraint space_rounds_round_number_positive check (round_number > 0),
  drop constraint if exists space_rounds_seed_length,
  add constraint space_rounds_seed_length
    check (char_length(selection_seed) between 16 and 128),
  drop constraint if exists space_rounds_policy_version_format,
  add constraint space_rounds_policy_version_format
    check (selection_policy_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  drop constraint if exists space_rounds_ranker_version_format,
  add constraint space_rounds_ranker_version_format
    check (ranker_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  drop constraint if exists space_rounds_space_round_number_unique,
  add constraint space_rounds_space_round_number_unique
    unique (space_id, round_number);

-- voting/matching/spinning terminal değildir. Veritabanı eşzamanlı iki aktif
-- turun açılmasını, uygulama/RPC kilidinden bağımsız olarak da reddeder.
create unique index if not exists space_rounds_one_active_per_space_idx
  on public.space_rounds (space_id)
  where status in (
    'voting'::public.space_round_status,
    'matching'::public.space_round_status,
    'spinning'::public.space_round_status
  );

create index if not exists space_rounds_space_history_idx
  on public.space_rounds (space_id, round_number desc);

alter table public.room_candidates
  add column if not exists selection_reason text not null default 'backfill';

alter table public.room_candidates
  drop constraint if exists room_candidates_selection_reason_allowed,
  add constraint room_candidates_selection_reason_allowed check (
    selection_reason in (
      'priority_return', 'fresh_discovery', 'eligible_repeat', 'backfill'
    )
  );

create index if not exists room_candidates_tmdb_round_idx
  on public.room_candidates (tmdb_movie_id, round_id);

create index if not exists room_candidates_priority_return_idx
  on public.room_candidates (tmdb_movie_id, round_id)
  where selection_reason = 'priority_return';

-- Çark seçimi ile kişisel kütüphane birbirinden ayrı gerçeklerdir. Seçim kabulü
-- daha sonra kütüphane satırı silinse bile kalır.
create table if not exists public.room_selections (
  id                uuid primary key default gen_random_uuid(),
  space_id          uuid not null references public.spaces (id) on delete cascade,
  round_id          uuid not null unique references public.space_rounds (id) on delete cascade,
  candidate_id      uuid not null unique references public.room_candidates (id) on delete cascade,
  tmdb_movie_id     integer not null check (tmdb_movie_id > 0),
  selected_at       timestamptz not null,
  response_deadline timestamptz not null,
  accepted_at       timestamptz,
  created_at        timestamptz not null default now(),
  constraint room_selections_deadline_after_selection
    check (response_deadline = selected_at + interval '7 days'),
  constraint room_selections_acceptance_in_window
    check (accepted_at is null or accepted_at <= response_deadline)
);

create table if not exists public.room_selection_acceptances (
  id           uuid primary key default gen_random_uuid(),
  selection_id uuid not null references public.room_selections (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  accepted_at  timestamptz not null default now(),
  constraint room_selection_acceptances_one_per_user unique (selection_id, user_id)
);

create index if not exists room_selections_space_selected_idx
  on public.room_selections (space_id, selected_at desc);
create index if not exists room_selections_space_movie_accepted_idx
  on public.room_selections (space_id, tmdb_movie_id, accepted_at)
  where accepted_at is not null;
create index if not exists room_selection_acceptances_user_idx
  on public.room_selection_acceptances (user_id, selection_id);

revoke all on public.room_selections, public.room_selection_acceptances
  from anon, authenticated;
alter table public.room_selections enable row level security;
alter table public.room_selection_acceptances enable row level security;

-- İki tabloda da doğrudan istemci politikası bilinçli olarak YOKTUR. Kabul
-- olayları yalnızca sanitize edilmiş get_space_round_state çıktısından ve
-- sadece çağıranın `myAccepted` alanıyla okunur. Böylece partnerin kişisel
-- watchlist davranışı fark alma yöntemiyle çıkarılamaz.

-- İlişkisel bütünlük: seçim zinciri ve kazanan --------------------------------
--
-- Bu kısıtlar olmadan `room_selections` satırı bir space'in id'sini, başka bir
-- turun round_id'sini ve üçüncü bir turun candidate_id'sini taşıyabilirdi.
-- Fonksiyon içi kontroller doğru olsa bile şema bunu engellemiyordu.

alter table public.space_rounds
  drop constraint if exists space_rounds_id_space_unique,
  add constraint space_rounds_id_space_unique unique (id, space_id);

alter table public.room_candidates
  drop constraint if exists room_candidates_id_round_unique,
  add constraint room_candidates_id_round_unique unique (id, round_id),
  drop constraint if exists room_candidates_id_round_movie_unique,
  add constraint room_candidates_id_round_movie_unique
    unique (id, round_id, tmdb_movie_id);

-- Kazanan aday kendi turuna ait olmak zorundadır. DEFERRABLE: çark güncellemesi
-- ile space silme cascade'i aynı transaction içinde tutarlı biçimde çözülür.
alter table public.space_rounds
  drop constraint if exists space_rounds_winner_belongs_to_round,
  add constraint space_rounds_winner_belongs_to_round
    foreign key (winner_candidate_id, id)
    references public.room_candidates (id, round_id)
    deferrable initially deferred;

-- Seçim satırı tek bir tutarlı zincire bağlıdır: space → round → candidate →
-- tmdb_movie_id. Dört kimlik artık birbirinden bağımsız olamaz.
alter table public.room_selections
  drop constraint if exists room_selections_round_space_fk,
  add constraint room_selections_round_space_fk
    foreign key (round_id, space_id)
    references public.space_rounds (id, space_id) on delete cascade,
  drop constraint if exists room_selections_candidate_chain_fk,
  add constraint room_selections_candidate_chain_fk
    foreign key (candidate_id, round_id, tmdb_movie_id)
    references public.room_candidates (id, round_id, tmdb_movie_id)
    on delete cascade;

-- Hard suppression tek kaynak ------------------------------------------------
--
-- 30 günlük both-skip, kabul edilmiş seçim ve açık yedi günlük seçim penceresi
-- kuralları TEK yerde tanımlanır. Aday seçimindeki üç geçiş de bunu çağırır;
-- böylece kurallar geçişler arasında sessizce ayrışamaz ve son denemede bile
-- açılamaz.
create or replace function public.is_movie_hard_suppressed(
  p_space_id uuid,
  p_tmdb_movie_id integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- Kabul edilmiş ya da hâlâ açık seçim penceresi
    exists (
      select 1 from public.room_selections s
      where s.space_id = p_space_id
        and s.tmdb_movie_id = p_tmdb_movie_id
        and (
          s.accepted_at is not null
          or s.response_deadline > pg_catalog.clock_timestamp()
        )
    )
    -- Son 30 gün içinde iki tarafın da skip dediği film
    or exists (
      select 1
      from public.space_rounds sr
      join public.room_candidates sc on sc.round_id = sr.id
      where sr.space_id = p_space_id
        and sc.tmdb_movie_id = p_tmdb_movie_id
        and sr.status in (
          'result'::public.space_round_status,
          'no_match'::public.space_round_status
        )
        and (
          select count(*) from public.room_votes sv
          where sv.round_id = sr.id and sv.candidate_id = sc.id
            and sv.choice = 'skip'::public.space_round_vote
        ) = 2
        and (
          select max(sv.updated_at) from public.room_votes sv
          where sv.round_id = sr.id and sv.candidate_id = sc.id
            and sv.choice = 'skip'::public.space_round_vote
        ) > pg_catalog.clock_timestamp() - interval '30 days'
    );
$$;

comment on function public.is_movie_hard_suppressed(uuid, integer) is
  'SECURITY DEFINER, STABLE. Bir filmin bu oda icin hard suppressed olup olmadigini soyler: kabul edilmis secim, acik yedi gunluk secim penceresi veya son 30 gun icinde iki tarafin da skip demesi. Aday secimindeki her gecis bunu cagirir; kural son denemede bile acilamaz.';

revoke all on function public.is_movie_hard_suppressed(uuid, integer) from public, anon, authenticated;

-- Yeni tur: oda satırı kilidi altında geçmişi silmeden tam 10 adayı seçer. ----
--
-- GÜVEN SINIRI (RR-02): bu fonksiyon YALNIZCA service_role tarafından
-- çağrılabilir. Çağıran güvenilen sunucu kodu olduğu için `auth.uid()` burada
-- NULL'dur; gerçek aktör `p_actor_id` ile açıkça geçilir ve bu fonksiyon onun
-- odaya üyeliğini BAĞIMSIZ olarak doğrular. Böylece bir oda üyesi Supabase
-- Data API üzerinden doğrudan çağırıp kendi aday listesini, seed'ini veya
-- policy metadata'sını dayatamaz.
--
-- ADAY SEÇİMİ (RR-01): üç ayrı geçiş vardır ve her adayın `selection_reason`
-- değeri ONU SEÇEN GEÇİŞTEN gelir; seçim sonrası çıkarımla üretilmez.
--   1) priority_return  — 14 gün içinde both-want olup çark tarafından
--                         seçilmemiş, fırsatı henüz tüketilmemiş filmler
--   2) fresh_discovery  — bu space'in TÜM geçmişinde hiç aday olmamış filmler
--   3) eligible_repeat  — yalnızca p_allow_eligible_repeats = true iken
--
-- Değişmez kurallar:
--   * priority_return + eligible_repeat toplamı en fazla 9 slot alabilir
--   * en az 1 slot gerçek fresh_discovery olmak zorundadır
--   * hard suppression hiçbir geçişte, son denemede bile açılamaz
--   * 10 benzersiz aday + en az 1 gerçek keşif üretilemezse dürüstçe
--     `candidate_pool_incomplete` ile başarısız olunur; uygun olmayan film
--     havuzu doldurmak için ASLA kullanılmaz
create or replace function public.start_next_space_round(
  p_space_id uuid,
  p_actor_id uuid,
  p_candidates jsonb,
  p_selection_seed text,
  p_policy_version text,
  p_ranker_version text,
  p_allow_eligible_repeats boolean default false
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
            else exists (select 1 from seen_before b where b.movie_id = v.movie_id)
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
    selection_policy_version, ranker_version
  ) values (
    p_space_id, v_round_number, p_selection_seed,
    p_policy_version, p_ranker_version
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

-- Legacy imza (RR-03) --------------------------------------------------------
--
-- Eski production kodu bu imzayı çağırıyordu. Sertleştirilmiş şemada bu yol
-- KALICI bir authenticated aday-üretim kapısı olarak BIRAKILMAZ:
--
--   * `authenticated` rolünden EXECUTE geri alınmıştır (aşağıdaki grant bloğu),
--   * gövde, çağrılsa bile keyfi bir aday planını KABUL ETMEZ ve KAYDETMEZ.
--
-- Sonuç: migration uygulandıktan sonra, eşleşen uygulama sürümü deploy edilene
-- kadar YENİ TUR OLUŞTURULAMAZ. Bu bilinçli bir bakım penceresi davranışıdır;
-- okuma, oylama, çark ve kabul yolları etkilenmez. Ayrıntı için
-- ROOM_SELECTION_AND_WHEEL_SETUP.md içindeki bakım penceresi sırasına bakın.
create or replace function public.create_or_reset_space_round(
  p_space_id uuid,
  p_candidates jsonb,
  p_reset boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Parametreler bilinçli olarak kullanılmaz: bu fonksiyon artık aday planı
  -- kabul etmez. Yalnızca eski istemciye anlaşılır bir domain hatası döner.
  perform p_space_id, p_candidates, p_reset;

  raise exception 'round_creation_moved' using errcode = 'P0001';
end;
$$;

-- Oylar daima en yeni aktif turda yazılır; geçmiş satırlar değişmez. ----------

create or replace function public.cast_space_round_vote(
  p_space_id uuid,
  p_candidate_id uuid,
  p_choice public.space_round_vote
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_round public.space_rounds%rowtype;
  v_participant_count integer;
  v_finished_count integer;
  v_match_count integer;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.participants p
    where p.space_id = p_space_id and p.user_id = v_user_id
  ) then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;

  select * into v_round
  from public.space_rounds r
  where r.space_id = p_space_id
    and r.status = 'voting'::public.space_round_status
  order by r.round_number desc
  limit 1
  for update;

  if not found then raise exception 'round_closed_for_votes' using errcode = 'P0001'; end if;
  if not exists (
    select 1 from public.room_candidates c
    where c.id = p_candidate_id and c.round_id = v_round.id
  ) then raise exception 'invalid_round_candidate' using errcode = '22023'; end if;

  insert into public.room_votes (round_id, candidate_id, user_id, choice)
  values (v_round.id, p_candidate_id, v_user_id, p_choice)
  on conflict (round_id, candidate_id, user_id)
  do update set choice = excluded.choice, updated_at = now();

  select count(*) into v_participant_count
  from public.participants p where p.space_id = p_space_id;
  select count(*) into v_finished_count from (
    select v.user_id
    from public.room_votes v
    where v.round_id = v_round.id
    group by v.user_id
    having count(*) = v_round.candidate_count
  ) finished;

  if v_finished_count = v_participant_count then
    select count(*) into v_match_count
    from public.room_candidates c
    where c.round_id = v_round.id
      and (
        select count(*) from public.room_votes v
        where v.round_id = v_round.id and v.candidate_id = c.id
          and v.choice = 'want'::public.space_round_vote
      ) = v_participant_count;

    update public.space_rounds
    set status = case when v_match_count > 0
      then 'matching'::public.space_round_status
      else 'no_match'::public.space_round_status end
    where id = v_round.id;
  end if;
end;
$$;

-- Çark sonucu ve yedi günlük seçim olayı aynı transaction'da oluşturulur. -----

create or replace function public.start_space_round_wheel(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_round public.space_rounds%rowtype;
  v_participant_count integer;
  v_winner public.room_candidates%rowtype;
  v_started_at timestamptz;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.participants p
    where p.space_id = p_space_id and p.user_id = v_user_id
  ) then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;

  select * into v_round
  from public.space_rounds r
  where r.space_id = p_space_id
  order by r.round_number desc
  limit 1
  for update;

  if not found then raise exception 'round_not_ready' using errcode = 'P0001'; end if;
  if v_round.status in ('spinning'::public.space_round_status, 'result'::public.space_round_status) then return; end if;
  if v_round.status <> 'matching'::public.space_round_status then
    raise exception 'round_not_ready' using errcode = 'P0001';
  end if;

  select count(*) into v_participant_count
  from public.participants p where p.space_id = p_space_id;
  select c.* into v_winner
  from public.room_candidates c
  where c.round_id = v_round.id
    and (
      select count(*) from public.room_votes v
      where v.round_id = v_round.id and v.candidate_id = c.id
        and v.choice = 'want'::public.space_round_vote
    ) = v_participant_count
  order by random()
  limit 1;

  if not found then
    update public.space_rounds
    set status = 'no_match'::public.space_round_status
    where id = v_round.id;
    return;
  end if;

  v_started_at := clock_timestamp();
  update public.space_rounds
  set status = 'spinning'::public.space_round_status,
      winner_candidate_id = v_winner.id,
      spin_started_at = v_started_at
  where id = v_round.id;

  insert into public.room_selections (
    space_id, round_id, candidate_id, tmdb_movie_id,
    selected_at, response_deadline
  ) values (
    p_space_id, v_round.id, v_winner.id, v_winner.tmdb_movie_id,
    v_started_at, v_started_at + interval '7 days'
  ) on conflict (round_id) do nothing;
end;
$$;

-- Okuma normalde kilit almaz. Yalnızca süresi dolmuş spinning satırını koşullu
-- UPDATE eden kısa yol satır kilidi alır; eşzamanlı çağrılar idempotenttir.
create or replace function public.get_space_round_state(p_space_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_round public.space_rounds%rowtype;
  v_participant_count integer;
  v_candidates jsonb;
  v_my_votes jsonb;
  v_my_vote_count integer;
  v_partner_completed boolean;
  v_matches jsonb := '[]'::jsonb;
  v_winner jsonb;
  v_pending_selections jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.participants p
    where p.space_id = p_space_id and p.user_id = v_user_id
  ) then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;

  select * into v_round
  from public.space_rounds r
  where r.space_id = p_space_id
  order by r.round_number desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'round', null,
      'pendingSelections', '[]'::jsonb
    );
  end if;

  if v_round.status = 'spinning'::public.space_round_status
     and v_round.spin_started_at
       + make_interval(secs => v_round.spin_duration_ms::numeric / 1000)
       <= clock_timestamp() then
    update public.space_rounds r
    set status = 'result'::public.space_round_status
    where r.id = v_round.id
      and r.status = 'spinning'::public.space_round_status
      and r.spin_started_at
        + make_interval(secs => r.spin_duration_ms::numeric / 1000)
        <= clock_timestamp();
    select * into v_round from public.space_rounds r where r.id = v_round.id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'tmdbMovieId', s.tmdb_movie_id,
    'title', c.title,
    'posterPath', c.poster_path,
    'selectedAt', s.selected_at,
    'responseDeadline', s.response_deadline,
    'myAccepted', exists (
      select 1 from public.room_selection_acceptances a
      where a.selection_id = s.id and a.user_id = v_user_id
    )
  ) order by s.selected_at desc), '[]'::jsonb)
  into v_pending_selections
  from public.room_selections s
  join public.room_candidates c on c.id = s.candidate_id
  join public.space_rounds selected_round on selected_round.id = s.round_id
  where s.space_id = p_space_id
    and s.response_deadline > clock_timestamp()
    and selected_round.status = 'result'::public.space_round_status;

  select count(*) into v_participant_count
  from public.participants p where p.space_id = p_space_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'position', c.position, 'tmdbMovieId', c.tmdb_movie_id,
    'title', c.title, 'originalTitle', c.original_title, 'posterPath', c.poster_path,
    'overview', c.overview, 'releaseYear', c.release_year,
    'voteAverage', c.tmdb_vote_average
  ) order by c.position), '[]'::jsonb) into v_candidates
  from public.room_candidates c where c.round_id = v_round.id;

  select coalesce(jsonb_object_agg(v.candidate_id::text, v.choice::text), '{}'::jsonb),
         count(*)
  into v_my_votes, v_my_vote_count
  from public.room_votes v
  where v.round_id = v_round.id and v.user_id = v_user_id;

  select exists (
    select 1 from public.participants p
    where p.space_id = p_space_id and p.user_id <> v_user_id
      and (
        select count(*) from public.room_votes v
        where v.round_id = v_round.id and v.user_id = p.user_id
      ) = v_round.candidate_count
  ) into v_partner_completed;

  if v_round.status in (
    'matching'::public.space_round_status,
    'spinning'::public.space_round_status,
    'result'::public.space_round_status
  ) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'position', c.position, 'tmdbMovieId', c.tmdb_movie_id,
      'title', c.title, 'originalTitle', c.original_title, 'posterPath', c.poster_path,
      'overview', c.overview, 'releaseYear', c.release_year,
      'voteAverage', c.tmdb_vote_average
    ) order by c.position), '[]'::jsonb) into v_matches
    from public.room_candidates c
    where c.round_id = v_round.id
      and (
        select count(*) from public.room_votes v
        where v.round_id = v_round.id and v.candidate_id = c.id
          and v.choice = 'want'::public.space_round_vote
      ) = v_participant_count;
  end if;

  if v_round.winner_candidate_id is not null then
    select jsonb_build_object(
      'id', c.id, 'position', c.position, 'tmdbMovieId', c.tmdb_movie_id,
      'title', c.title, 'originalTitle', c.original_title, 'posterPath', c.poster_path,
      'overview', c.overview, 'releaseYear', c.release_year,
      'voteAverage', c.tmdb_vote_average
    ) into v_winner
    from public.room_candidates c where c.id = v_round.winner_candidate_id;
  end if;

  return jsonb_build_object(
    'round', jsonb_build_object(
      'id', v_round.id,
      'roundNumber', v_round.round_number,
      'status', v_round.status::text,
      'candidateCount', v_round.candidate_count,
      'candidates', v_candidates,
      'myVotes', v_my_votes,
      'myVoteCount', v_my_vote_count,
      'partnerCompleted', v_partner_completed,
      'matchedCandidates', v_matches,
      'winnerCandidate', v_winner,
      'spinStartedAt', v_round.spin_started_at,
      'spinDurationMs', v_round.spin_duration_ms
    ),
    'pendingSelections', v_pending_selections
  );
end;
$$;

-- Kişisel kabul: olay + yalnızca çağıranın watchlist'i tek transaction'dadır. -

create or replace function public.accept_room_selection(
  p_space_id uuid,
  p_selection_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_selection public.room_selections%rowtype;
  v_candidate public.room_candidates%rowtype;
  v_accepted_at timestamptz;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.participants p
    where p.space_id = p_space_id and p.user_id = v_user_id
  ) then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;

  -- Yeni tur açma ile aynı kilidi kullanır. Acceptance ve eligibility yarışırsa
  -- iki işlem tek, açıklanabilir bir sırada tamamlanır.
  perform 1 from public.spaces s where s.id = p_space_id for update;

  select * into v_selection
  from public.room_selections s
  where s.id = p_selection_id and s.space_id = p_space_id
  for update;
  if not found then raise exception 'invalid_selection' using errcode = 'P0001'; end if;

  v_accepted_at := clock_timestamp();

  if not exists (
    select 1 from public.space_rounds r
    where r.id = v_selection.round_id
      and r.space_id = p_space_id
      and r.status = 'result'::public.space_round_status
  ) then
    raise exception 'invalid_selection' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.room_selection_acceptances a
    where a.selection_id = v_selection.id and a.user_id = v_user_id
  ) then return; end if;

  if v_selection.response_deadline <= v_accepted_at then
    raise exception 'selection_expired' using errcode = 'P0001';
  end if;

  select * into v_candidate
  from public.room_candidates c
  where c.id = v_selection.candidate_id
    and c.round_id = v_selection.round_id
    and c.tmdb_movie_id = v_selection.tmdb_movie_id;
  if not found then raise exception 'invalid_selection' using errcode = 'P0001'; end if;

  insert into public.room_selection_acceptances (
    selection_id, user_id, accepted_at
  ) values (
    v_selection.id, v_user_id, v_accepted_at
  ) on conflict (selection_id, user_id) do nothing;

  insert into public.library_items (
    user_id, tmdb_movie_id, movie_title, poster_path, status
  ) values (
    v_user_id,
    v_candidate.tmdb_movie_id,
    v_candidate.title,
    case when v_candidate.poster_path ~ '^/[A-Za-z0-9._-]+$'
      then v_candidate.poster_path else null end,
    'watchlist'::public.library_status
  )
  on conflict (user_id, tmdb_movie_id) do update
  set movie_title = excluded.movie_title,
      poster_path = coalesce(excluded.poster_path, public.library_items.poster_path);

  update public.room_selections s
  set accepted_at = coalesce(s.accepted_at, v_accepted_at)
  where s.id = v_selection.id;
end;
$$;

-- Yetkiler --------------------------------------------------------------------
--
-- GÜVEN SINIRI (RR-02): aday planını kalıcılaştıran fonksiyon HİÇBİR istemci
-- rolüne açık değildir. Yalnızca `service_role` çalıştırabilir; o kimlik de
-- yalnızca sunucu tarafındaki yönetimsel istemcide bulunur.
--
-- Eski imza (RR-03) `authenticated` rolünden geri alınmıştır; kalıcı bir
-- authenticated aday-üretim kapısı bırakılmaz.

revoke all on function
  public.start_next_space_round(uuid, uuid, jsonb, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.create_or_reset_space_round(uuid, jsonb, boolean)
  from public, anon, authenticated;
revoke all on function public.is_movie_hard_suppressed(uuid, integer)
  from public, anon, authenticated;

revoke all on function public.cast_space_round_vote(uuid, uuid, public.space_round_vote)
  from public, anon;
revoke all on function public.start_space_round_wheel(uuid) from public, anon;
revoke all on function public.get_space_round_state(uuid) from public, anon;
revoke all on function public.accept_room_selection(uuid, uuid) from public, anon;

-- Yalnızca güvenilen sunucu kimliği aday planı kalıcılaştırabilir.
grant execute on function
  public.start_next_space_round(uuid, uuid, jsonb, text, text, text, boolean)
  to service_role;

-- Kullanıcı oturumuyla çalışan yollar: oy, çark, okuma ve kişisel kabul.
grant execute on function public.cast_space_round_vote(uuid, uuid, public.space_round_vote)
  to authenticated;
grant execute on function public.start_space_round_wheel(uuid) to authenticated;
grant execute on function public.get_space_round_state(uuid) to authenticated;
grant execute on function public.accept_room_selection(uuid, uuid) to authenticated;

comment on function public.start_next_space_round(uuid, uuid, jsonb, text, text, text, boolean) is
  'SECURITY DEFINER, yalnizca service_role. Gecmisi silmeden yeni tur acar. Aktor kimligi p_actor_id ile acikca gecilir ve uyeligi burada BAGIMSIZ dogrulanir. Aday secimi uc gecistir (priority_return / fresh_discovery / eligible_repeat); her adayin selection_reason degeri onu secen gecisten gelir. fresh_discovery space in TUM gecmisini dislar. priority_return + eligible_repeat en fazla 9 slot alir ve en az 1 slot gercek kesif olmak zorundadir. Hard suppression son denemede bile acilamaz; saglanamazsa candidate_pool_incomplete ile durur.';

comment on function public.accept_room_selection(uuid, uuid) is
  'SECURITY DEFINER. Cagiranin kisisel kabulunu ve kutuphane satirini tek transaction icinde yazar. Partnerin kabul durumu dondurulmez.';

comment on function public.create_or_reset_space_round(uuid, jsonb, boolean) is
  'KULLANIM DISI (RR-03). Eski istemci imzasi. Aday plani KABUL ETMEZ ve KAYDETMEZ; round_creation_moved domain hatasi firlatir. authenticated rolunden EXECUTE geri alinmistir.';
