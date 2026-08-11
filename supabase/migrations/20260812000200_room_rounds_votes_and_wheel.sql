-- =============================================================================
-- WatchMuse — oda seçim turu: 10 aday, gizli oylar ve ortak çark
--
-- Bu migration önceki üç oda migration'ından SONRA uygulanır.
-- Oy tablolarına doğrudan istemci erişimi yoktur; bütün okuma/yazma aşağıdaki
-- SECURITY DEFINER fonksiyonlarıyla yapılır. Böylece bir katılımcı partnerinin
-- tek tek kararlarını, sonuç açıklanana kadar okuyamaz.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'space_round_status' and n.nspname = 'public'
  ) then
    create type public.space_round_status as enum
      ('voting', 'matching', 'spinning', 'result', 'no_match');
  end if;

  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'space_round_vote' and n.nspname = 'public'
  ) then
    create type public.space_round_vote as enum ('skip', 'maybe', 'want');
  end if;
end
$$;

create table if not exists public.space_rounds (
  id                  uuid primary key default gen_random_uuid(),
  space_id            uuid not null unique references public.spaces (id) on delete cascade,
  status              public.space_round_status not null default 'voting',
  candidate_count     smallint not null default 10 check (candidate_count = 10),
  winner_candidate_id uuid,
  spin_started_at     timestamptz,
  spin_duration_ms    integer not null default 7000 check (spin_duration_ms between 3000 and 15000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint space_rounds_spin_state check (
    (status in ('spinning', 'result') and winner_candidate_id is not null and spin_started_at is not null)
    or (status not in ('spinning', 'result'))
  )
);

create table if not exists public.room_candidates (
  id                uuid primary key default gen_random_uuid(),
  round_id          uuid not null references public.space_rounds (id) on delete cascade,
  position          smallint not null check (position between 1 and 10),
  tmdb_movie_id     integer not null check (tmdb_movie_id > 0),
  title             text not null check (char_length(btrim(title)) between 1 and 300),
  original_title    text,
  poster_path       text,
  overview          text,
  release_year      smallint check (release_year between 1800 and 2200),
  tmdb_vote_average numeric(3,1) check (tmdb_vote_average between 0 and 10),
  created_at        timestamptz not null default now(),
  constraint room_candidates_round_position_unique unique (round_id, position),
  constraint room_candidates_round_tmdb_unique unique (round_id, tmdb_movie_id),
  constraint room_candidates_poster_path_format check (poster_path is null or poster_path ~ '^/[^[:space:]]+$')
);

create table if not exists public.room_votes (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references public.space_rounds (id) on delete cascade,
  candidate_id uuid not null references public.room_candidates (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  choice       public.space_round_vote not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint room_votes_one_choice_per_user unique (round_id, candidate_id, user_id)
);

create index if not exists room_candidates_round_position_idx on public.room_candidates (round_id, position);
create index if not exists room_votes_round_user_idx on public.room_votes (round_id, user_id);
create index if not exists room_votes_round_candidate_choice_idx on public.room_votes (round_id, candidate_id, choice);

drop trigger if exists space_rounds_set_updated_at on public.space_rounds;
create trigger space_rounds_set_updated_at before update on public.space_rounds
for each row execute function public.set_updated_at();

drop trigger if exists room_votes_set_updated_at on public.room_votes;
create trigger room_votes_set_updated_at before update on public.room_votes
for each row execute function public.set_updated_at();

-- Ayrı bir yardımcı fonksiyon, aday tablosunun RLS politikasında güvenli ve
-- özyinelemesiz katılımcı kontrolü sağlar.
create or replace function public.is_round_participant(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.space_rounds r
    join public.participants p on p.space_id = r.space_id
    where r.id = p_round_id and p.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_round_participant(uuid) from public, anon;
grant execute on function public.is_round_participant(uuid) to authenticated;

revoke all on public.space_rounds, public.room_candidates, public.room_votes from anon, authenticated;
alter table public.space_rounds enable row level security;
alter table public.room_candidates enable row level security;
alter table public.room_votes enable row level security;

drop policy if exists space_rounds_select_participants on public.space_rounds;
create policy space_rounds_select_participants on public.space_rounds
for select to authenticated using (public.is_space_participant(space_id));

drop policy if exists room_candidates_select_participants on public.room_candidates;
create policy room_candidates_select_participants on public.room_candidates
for select to authenticated using (public.is_round_participant(round_id));

-- room_votes için politika BİLİNÇLİ olarak yoktur. Oyların tek tek okunması
-- yalnızca get_space_round_state() içindeki kurallı, toplulaştırılmış çıktı ile
-- mümkündür.

-- İlk turu atomik olarak oluşturur; no_match sonrası yeni tur da buradan açılır.
-- Aynı anda gelen iki ilk istek, oda satırı kilidi sayesinde tek aday setine
-- bağlanır. Adaylar burada saklandığı için iki tarafa da aynı sırada gider.
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
declare
  v_user_id uuid := (select auth.uid());
  v_space public.spaces%rowtype;
  v_round public.space_rounds%rowtype;
  v_round_id uuid;
  v_candidate jsonb;
  v_position integer;
  v_movie_id integer;
  v_title text;
  v_original_title text;
  v_poster_path text;
  v_overview text;
  v_release_year smallint;
  v_vote_average numeric(3,1);
  v_seen_ids integer[] := '{}';
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select * into v_space from public.spaces where id = p_space_id for update;
  if not found or v_space.status <> 'active'::public.space_status then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.participants p where p.space_id = p_space_id and p.user_id = v_user_id
  ) then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  if (select count(*) from public.participants p where p.space_id = p_space_id) <> 2 then
    raise exception 'round_not_ready' using errcode = 'P0001';
  end if;

  select * into v_round from public.space_rounds where space_id = p_space_id for update;
  if found and not (p_reset and v_round.status = 'no_match'::public.space_round_status) then
    return v_round.id;
  end if;

  if found then
    delete from public.space_rounds where id = v_round.id;
  end if;

  if jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) <> 10 then
    raise exception 'invalid_candidates' using errcode = '22023';
  end if;

  insert into public.space_rounds (space_id) values (p_space_id) returning id into v_round_id;

  for v_position in 0..9 loop
    v_candidate := p_candidates -> v_position;
    v_movie_id := nullif(v_candidate ->> 'tmdbMovieId', '')::integer;
    v_title := nullif(btrim(coalesce(v_candidate ->> 'title', '')), '');
    v_original_title := nullif(btrim(coalesce(v_candidate ->> 'originalTitle', '')), '');
    v_poster_path := nullif(btrim(coalesce(v_candidate ->> 'posterPath', '')), '');
    v_overview := nullif(btrim(coalesce(v_candidate ->> 'overview', '')), '');
    v_release_year := nullif(v_candidate ->> 'releaseYear', '')::smallint;
    v_vote_average := nullif(v_candidate ->> 'voteAverage', '')::numeric(3,1);

    if v_movie_id is null or v_movie_id <= 0 or v_title is null
       or char_length(v_title) > 300 or v_movie_id = any(v_seen_ids)
       or (v_poster_path is not null and v_poster_path !~ '^/[^[:space:]]+$')
       or (v_release_year is not null and (v_release_year < 1800 or v_release_year > 2200))
       or (v_vote_average is not null and (v_vote_average < 0 or v_vote_average > 10)) then
      raise exception 'invalid_candidates' using errcode = '22023';
    end if;

    v_seen_ids := array_append(v_seen_ids, v_movie_id);
    insert into public.room_candidates (
      round_id, position, tmdb_movie_id, title, original_title, poster_path,
      overview, release_year, tmdb_vote_average
    ) values (
      v_round_id, v_position + 1, v_movie_id, v_title, v_original_title,
      v_poster_path, v_overview, v_release_year, v_vote_average
    );
  end loop;

  return v_round_id;
end;
$$;

-- Oy kaydı yalnızca çağıranın kendi user_id'siyle yazılır. İki kişi de 10
-- adayı bitirdiğinde ortak "want" adaylarının sayısı sunucuda hesaplanır.
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
  v_candidate_exists boolean;
  v_participant_count integer;
  v_finished_count integer;
  v_match_count integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.participants p where p.space_id = p_space_id and p.user_id = v_user_id) then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  select * into v_round from public.space_rounds where space_id = p_space_id for update;
  if not found then
    raise exception 'round_not_ready' using errcode = 'P0001';
  end if;
  if v_round.status <> 'voting'::public.space_round_status then
    raise exception 'round_closed_for_votes' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.room_candidates c where c.id = p_candidate_id and c.round_id = v_round.id
  ) into v_candidate_exists;
  if not v_candidate_exists then
    raise exception 'invalid_round_candidate' using errcode = '22023';
  end if;

  insert into public.room_votes (round_id, candidate_id, user_id, choice)
  values (v_round.id, p_candidate_id, v_user_id, p_choice)
  on conflict (round_id, candidate_id, user_id)
  do update set choice = excluded.choice, updated_at = now();

  select count(*) into v_participant_count from public.participants p where p.space_id = p_space_id;
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
      and (select count(*) from public.room_votes v
           where v.round_id = v_round.id and v.candidate_id = c.id
             and v.choice = 'want'::public.space_round_vote) = v_participant_count;

    update public.space_rounds
    set status = case when v_match_count > 0 then 'matching'::public.space_round_status else 'no_match'::public.space_round_status end
    where id = v_round.id;
  end if;
