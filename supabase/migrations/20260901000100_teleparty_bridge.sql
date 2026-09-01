-- =============================================================================
-- WatchMuse — iki kişilik seçimden Teleparty davetine güvenli köprü
--
-- Sıra: 20260814000100_room_subscriptions.sql SONRASI.
-- Teleparty oturumunu WatchMuse oluşturmaz. Hostun resmi Teleparty uzantısından
-- aldığı davet, yalnızca iki katılımcı da aynı seçimi kabul ettikten sonra
-- paylaşılır. Kişi bazlı kabul kayıtları istemciye açılmaz.
-- =============================================================================

create table if not exists public.room_teleparty_sessions (
  selection_id uuid primary key
    references public.room_selections (id) on delete cascade,
  join_url text not null,
  shared_by uuid not null references auth.users (id) on delete cascade,
  shared_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_teleparty_sessions_official_join_url check (
    char_length(join_url) between 52 and 256
    and join_url ~ '^https://redirect[.]teleparty[.]com/join/[A-Za-z0-9_-]{16,128}$'
  )
);

revoke all on table public.room_teleparty_sessions
  from public, anon, authenticated;
alter table public.room_teleparty_sessions enable row level security;

-- Doğrudan istemci politikası bilinçli olarak YOKTUR. Okuma ve yazma yalnızca
-- aşağıdaki sanitize edilmiş SECURITY DEFINER fonksiyonlarından yapılır.

create or replace function public.get_space_teleparty_state(p_space_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_states jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.participants p
    where p.space_id = p_space_id and p.user_id = v_user_id
  ) then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'selectionId', s.id,
    -- Partnerin kabulü, çağıran da kabul etmeden asla görünür hale gelmez.
    'bothAccepted', readiness.both_accepted,
    'joinUrl', case when readiness.both_accepted then tp.join_url else null end
  ) order by s.selected_at desc), '[]'::jsonb)
  into v_states
  from public.room_selections s
  join public.space_rounds r on r.id = s.round_id
  left join public.room_teleparty_sessions tp on tp.selection_id = s.id
  cross join lateral (
    select (
      (select count(*) from public.participants p
       where p.space_id = p_space_id) = 2
      and exists (
        select 1 from public.room_selection_acceptances mine
        where mine.selection_id = s.id and mine.user_id = v_user_id
      )
      and (
        select count(distinct accepted.user_id)
        from public.room_selection_acceptances accepted
        join public.participants member
          on member.space_id = p_space_id
         and member.user_id = accepted.user_id
        where accepted.selection_id = s.id
      ) = 2
    ) as both_accepted
  ) readiness
  where s.space_id = p_space_id
    and s.response_deadline > clock_timestamp()
    and r.status = 'result'::public.space_round_status;

  return v_states;
end;
$$;

create or replace function public.share_room_teleparty_link(
  p_space_id uuid,
  p_selection_id uuid,
  p_join_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_selection public.room_selections%rowtype;
  v_participant_count integer;
  v_acceptance_count integer;
  v_now timestamptz;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.participants p
    where p.space_id = p_space_id and p.user_id = v_user_id
  ) then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.participants p
    where p.space_id = p_space_id
      and p.user_id = v_user_id
      and p.role = 'host'
  ) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  if p_join_url is null
     or char_length(p_join_url) not between 52 and 256
     or p_join_url !~ '^https://redirect[.]teleparty[.]com/join/[A-Za-z0-9_-]{16,128}$' then
    raise exception 'invalid_teleparty_link' using errcode = '22023';
  end if;

  -- Kabul RPC'siyle aynı space kilidi: ikinci kabul ve paylaşım yarışamaz.
  perform 1 from public.spaces s where s.id = p_space_id for update;
  v_now := clock_timestamp();

  select * into v_selection
  from public.room_selections s
  where s.id = p_selection_id and s.space_id = p_space_id;
  if not found then
    raise exception 'invalid_selection' using errcode = 'P0001';
  end if;
  if v_selection.response_deadline <= v_now then
    raise exception 'selection_expired' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.space_rounds r
    where r.id = v_selection.round_id
      and r.space_id = p_space_id
      and r.status = 'result'::public.space_round_status
  ) then
    raise exception 'invalid_selection' using errcode = 'P0001';
  end if;

  select count(*) into v_participant_count
  from public.participants p where p.space_id = p_space_id;

  select count(distinct accepted.user_id) into v_acceptance_count
  from public.room_selection_acceptances accepted
  join public.participants member
    on member.space_id = p_space_id and member.user_id = accepted.user_id
  where accepted.selection_id = p_selection_id;

  if v_participant_count <> 2 or v_acceptance_count <> 2 then
    raise exception 'teleparty_not_ready' using errcode = 'P0001';
  end if;

  insert into public.room_teleparty_sessions (
    selection_id, join_url, shared_by, shared_at, updated_at
  ) values (
    p_selection_id, p_join_url, v_user_id, v_now, v_now
  )
  on conflict (selection_id) do update
  set join_url = excluded.join_url,
      shared_by = excluded.shared_by,
      shared_at = excluded.shared_at,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.get_space_teleparty_state(uuid)
  from public, anon;
revoke all on function public.share_room_teleparty_link(uuid, uuid, text)
  from public, anon;

grant execute on function public.get_space_teleparty_state(uuid)
  to authenticated;
grant execute on function public.share_room_teleparty_link(uuid, uuid, text)
  to authenticated;

comment on function public.get_space_teleparty_state(uuid) is
  'SECURITY DEFINER. Kişi bazlı kabul verisi döndürmez. Çağıran da kabul etmiş ve odanın iki katılımcısı da hazırsa ortak hazır olma durumu ile resmi Teleparty davetini döndürür.';

comment on function public.share_room_teleparty_link(uuid, uuid, text) is
  'SECURITY DEFINER. Yalnızca oda sahibi, iki katılımcı da süresi dolmamış seçimi kabul ettikten sonra resmi redirect.teleparty.com davetini paylaşabilir.';
