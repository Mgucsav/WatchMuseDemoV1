-- =============================================================================
-- WatchMuse — kalabalık odalarda çoğunluk eşleşmesi ve "Belki" yedeği.
--
-- Bir aday önce kesin kurala göre eşleşir:
--   * 2 kişilik odada: iki kişi de "İsterim" dedi;
--   * 3+ kişilik odada: katılımcıların yarısından fazlası "İsterim" dedi ve
--     kimse "İstemiyorum" demedi.
-- Turda kesin eşleşen hiç film yoksa yedek kural devreye girer: herkesin oy
-- verdiği ve kimsenin "İstemiyorum" demediği (yani herkesin en az "Belki"
-- dediği) filmler eşleşmiş sayılır. İkisi de yoksa tur no_match olur.
--
-- Kural tek bir yardımcı fonksiyondadır. Eşleşmeyi hesaplayan dört fonksiyon
-- kopyalanmaz; 20260902000100'deki gibi o anki tanımları okunur ve yalnız
-- "İsterim sayısı = katılımcı sayısı" koşulu yardımcıyla değiştirilir. Böylece
-- önceki yamalar (çok kişili oda, sunucu sıralaması) korunur. Beklenen koşul
-- bulunamazsa migration durur; yeniden çalıştırılırsa yamalı fonksiyonları
-- atlar.
-- =============================================================================

create or replace function public.space_candidate_is_match(
  p_round_id uuid,
  p_candidate_id uuid,
  p_participant_count integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with tallies as (
    select
      c.id,
      count(v.id) filter (where v.choice = 'want'::public.space_round_vote) as wants,
      count(v.id) filter (where v.choice = 'skip'::public.space_round_vote) as skips,
      count(v.id) as votes
    from public.room_candidates c
    left join public.room_votes v
      on v.round_id = c.round_id and v.candidate_id = c.id
    where c.round_id = p_round_id
    group by c.id
  ), strict_matches as (
    select t.id
    from tallies t
    where case
      when p_participant_count <= 2 then t.wants = p_participant_count
      else t.skips = 0 and t.wants * 2 > p_participant_count
    end
  )
  select case
    when exists (select 1 from strict_matches) then
      exists (select 1 from strict_matches s where s.id = p_candidate_id)
    else
      -- "Belki" yedeği: herkes oy verdi ve kimse reddetmedi.
      exists (
        select 1 from tallies t
        where t.id = p_candidate_id
          and t.skips = 0
          and t.votes >= p_participant_count
      )
  end
$$;

revoke all on function public.space_candidate_is_match(uuid, uuid, integer)
  from public, anon, authenticated;

comment on function public.space_candidate_is_match(uuid, uuid, integer) is
  'Kesin kural: 2 kişide oybirliği İsterim, 3+ kişide çoğunluk İsterim ve hiç İstemiyorum yok. Turda kesin eşleşme yoksa herkesin en az Belki dediği filmler. Eşleşme, çark ve geçmişten geri dönüş bunu kullanır.';

do $migration$
declare
  v_target record;
  v_definition text;
  v_updated text;
begin
  for v_target in
    select *
    from (values
      (
        'public.cast_space_round_vote(uuid,uuid,public.space_round_vote)'::regprocedure,
        $re$\(\s*select count\(\*\) from public\.room_votes v\s+where v\.round_id = v_round\.id and v\.candidate_id = c\.id\s+and v\.choice = 'want'::public\.space_round_vote\s*\) = v_participant_count$re$,
        'public.space_candidate_is_match(v_round.id, c.id, v_participant_count)'
      ),
      (
        'public.start_space_round_wheel(uuid)'::regprocedure,
        $re$\(\s*select count\(\*\) from public\.room_votes v\s+where v\.round_id = v_round\.id and v\.candidate_id = c\.id\s+and v\.choice = 'want'::public\.space_round_vote\s*\) = v_participant_count$re$,
        'public.space_candidate_is_match(v_round.id, c.id, v_participant_count)'
      ),
      (
        'public.get_space_round_state(uuid)'::regprocedure,
        $re$\(\s*select count\(\*\) from public\.room_votes v\s+where v\.round_id = v_round\.id and v\.candidate_id = c\.id\s+and v\.choice = 'want'::public\.space_round_vote\s*\) = v_participant_count$re$,
        'public.space_candidate_is_match(v_round.id, c.id, v_participant_count)'
      ),
      (
        'public.start_next_space_round(uuid,uuid,jsonb,text,text,text,boolean,text[])'::regprocedure,
        $re$\(\s*select count\(\*\)\s+from public\.room_votes v\s+where v\.round_id = r\.id\s+and v\.candidate_id = c\.id\s+and v\.choice = 'want'::public\.space_round_vote\s*\) = \(select count\(\*\) from public\.participants current_member where current_member\.space_id = p_space_id\)$re$,
        'public.space_candidate_is_match(r.id, c.id, (select count(*)::integer from public.participants current_member where current_member.space_id = p_space_id))'
      )
    ) as targets(fn, pattern, replacement)
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_target.fn);
    v_updated := pg_catalog.regexp_replace(v_definition, v_target.pattern, v_target.replacement, 'g');

    if v_updated = v_definition then
      -- Yeniden çalıştırma: fonksiyon zaten yardımcıyı kullanıyorsa atla.
      if pg_catalog.strpos(v_definition, 'public.space_candidate_is_match(') > 0 then
        continue;
      end if;
      raise exception 'majority_match_patch_failed: %', v_target.fn;
    end if;

    execute v_updated;
  end loop;
end
$migration$;
