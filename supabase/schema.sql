-- LIVE STAGE — Supabase 스키마 v1 (회원 · 실시간 채팅 · 가상 선물/순위 서버 저장)
-- Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣기 → Run

-- 1. 회원 프로필 (auth.users 와 1:1)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nick text not null,
  role text not null default 'viewer' check (role in ('viewer','host','moderator','admin')),
  status text not null default 'active' check (status in ('active','suspended','blocked')),
  created_at timestamptz not null default now()
);

-- 회원가입 시 프로필 자동 생성 (닉네임은 가입 폼의 metadata 에서)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nick)
  values (new.id, coalesce(new.raw_user_meta_data->>'nick', split_part(new.email,'@',1)));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. 방송 (시제품에서는 's1' 하나를 서버 연동 방송으로 사용)
create table if not exists public.streams (
  id text primary key,
  title text not null,
  host_nick text not null,
  label_name text not null default 'PRESENCE',
  status text not null default 'live' check (status in ('live','ended','stopped')),
  play_url text,
  created_at timestamptz not null default now()
);

-- 3. 출연자 (방송별)
create table if not exists public.performers (
  id uuid primary key default gen_random_uuid(),
  stream_id text not null references public.streams(id) on delete cascade,
  name text not null,
  emoji text not null default '🎤',
  total bigint not null default 0,
  sort int not null default 0
);
create index if not exists performers_stream on public.performers(stream_id);

-- 4. 채팅
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  stream_id text not null references public.streams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nick text not null,
  text text not null check (char_length(text) between 1 and 200),
  kind text not null default 'chat' check (kind in ('chat','gift','system')),
  created_at timestamptz not null default now()
);
create index if not exists messages_stream_time on public.messages(stream_id, created_at desc);

-- 5. 가상 선물 (후원 원장)
create table if not exists public.gifts (
  id bigint generated always as identity primary key,
  stream_id text not null references public.streams(id) on delete cascade,
  performer_id uuid not null references public.performers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nick text not null,
  gift text not null,
  emoji text not null,
  stars int not null check (stars > 0 and stars <= 1000000),
  created_at timestamptz not null default now()
);
create index if not exists gifts_stream_time on public.gifts(stream_id, created_at desc);

-- 6. 선물 보내기 (원장 기록 + 출연자 합계 증가를 한 번에, 서버에서만 실행)
create or replace function public.send_gift(p_stream text, p_performer uuid, p_gift text, p_emoji text, p_stars int)
returns void language plpgsql security definer set search_path = public as $$
declare v_nick text; v_status text; v_pname text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select nick, status into v_nick, v_status from profiles where id = auth.uid();
  if v_status <> 'active' then raise exception '제재 중인 계정입니다'; end if;
  if p_stars < 1 or p_stars > 1000000 then raise exception '잘못된 수량'; end if;
  if not exists (select 1 from streams where id = p_stream and status = 'live') then raise exception '진행 중인 방송이 아닙니다'; end if;
  select name into v_pname from performers where id = p_performer and stream_id = p_stream;
  if v_pname is null then raise exception '출연자를 찾을 수 없습니다'; end if;
  insert into gifts (stream_id, performer_id, user_id, nick, gift, emoji, stars) values (p_stream, p_performer, auth.uid(), v_nick, p_gift, p_emoji, p_stars);
  update performers set total = total + p_stars where id = p_performer;
  insert into messages (stream_id, user_id, nick, text, kind) values (p_stream, auth.uid(), v_nick, p_emoji || ' ' || v_pname || ' 에게 ' || p_gift || ' ' || p_stars || ' 스타 선물!', 'gift');
end $$;

-- 7. 채팅 보내기 (제재 계정 차단)
create or replace function public.send_message(p_stream text, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare v_nick text; v_status text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select nick, status into v_nick, v_status from profiles where id = auth.uid();
  if v_status <> 'active' then raise exception '제재 중인 계정입니다'; end if;
  insert into messages (stream_id, user_id, nick, text) values (p_stream, auth.uid(), v_nick, left(trim(p_text), 200));
end $$;

-- 8. 보안 (RLS): 읽기는 모두, 쓰기는 함수로만
alter table public.profiles enable row level security;
alter table public.streams enable row level security;
alter table public.performers enable row level security;
alter table public.messages enable row level security;
alter table public.gifts enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (true);
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()) and status = (select status from public.profiles where id = auth.uid()));
drop policy if exists "streams read" on public.streams;
create policy "streams read" on public.streams for select using (true);
drop policy if exists "performers read" on public.performers;
create policy "performers read" on public.performers for select using (true);
drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages for select using (true);
drop policy if exists "gifts read" on public.gifts;
create policy "gifts read" on public.gifts for select using (true);

-- 9. 실시간 전송 켜기
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.performers;
exception when duplicate_object then null; end $$;

-- 10. 샘플 방송 1개 + 출연자 4명
insert into public.streams (id, title, host_nick, label_name) values ('s1', '금요일 밤 합동 라이브 🎤 노래 대결 2라운드', '미유', 'PRESENCE')
  on conflict (id) do nothing;
insert into public.performers (stream_id, name, emoji, total, sort)
select 's1', v.name, v.emoji, v.total, v.sort from (values ('미유','🌙',18650,1),('리나','🌸',12400,2),('우기','🔥',9900,3),('지미','🐱',4300,4)) as v(name,emoji,total,sort)
where not exists (select 1 from public.performers where stream_id = 's1');
