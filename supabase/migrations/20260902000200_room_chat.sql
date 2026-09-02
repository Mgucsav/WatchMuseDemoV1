-- =============================================================================
-- WatchMuse — private/public odalarda katılımcılara özel metin sohbeti
-- =============================================================================

create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  sender_display_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint room_messages_sender_name_valid
    check (char_length(btrim(sender_display_name)) between 1 and 80),
  constraint room_messages_body_valid
    check (char_length(btrim(body)) between 1 and 1000)
);

create index if not exists room_messages_space_created_idx
  on public.room_messages (space_id, created_at desc);
create index if not exists room_messages_user_recent_idx
  on public.room_messages (user_id, created_at desc);

revoke all on table public.room_messages from public, anon, authenticated;
alter table public.room_messages enable row level security;

-- İstemci tabloyu doğrudan okuyamaz. Fonksiyon yalnız oda katılımcısına son
-- mesajları ve güvenli görünen adı döndürür; user_id hiçbir zaman dışarı çıkmaz.
create or replace function public.get_space_messages(
  p_space_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  sender_display_name text,
  body text,
  created_at timestamptz,
  is_mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_limit integer;
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

  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);
  return query
  select recent.id,
         recent.sender_display_name,
         recent.body,
         recent.created_at,
         recent.user_id = v_user_id
  from (
    select m.id, m.sender_display_name, m.body, m.created_at, m.user_id
    from public.room_messages m
    where m.space_id = p_space_id
    order by m.created_at desc, m.id desc
    limit v_limit
  ) recent
  order by recent.created_at, recent.id;
end;
$$;

create or replace function public.send_space_message(
  p_space_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant public.participants%rowtype;
  v_display_name text;
  v_body text;
  v_message_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select * into v_participant
  from public.participants p
  where p.space_id = p_space_id and p.user_id = v_user_id
  for update;
  if not found then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  v_body := pg_catalog.btrim(coalesce(p_body, ''));
  if pg_catalog.char_length(v_body) not between 1 and 1000 then
    raise exception 'invalid_room_message' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.room_messages m
    where m.space_id = p_space_id
      and m.user_id = v_user_id
      and m.created_at > pg_catalog.clock_timestamp() - interval '750 milliseconds'
  ) then
    raise exception 'room_message_rate_limited' using errcode = 'P0001';
  end if;

  v_display_name := nullif(pg_catalog.btrim(v_participant.display_name), '');
  v_display_name := coalesce(
    v_display_name,
    case
      when v_participant.role = 'host'::public.participant_role then 'Oda sahibi'
      else 'Katılımcı'
    end
  );
  if v_display_name in (
    'Anonim misafir', 'Anonim oda sahibi', 'WatchMuse üyesi',
    'Oda sahibi', 'Katılımcı'
  ) then
    v_display_name := v_display_name || ' '
      || pg_catalog.upper(pg_catalog.substr(v_user_id::text, 1, 4));
  end if;

  insert into public.room_messages (
    space_id, user_id, sender_display_name, body
  ) values (
    p_space_id, v_user_id, v_display_name, v_body
  ) returning id into v_message_id;

  return v_message_id;
end;
$$;

revoke all on function public.get_space_messages(uuid, integer)
  from public, anon;
revoke all on function public.send_space_message(uuid, text)
  from public, anon;

grant execute on function public.get_space_messages(uuid, integer)
  to authenticated;
grant execute on function public.send_space_message(uuid, text)
  to authenticated;

comment on table public.room_messages is
  'Private/public oda katılımcılarının mesajları. Doğrudan istemci erişimi yoktur; sanitize edilmiş RPC kullanılır.';
comment on function public.get_space_messages(uuid, integer) is
  'Yalnız oda katılımcısına son mesajları user_id sızdırmadan döndürür.';
comment on function public.send_space_message(uuid, text) is
  'Yalnız oda katılımcısının 1-1000 karakterlik, hız sınırlı mesaj göndermesine izin verir.';
