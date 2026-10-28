-- LIVE STAGE — v7: 엑셀 방송 (라운드 · 라운드별 집계 · 선물 미션 · 선물 실시간 이펙트)
-- SQL Editor 에 전체 붙여넣고 Run

-- 1) 방송 라운드 상태
alter table public.streams add column if not exists round_no int not null default 0;
alter table public.streams add column if not exists round_title text;
alter table public.streams add column if not exists round_started_at timestamptz;
alter table public.streams add column if not exists round_ends_at timestamptz;
alter table public.streams add column if not exists round_status text not null default 'idle';
alter table public.performers add column if not exists round_total bigint not null default 0;

-- 1b) 채팅 종류에 라운드·미션 알림 추가
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('chat','gift','system','round','mission'));

-- 2) 라운드 기록
create table if not exists public.rounds (
  id bigint generated always as identity primary key,
  stream_id text not null references public.streams(id) on delete cascade,
  round_no int not null,
  title text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  winner_id uuid,
  winner_name text,
  total bigint not null default 0,
  results jsonb
);
create index if not exists rounds_stream on public.rounds(stream_id, round_no desc);

-- 3) 선물 미션 (시그니처): single = 한 번에 N스타 이상, round = 이번 라운드 누적 N스타 이상
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  stream_id text not null references public.streams(id) on delete cascade,
  performer_id uuid references public.performers(id) on delete cascade,   -- null = 전체(합산)
  title text not null,
  kind text not null default 'single' check (kind in ('single','round')),
  threshold int not null check (threshold > 0),
  done boolean not null default false,
  done_at timestamptz,
  done_by text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists missions_stream on public.missions(stream_id);

alter table public.rounds enable row level security;
alter table public.missions enable row level security;
drop policy if exists "rounds read" on public.rounds;
create policy "rounds read" on public.rounds for select using (true);
drop policy if exists "missions read" on public.missions;
create policy "missions read" on public.missions for select using (true);
do $$ begin alter publication supabase_realtime add table public.rounds; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.missions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.gifts; exception when duplicate_object then null; end $$;

-- 4) 라운드 시작 / 종료 (호스트·관리자)
create or replace function public.start_round(p_stream text, p_title text default null, p_minutes int default 0) returns int
language plpgsql security definer set search_path = public as $$
declare v_no int;
begin
  if not can_manage(p_stream) then raise exception '이 방송의 호스트 또는 관리자만 가능합니다'; end if;
  perform end_round(p_stream);   -- 진행 중이면 먼저 마감
  update streams set round_no = round_no + 1, round_title = nullif(trim(coalesce(p_title,'')),''), round_started_at = now(),
    round_ends_at = case when coalesce(p_minutes,0) > 0 then now() + (p_minutes || ' minutes')::interval else null end,
    round_status = 'running' where id = p_stream returning round_no into v_no;
  update performers set round_total = 0 where stream_id = p_stream;
  update missions set done = false, done_at = null, done_by = null where stream_id = p_stream and kind = 'round';
  insert into rounds (stream_id, round_no, title) values (p_stream, v_no, nullif(trim(coalesce(p_title,'')),''));
  return v_no;
end $$;
grant execute on function public.start_round(text,text,int) to authenticated;

create or replace function public.end_round(p_stream text) returns void
language plpgsql security definer set search_path = public as $$
declare v_no int; v_status text; v_win record; v_total bigint; v_res jsonb;
begin
  if not can_manage(p_stream) then raise exception '이 방송의 호스트 또는 관리자만 가능합니다'; end if;
  select round_no, round_status into v_no, v_status from streams where id = p_stream;
  if v_status <> 'running' then return; end if;
  select id, name, emoji, round_total into v_win from performers where stream_id = p_stream order by round_total desc, sort limit 1;
  select coalesce(sum(round_total),0) into v_total from performers where stream_id = p_stream;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'emoji', emoji, 'stars', round_total) order by round_total desc, sort), '[]'::jsonb) into v_res from performers where stream_id = p_stream;
  update rounds set ended_at = now(), winner_id = v_win.id, winner_name = v_win.name, total = v_total, results = v_res where stream_id = p_stream and round_no = v_no;
  update streams set round_status = 'ended', round_ends_at = now() where id = p_stream;
  if v_win.id is not null then
    insert into messages (stream_id, user_id, nick, text, kind) values (p_stream, coalesce(auth.uid(), (select owner_id from streams where id = p_stream)), '시스템', '🏁 라운드 ' || v_no || ' 종료 — 우승 👑 ' || v_win.emoji || ' ' || v_win.name || ' (' || v_win.round_total || ' 스타)', 'round');
  end if;
