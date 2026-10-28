-- LIVE STAGE — v8: v2 앱용 확장 (팀전·규칙·메모 / 출연자 수정·정렬·비활성화 / 라운드 일시정지 / 신고·제재·감사 기록)
-- 적용 순서: v1 → v2 → v3 → v4 → v5 → v6 → v7 → v8.  기존 데이터는 삭제하지 않습니다.

-- 1) 방송 메타
alter table public.streams add column if not exists mode text not null default 'individual';
alter table public.streams add column if not exists rules text;
alter table public.streams add column if not exists memo text;
alter table public.streams add column if not exists description text;
alter table public.streams add column if not exists teams jsonb not null default '{"A":"A팀","B":"B팀"}'::jsonb;
alter table public.streams add column if not exists ended_at timestamptz;
alter table public.streams add column if not exists round_paused_at timestamptz;
alter table public.streams add column if not exists round_paused_ms bigint not null default 0;
alter table public.streams drop constraint if exists streams_status_check;
alter table public.streams add constraint streams_status_check check (status in ('live','ended','stopped','scheduled'));

-- 2) 출연자 메타
alter table public.performers add column if not exists team text;
alter table public.performers add column if not exists active boolean not null default true;
alter table public.performers add column if not exists hue int;
alter table public.performers add column if not exists bio text;

create or replace function public.set_stream_meta(p_stream text, p_mode text, p_rules text, p_memo text, p_teams jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage(p_stream) then raise exception '이 방송의 호스트 또는 관리자만 가능합니다'; end if;
  update streams set mode = case when p_mode in ('individual','team') then p_mode else mode end, rules = left(p_rules, 2000), memo = left(p_memo, 2000), teams = coalesce(p_teams, teams) where id = p_stream;
end $$;
grant execute on function public.set_stream_meta(text,text,text,text,jsonb) to authenticated;

create or replace function public.update_performer(p_performer uuid, p_name text, p_emoji text, p_team text, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_stream text;
begin
  select stream_id into v_stream from performers where id = p_performer;
  if v_stream is null or not can_manage(v_stream) then raise exception '권한 없음'; end if;
  update performers set name = left(trim(p_name), 30), emoji = coalesce(p_emoji, emoji), team = nullif(p_team,''), active = coalesce(p_active, true) where id = p_performer;
end $$;
grant execute on function public.update_performer(uuid,text,text,text,boolean) to authenticated;

create or replace function public.reorder_performers(p_stream text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare i int;
begin
  if not can_manage(p_stream) then raise exception '권한 없음'; end if;
  for i in 1..coalesce(array_length(p_ids,1),0) loop
    update performers set sort = i - 1 where id = p_ids[i] and stream_id = p_stream;
  end loop;
end $$;
grant execute on function public.reorder_performers(text,uuid[]) to authenticated;

-- 3) 라운드 일시정지 / 재개 (일시정지 중 후원 거절, 마감 후 후원은 누적에만)
create or replace function public.pause_round(p_stream text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage(p_stream) then raise exception '권한 없음'; end if;
  update streams set round_status = 'paused', round_paused_at = now() where id = p_stream and round_status = 'running';
end $$;
grant execute on function public.pause_round(text) to authenticated;

create or replace function public.resume_round(p_stream text) returns void
language plpgsql security definer set search_path = public as $$
declare v_p timestamptz; v_ms bigint;
begin
  if not can_manage(p_stream) then raise exception '권한 없음'; end if;
  select round_paused_at into v_p from streams where id = p_stream and round_status = 'paused';
  if v_p is null then return; end if;
  v_ms := extract(epoch from (now() - v_p)) * 1000;
  update streams set round_status = 'running', round_paused_at = null, round_paused_ms = round_paused_ms + v_ms,
    round_ends_at = case when round_ends_at is null then null else round_ends_at + (now() - v_p) end where id = p_stream;
end $$;
grant execute on function public.resume_round(text) to authenticated;

-- end_round 는 paused 상태도 마감 가능하게
create or replace function public.end_round(p_stream text) returns void
language plpgsql security definer set search_path = public as $$
declare v_no int; v_status text; v_win record; v_total bigint; v_res jsonb;
begin
  if not can_manage(p_stream) then raise exception '이 방송의 호스트 또는 관리자만 가능합니다'; end if;
  select round_no, round_status into v_no, v_status from streams where id = p_stream;
  if v_status not in ('running','paused') then return; end if;
  select id, name, emoji, round_total into v_win from performers where stream_id = p_stream and active order by round_total desc, sort limit 1;
  select coalesce(sum(round_total),0) into v_total from performers where stream_id = p_stream and active;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'emoji', emoji, 'stars', round_total) order by round_total desc, sort), '[]'::jsonb) into v_res from performers where stream_id = p_stream and active;
  update rounds set ended_at = now(), winner_id = v_win.id, winner_name = v_win.name, total = v_total, results = v_res where stream_id = p_stream and round_no = v_no;
  update streams set round_status = 'ended', round_ends_at = now(), round_paused_at = null where id = p_stream;
  if v_win.id is not null and v_win.round_total > 0 then
    insert into messages (stream_id, user_id, nick, text, kind) values (p_stream, coalesce(auth.uid(), (select owner_id from streams where id = p_stream)), '시스템', '🏁 라운드 ' || v_no || ' 종료 — 우승 👑 ' || v_win.emoji || ' ' || v_win.name || ' (' || v_win.round_total || ' 스타)', 'round');
  end if;
