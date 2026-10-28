-- LIVE STAGE — v3: 방송 재생주소·상태를 서버에 저장 (호스트/관리자만)

create or replace function public.set_stream(p_stream text, p_play_url text, p_title text default null, p_status text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('host','admin') then raise exception '호스트 또는 관리자만 변경할 수 있습니다'; end if;
  update streams set
    play_url = coalesce(nullif(p_play_url,''), null),
    title = coalesce(nullif(p_title,''), title),
    status = coalesce(nullif(p_status,''), status)
  where id = p_stream;
  if not found then raise exception '방송을 찾을 수 없습니다'; end if;
end $$;

do $$ begin alter publication supabase_realtime add table public.streams; exception when duplicate_object then null; end $$;

-- 대표님 계정을 관리자로 (닉네임 기준 — 필요 시 수정)
update public.profiles set role = 'admin' where nick = '이지훈';