end $$;
grant execute on function public.end_round(text) to authenticated;

-- 5) 미션 관리
create or replace function public.add_mission(p_stream text, p_performer uuid, p_title text, p_kind text, p_threshold int) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not can_manage(p_stream) then raise exception '이 방송의 호스트 또는 관리자만 가능합니다'; end if;
  if p_kind not in ('single','round') then raise exception '잘못된 종류'; end if;
  if length(trim(p_title)) = 0 then raise exception '미션 내용을 입력하세요'; end if;
  insert into missions (stream_id, performer_id, title, kind, threshold, sort) values (p_stream, p_performer, left(trim(p_title), 80), p_kind, p_threshold, (select coalesce(max(sort),0)+1 from missions where stream_id = p_stream)) returning id into v_id;
  return v_id;
end $$;
grant execute on function public.add_mission(text,uuid,text,text,int) to authenticated;

create or replace function public.remove_mission(p_mission uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_stream text;
begin
  select stream_id into v_stream from missions where id = p_mission;
  if v_stream is null or not can_manage(v_stream) then raise exception '권한 없음'; end if;
  delete from missions where id = p_mission;
end $$;
grant execute on function public.remove_mission(uuid) to authenticated;

create or replace function public.reset_mission(p_mission uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_stream text;
begin
  select stream_id into v_stream from missions where id = p_mission;
  if v_stream is null or not can_manage(v_stream) then raise exception '권한 없음'; end if;
  update missions set done = false, done_at = null, done_by = null where id = p_mission;
end $$;
grant execute on function public.reset_mission(uuid) to authenticated;

-- 6) 선물 보내기: 지갑 차감 + 라운드 집계 + 미션 달성 판정
create or replace function public.send_gift(p_stream text, p_performer uuid, p_gift text, p_emoji text, p_stars int)
returns void language plpgsql security definer set search_path = public as $$
declare v_nick text; v_status text; v_pname text; v_bal bigint; v_gid bigint; v_running boolean; v_ptotal bigint; v_all bigint; m record;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select nick, status into v_nick, v_status from profiles where id = auth.uid();
  if v_status <> 'active' then raise exception '제재 중인 계정입니다'; end if;
  if p_stars < 1 or p_stars > 1000000 then raise exception '잘못된 수량'; end if;
  select (round_status = 'running') into v_running from streams where id = p_stream and status = 'live';
  if v_running is null then raise exception '진행 중인 방송이 아닙니다'; end if;
  select name into v_pname from performers where id = p_performer and stream_id = p_stream;
  if v_pname is null then raise exception '출연자를 찾을 수 없습니다'; end if;
  select balance into v_bal from wallets where user_id = auth.uid() for update;
  if v_bal is null then insert into wallets (user_id) values (auth.uid()); v_bal := 0; end if;
  if v_bal < p_stars then raise exception 'INSUFFICIENT:스타가 부족합니다 (보유 %, 필요 %)', v_bal, p_stars; end if;
  update wallets set balance = balance - p_stars, updated_at = now() where user_id = auth.uid() returning balance into v_bal;
  insert into gifts (stream_id, performer_id, user_id, nick, gift, emoji, stars) values (p_stream, p_performer, auth.uid(), v_nick, p_gift, p_emoji, p_stars) returning id into v_gid;
  insert into wallet_ledger (user_id, delta, reason, ref, balance_after) values (auth.uid(), -p_stars, 'gift', v_gid::text, v_bal);
  update performers set total = total + p_stars, round_total = round_total + (case when v_running then p_stars else 0 end) where id = p_performer returning round_total into v_ptotal;
  insert into messages (stream_id, user_id, nick, text, kind) values (p_stream, auth.uid(), v_nick, p_emoji || ' ' || v_pname || ' 에게 ' || p_gift || ' ' || p_stars || ' 스타 선물!', 'gift');
  -- 미션 판정
  select coalesce(sum(round_total),0) into v_all from performers where stream_id = p_stream;
  for m in select * from missions where stream_id = p_stream and not done and (performer_id is null or performer_id = p_performer) loop
    if (m.kind = 'single' and p_stars >= m.threshold)
       or (m.kind = 'round' and v_running and ((m.performer_id is not null and v_ptotal >= m.threshold) or (m.performer_id is null and v_all >= m.threshold))) then
      update missions set done = true, done_at = now(), done_by = v_nick where id = m.id;
      insert into messages (stream_id, user_id, nick, text, kind) values (p_stream, auth.uid(), '시스템', '🎯 미션 달성! ' || m.title || (case when m.performer_id is not null then ' — ' || v_pname else '' end) || ' (' || v_nick || ' 님)', 'mission');
    end if;
  end loop;
end $$;