end $$;

-- send_gift: 일시정지 거절 + 마감 후 누적만 반영
create or replace function public.send_gift(p_stream text, p_performer uuid, p_gift text, p_emoji text, p_stars int)
returns void language plpgsql security definer set search_path = public as $$
declare v_nick text; v_status text; v_pname text; v_bal bigint; v_gid bigint; v_rstatus text; v_ends timestamptz; v_counts boolean; v_ptotal bigint; v_all bigint; m record;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select nick, status into v_nick, v_status from profiles where id = auth.uid();
  if v_status <> 'active' then raise exception '제재 중인 계정입니다'; end if;
  if p_stars < 1 or p_stars > 1000000 then raise exception '잘못된 수량'; end if;
  select round_status, round_ends_at into v_rstatus, v_ends from streams where id = p_stream and status = 'live';
  if v_rstatus is null then raise exception '진행 중인 방송이 아닙니다'; end if;
  if v_rstatus = 'paused' then raise exception '라운드가 일시정지 중입니다 — 재개 후 후원할 수 있습니다'; end if;
  v_counts := (v_rstatus = 'running' and (v_ends is null or v_ends > now()));
  select name into v_pname from performers where id = p_performer and stream_id = p_stream and active;
  if v_pname is null then raise exception '출연자를 찾을 수 없습니다'; end if;
  select balance into v_bal from wallets where user_id = auth.uid() for update;
  if v_bal is null then insert into wallets (user_id) values (auth.uid()); v_bal := 0; end if;
  if v_bal < p_stars then raise exception 'INSUFFICIENT:스타가 부족합니다 (보유 %, 필요 %)', v_bal, p_stars; end if;
  update wallets set balance = balance - p_stars, updated_at = now() where user_id = auth.uid() returning balance into v_bal;
  insert into gifts (stream_id, performer_id, user_id, nick, gift, emoji, stars) values (p_stream, p_performer, auth.uid(), v_nick, p_gift, p_emoji, p_stars) returning id into v_gid;
  insert into wallet_ledger (user_id, delta, reason, ref, balance_after) values (auth.uid(), -p_stars, 'gift', v_gid::text, v_bal);
  update performers set total = total + p_stars, round_total = round_total + (case when v_counts then p_stars else 0 end) where id = p_performer returning round_total into v_ptotal;
  insert into messages (stream_id, user_id, nick, text, kind) values (p_stream, auth.uid(), v_nick, p_emoji || ' ' || v_pname || ' 에게 ' || p_gift || ' ' || p_stars || ' 스타 선물!', 'gift');
  select coalesce(sum(round_total),0) into v_all from performers where stream_id = p_stream and active;
  for m in select * from missions where stream_id = p_stream and not done and (performer_id is null or performer_id = p_performer) loop
    if (m.kind = 'single' and p_stars >= m.threshold) or (m.kind = 'round' and v_counts and ((m.performer_id is not null and v_ptotal >= m.threshold) or (m.performer_id is null and v_all >= m.threshold))) then
      update missions set done = true, done_at = now(), done_by = v_nick where id = m.id;
      insert into messages (stream_id, user_id, nick, text, kind) values (p_stream, auth.uid(), '시스템', '🎯 미션 달성! ' || m.title || (case when m.performer_id is not null then ' — ' || v_pname else '' end) || ' (' || v_nick || ' 님)', 'mission');
    end if;
  end loop;