end;
$$;

-- Çarkın sonucu random() ile sunucuda BİR KEZ seçilir ve zaman damgasıyla
-- saklanır. İstemci seçimi yapmaz; her iki ekran aynı kazanana animasyon yapar.
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
  v_winner_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.participants p where p.space_id = p_space_id and p.user_id = v_user_id) then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  select * into v_round from public.space_rounds where space_id = p_space_id for update;
  if not found then raise exception 'round_not_ready' using errcode = 'P0001'; end if;
  if v_round.status in ('spinning'::public.space_round_status, 'result'::public.space_round_status) then return; end if;
  if v_round.status <> 'matching'::public.space_round_status then
    raise exception 'round_not_ready' using errcode = 'P0001';
  end if;

  select count(*) into v_participant_count from public.participants p where p.space_id = p_space_id;
  select c.id into v_winner_id
  from public.room_candidates c
  where c.round_id = v_round.id
    and (select count(*) from public.room_votes v
         where v.round_id = v_round.id and v.candidate_id = c.id
           and v.choice = 'want'::public.space_round_vote) = v_participant_count
  order by random()
  limit 1;

  if v_winner_id is null then
    update public.space_rounds set status = 'no_match'::public.space_round_status where id = v_round.id;
    return;
  end if;

  update public.space_rounds
  set status = 'spinning'::public.space_round_status,
      winner_candidate_id = v_winner_id,
      spin_started_at = clock_timestamp()
  where id = v_round.id;
