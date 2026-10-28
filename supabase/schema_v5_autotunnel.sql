-- LIVE STAGE — v5: PC 실행 파일이 터널 주소를 자동 등록 (비밀 토큰으로 인증)
insert into public.settings (key, value) values ('pc_secret', 'ls-pc-0b467aa8e90bcbf861f89622')
  on conflict (key) do update set value = excluded.value;

create or replace function public.register_tunnel(p_secret text, p_key text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
declare v_secret text;
begin
  select value into v_secret from settings where key = 'pc_secret';
  if v_secret is null or p_secret <> v_secret then raise exception 'invalid secret'; end if;
  if p_key not in ('tunnel','whip_tunnel','server_ip') then raise exception 'invalid key'; end if;
  insert into settings (key, value) values (p_key, rtrim(p_value,'/')) on conflict (key) do update set value = excluded.value, updated_at = now();
  if p_key = 'tunnel' then
    update streams set play_url = rtrim(p_value,'/') || '/live/' || id || '/index.m3u8' where status = 'live';
  end if;
end $$;
grant execute on function public.register_tunnel(text,text,text) to anon, authenticated;
