-- LIVE STAGE — v6: 송출 비밀번호 + 비밀 값 분리
-- 1) 비밀 값(pc_secret, publish_pass)을 아무나 읽는 settings 에서 secrets 로 옮김 (API로는 읽기 불가)
-- 2) PC 실행 파일이 register_tunnel 로 송출 비밀번호(publish_pass)도 등록
-- 3) 호스트/관리자만 get_publish_pass() 로 비밀번호를 받아 송출에 사용
create table if not exists public.secrets (key text primary key, value text, updated_at timestamptz not null default now());
alter table public.secrets enable row level security;   -- 정책 없음 = anon/authenticated 접근 불가

insert into public.secrets (key, value)
  select 'pc_secret', value from public.settings where key = 'pc_secret'
  on conflict (key) do nothing;
insert into public.secrets (key, value) values ('pc_secret', 'ls-pc-0b467aa8e90bcbf861f89622') on conflict (key) do nothing;
delete from public.settings where key = 'pc_secret';

create or replace function public.register_tunnel(p_secret text, p_key text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
declare v_secret text;
begin
  select value into v_secret from secrets where key = 'pc_secret';
  if v_secret is null or p_secret <> v_secret then raise exception 'invalid secret'; end if;
  if p_key = 'publish_pass' then
    insert into secrets (key, value) values (p_key, p_value) on conflict (key) do update set value = excluded.value, updated_at = now();
    return;
  end if;
  if p_key not in ('tunnel','whip_tunnel','server_ip') then raise exception 'invalid key'; end if;
  insert into settings (key, value) values (p_key, rtrim(p_value,'/')) on conflict (key) do update set value = excluded.value, updated_at = now();
  if p_key = 'tunnel' then
    update streams set play_url = rtrim(p_value,'/') || '/live/' || id || '/index.m3u8' where status = 'live';
  end if;
end $$;
grant execute on function public.register_tunnel(text,text,text) to anon, authenticated;

create or replace function public.get_publish_pass() returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not is_staff() then raise exception '호스트 또는 관리자만 볼 수 있습니다'; end if;
  select value into v from secrets where key = 'publish_pass';
  return coalesce(v, '');
end $$;
grant execute on function public.get_publish_pass() to authenticated;