end;
$$;

-- İstemcinin tek okuma noktası. Kendi oyları hariç oylar hiç dönmez; ortak
-- adaylar sadece iki taraf da bitirdikten sonra görünür. Süre dolunca sonuç
-- bu fonksiyon çağrısında atomik olarak "result" durumuna geçer.
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
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.participants p where p.space_id = p_space_id and p.user_id = v_user_id) then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  select * into v_round from public.space_rounds where space_id = p_space_id for update;
  if not found then return jsonb_build_object('round', null); end if;

  if v_round.status = 'spinning'::public.space_round_status
     and v_round.spin_started_at + make_interval(secs => v_round.spin_duration_ms::numeric / 1000) <= clock_timestamp() then
    update public.space_rounds set status = 'result'::public.space_round_status where id = v_round.id;
    select * into v_round from public.space_rounds where id = v_round.id;
  end if;

  select count(*) into v_participant_count from public.participants p where p.space_id = p_space_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'position', c.position, 'tmdbMovieId', c.tmdb_movie_id,
    'title', c.title, 'originalTitle', c.original_title, 'posterPath', c.poster_path,
    'overview', c.overview, 'releaseYear', c.release_year, 'voteAverage', c.tmdb_vote_average
  ) order by c.position), '[]'::jsonb) into v_candidates
  from public.room_candidates c where c.round_id = v_round.id;

  select coalesce(jsonb_object_agg(v.candidate_id::text, v.choice::text), '{}'::jsonb), count(*)
  into v_my_votes, v_my_vote_count
  from public.room_votes v where v.round_id = v_round.id and v.user_id = v_user_id;

  select exists (
    select 1 from public.participants p
    where p.space_id = p_space_id and p.user_id <> v_user_id
      and (select count(*) from public.room_votes v where v.round_id = v_round.id and v.user_id = p.user_id) = v_round.candidate_count
  ) into v_partner_completed;

  if v_round.status in ('matching'::public.space_round_status, 'spinning'::public.space_round_status, 'result'::public.space_round_status) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'position', c.position, 'tmdbMovieId', c.tmdb_movie_id,
      'title', c.title, 'originalTitle', c.original_title, 'posterPath', c.poster_path,
      'overview', c.overview, 'releaseYear', c.release_year, 'voteAverage', c.tmdb_vote_average
    ) order by c.position), '[]'::jsonb) into v_matches
    from public.room_candidates c
    where c.round_id = v_round.id
      and (select count(*) from public.room_votes v
           where v.round_id = v_round.id and v.candidate_id = c.id
             and v.choice = 'want'::public.space_round_vote) = v_participant_count;
  end if;

  if v_round.winner_candidate_id is not null then
    select jsonb_build_object(
      'id', c.id, 'position', c.position, 'tmdbMovieId', c.tmdb_movie_id,
      'title', c.title, 'originalTitle', c.original_title, 'posterPath', c.poster_path,
      'overview', c.overview, 'releaseYear', c.release_year, 'voteAverage', c.tmdb_vote_average
    ) into v_winner from public.room_candidates c where c.id = v_round.winner_candidate_id;
  end if;

  return jsonb_build_object('round', jsonb_build_object(
    'id', v_round.id, 'status', v_round.status::text,
    'candidateCount', v_round.candidate_count, 'candidates', v_candidates,
    'myVotes', v_my_votes, 'myVoteCount', v_my_vote_count,
    'partnerCompleted', v_partner_completed, 'matchedCandidates', v_matches,
    'winnerCandidate', v_winner, 'spinStartedAt', v_round.spin_started_at,
    'spinDurationMs', v_round.spin_duration_ms
  ));
end;
$$;

revoke all on function public.create_or_reset_space_round(uuid, jsonb, boolean) from public, anon;
revoke all on function public.cast_space_round_vote(uuid, uuid, public.space_round_vote) from public, anon;
revoke all on function public.start_space_round_wheel(uuid) from public, anon;
revoke all on function public.get_space_round_state(uuid) from public, anon;
grant execute on function public.create_or_reset_space_round(uuid, jsonb, boolean) to authenticated;
grant execute on function public.cast_space_round_vote(uuid, uuid, public.space_round_vote) to authenticated;
grant execute on function public.start_space_round_wheel(uuid) to authenticated;
grant execute on function public.get_space_round_state(uuid) to authenticated;
