-- LIVE STAGE — v4: 모든 방송 서버화 (레이블 · 방송 생성 · 출연자 · 송출 설정)

-- 1. 레이블
create table if not exists public.labels (
  id text primary key,
  name text not null,
  owner_id uuid references auth.users(id),
  status text not null default 'active' check (status in ('active','pending','suspended')),
  created_at timestamptz not null default now()
);
insert into public.labels (id, name) values ('presence', 'PRESENCE') on conflict (id) do nothing;

-- 2. 방송 테이블 확장
alter table public.streams add column if not exists label_id text references public.labels(id);
alter table public.streams add column if not exists owner_id uuid references auth.users(id);
alter table public.streams add column if not exists category text not null default '토크';
alter table public.streams add column if not exists emoji text not null default '🎤';
alter table public.streams add column if not exists hue int not null default 270;
alter table public.streams add column if not exists started_at timestamptz not null default now();
alter table public.streams add column if not exists ended_at timestamptz;
update public.streams set label_id = 'presence' where label_id is null;

-- 3. 공용 설정 (터널 주소 등) — 모든 기기가 같은 값을 봄
create table if not exists public.settings (key text primary key, value text, updated_at timestamptz not null default now());
alter table public.settings enable row level security;
drop policy if exists "settings read" on public.settings;
create policy "settings read" on public.settings for select using (true);
alter table public.labels enable row level security;
drop policy if exists "labels read" on public.labels;
create policy "labels read" on public.labels for select using (true);

create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('host','admin') from profiles where id = auth.uid()), false) $$;

create or replace function public.set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception '호스트 또는 관리자만 변경할 수 있습니다'; end if;
  insert into settings (key, value) values (p_key, p_value) on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

-- 4. 방송 생성 — 호스트/관리자. 출연자 배열 함께. 재생주소는 settings.tunnel 기준 자동
create or replace function public.create_stream(p_title text, p_category text, p_emoji text, p_hue int, p_performers text[], p_label text default 'presence')
returns text language plpgsql security definer set search_path = public as $$
declare v_id text; v_nick text; v_tunnel text; i int; v_emojis text[] := array['🎤','🎶','💃','🍜','🎮','🎧','🌙','🔥','🎭','✨','🐱','🌸'];
begin
  if not is_staff() then raise exception '호스트 또는 관리자만 방송을 만들 수 있습니다'; end if;
  if length(trim(p_title)) < 2 then raise exception '제목을 입력하세요'; end if;
  select nick into v_nick from profiles where id = auth.uid();
  v_id := 's' || lower(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  select value into v_tunnel from settings where key = 'tunnel';
  insert into streams (id, title, host_nick, label_name, label_id, owner_id, category, emoji, hue, status, play_url)
  select v_id, trim(p_title), v_nick, l.name, l.id, auth.uid(), coalesce(p_category,'토크'), coalesce(p_emoji,'🎤'), coalesce(p_hue,270), 'live',
         case when v_tunnel is not null then v_tunnel || '/live/' || v_id || '/index.m3u8' end
  from labels l where l.id = coalesce(p_label,'presence');
  if not found then raise exception '레이블을 찾을 수 없습니다'; end if;
  if p_performers is null or array_length(p_performers,1) is null then p_performers := array[v_nick]; end if;
  for i in 1..array_length(p_performers,1) loop
    if length(trim(p_performers[i])) > 0 then
      insert into performers (stream_id, name, emoji, sort) values (v_id, trim(p_performers[i]), v_emojis[((i-1) % 12)+1], i);
    end if;
  end loop;
  return v_id;
end $$;

-- 5. 출연자 추가/삭제, 방송 종료/재개 — 방송 소유자 또는 관리자
create or replace function public.can_manage(p_stream text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from streams s join profiles p on p.id = auth.uid() where s.id = p_stream and (s.owner_id = auth.uid() or p.role = 'admin')) $$;

create or replace function public.add_performer(p_stream text, p_name text, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage(p_stream) then raise exception '이 방송의 호스트 또는 관리자만 가능합니다'; end if;
  insert into performers (stream_id, name, emoji, sort) values (p_stream, trim(p_name), coalesce(p_emoji,'🎤'), (select coalesce(max(sort),0)+1 from performers where stream_id = p_stream));
end $$;

create or replace function public.remove_performer(p_stream text, p_performer uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage(p_stream) then raise exception '이 방송의 호스트 또는 관리자만 가능합니다'; end if;
  -- 후원 기록은 보존: 출연자 행은 남기고 정렬에서만 숨김(sort = -1)
  update performers set sort = -1 where id = p_performer and stream_id = p_stream;
end $$;

create or replace function public.set_stream(p_stream text, p_play_url text, p_title text default null, p_status text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage(p_stream) then raise exception '이 방송의 호스트 또는 관리자만 변경할 수 있습니다'; end if;
  update streams set
    play_url = coalesce(nullif(p_play_url,''), play_url),
    title = coalesce(nullif(p_title,''), title),
    status = coalesce(nullif(p_status,''), status),
    ended_at = case when p_status = 'ended' then now() else ended_at end,
    started_at = case when p_status = 'live' and status <> 'live' then now() else started_at end
  where id = p_stream;
end $$;

-- 터널 주소가 바뀌면 모든 라이브 방송의 재생주소를 한 번에 갱신
create or replace function public.apply_tunnel(p_tunnel text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception '호스트 또는 관리자만 변경할 수 있습니다'; end if;
  perform set_setting('tunnel', rtrim(p_tunnel,'/'));
  update streams set play_url = rtrim(p_tunnel,'/') || '/live/' || id || '/index.m3u8' where status = 'live';
end $$;

-- 6. 기존 s1 방송의 송출 경로를 live/s1 로 통일 (기존 live/stream 은 더 이상 사용 안 함)
-- (앱이 송출 주소를 live/<방송id> 로 안내함)