end $$;

-- 4) 신고 · 감사 기록 · 제재
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  stream_id text references public.streams(id) on delete set null,
  reporter_id uuid references auth.users(id) on delete set null,
  reporter_nick text not null,
  target_nick text not null,
  reason text not null,
  detail text,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  action text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_nick text,
  action text not null,
  target text,
  detail text,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
alter table public.audit_log enable row level security;
drop policy if exists "reports admin read" on public.reports;
create policy "reports admin read" on public.reports for select using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
drop policy if exists "audit admin read" on public.audit_log;
create policy "audit admin read" on public.audit_log for select using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false) $$;

create or replace function public.create_report(p_stream text, p_target text, p_reason text, p_detail text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_nick text; v_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select nick into v_nick from profiles where id = auth.uid();
  insert into reports (stream_id, reporter_id, reporter_nick, target_nick, reason, detail) values (p_stream, auth.uid(), v_nick, left(trim(p_target), 40), left(p_reason, 60), left(p_detail, 300)) returning id into v_id;
  return v_id;
end $$;
grant execute on function public.create_report(text,text,text,text) to authenticated;

create or replace function public.admin_set_user_status(p_nick text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor text;
begin
  if not is_admin() then raise exception '관리자만 가능합니다'; end if;
  if p_status not in ('active','suspended','blocked') then raise exception '잘못된 상태'; end if;
  update profiles set status = p_status where nick = p_nick;
  select nick into v_actor from profiles where id = auth.uid();
  insert into audit_log (actor_id, actor_nick, action, target, detail) values (auth.uid(), v_actor, '이용자 상태 변경', p_nick, p_status);
end $$;
grant execute on function public.admin_set_user_status(text,text) to authenticated;

create or replace function public.resolve_report(p_report uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor text; v_target text; v_reason text;
begin
  if not is_admin() then raise exception '관리자만 가능합니다'; end if;
  select target_nick, reason into v_target, v_reason from reports where id = p_report;
  if v_target is null then raise exception '신고를 찾을 수 없습니다'; end if;
  if p_action = 'suspend' then perform admin_set_user_status(v_target, 'suspended'); end if;
  if p_action = 'block' then perform admin_set_user_status(v_target, 'blocked'); end if;
  update reports set status = case when p_action = 'dismiss' then 'dismissed' else 'resolved' end,
    action = case p_action when 'dismiss' then '기각' when 'resolve' then '조치 완료' when 'suspend' then '대상 정지' when 'block' then '대상 영구 차단' else p_action end,
    resolved_by = auth.uid(), resolved_at = now() where id = p_report;
  select nick into v_actor from profiles where id = auth.uid();
  insert into audit_log (actor_id, actor_nick, action, target, detail) values (auth.uid(), v_actor, '신고 처리', v_target, v_reason || ' → ' || p_action);
end $$;
grant execute on function public.resolve_report(uuid,text) to authenticated;

-- 방송 중단도 감사 기록에 남기기 (set_stream 호출 시 status='stopped' 이면 기록)
create or replace function public.log_stream_stop() returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor text;
begin
  if new.status = 'stopped' and old.status <> 'stopped' then
    select nick into v_actor from profiles where id = auth.uid();
    insert into audit_log (actor_id, actor_nick, action, target, detail) values (auth.uid(), coalesce(v_actor, '시스템'), '방송 강제 중단', new.id, new.title);
  end if;
  if new.status = 'ended' and old.status <> 'ended' then new.ended_at := now(); end if;
  return new;
end $$;
drop trigger if exists streams_stop_log on public.streams;
create trigger streams_stop_log before update on public.streams for each row execute function public.log_stream_stop();
