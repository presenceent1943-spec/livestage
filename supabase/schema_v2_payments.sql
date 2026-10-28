-- LIVE STAGE — 스키마 v2: 스타 지갑 · 충전 주문 · 결제 승인 (schema.sql 실행 후 이어서 실행)

-- 1. 스타 상품 (가격·수량은 서버가 결정, 앱은 보여주기만)
create table if not exists public.star_packages (
  id text primary key,
  krw int not null check (krw > 0),
  stars int not null check (stars > 0),
  label text not null,
  sort int not null default 0,
  active boolean not null default true
);
insert into public.star_packages (id, krw, stars, label, sort) values
  ('p1000',   1000,   100, '100 스타', 1),
  ('p5000',   5000,   500, '500 스타', 2),
  ('p10000', 10000,  1050, '1,050 스타 (+5%)', 3),
  ('p50000', 50000,  5500, '5,500 스타 (+10%)', 4),
  ('p100000',100000,11500, '11,500 스타 (+15%)', 5)
on conflict (id) do nothing;

-- 2. 지갑 (회원 1:1)
create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);
-- 가입 시 지갑 자동 생성
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nick) values (new.id, coalesce(new.raw_user_meta_data->>'nick', split_part(new.email,'@',1)));
  insert into public.wallets (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
-- 기존 회원 지갑 보충
insert into public.wallets (user_id) select id from auth.users on conflict do nothing;

-- 3. 충전 주문
create table if not exists public.orders (
  id text primary key,                      -- 토스 orderId (영문·숫자·-_ 6~64자)
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id text not null references public.star_packages(id),
  krw int not null,
  stars int not null,
  status text not null default 'pending' check (status in ('pending','paid','failed','canceled','refunded')),
  payment_key text,
  method text,
  raw jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists orders_user on public.orders(user_id, created_at desc);

-- 4. 지갑 원장 (모든 증감 기록 — 정산·환불 근거)
create table if not exists public.wallet_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta bigint not null,
  reason text not null,                     -- 'charge' | 'gift' | 'refund' | 'admin'
  ref text,                                 -- order id / gift id
  balance_after bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists ledger_user on public.wallet_ledger(user_id, created_at desc);

-- 5. 주문 생성 (앱에서 호출) — 금액은 서버가 상품표에서 가져옴
create or replace function public.create_order(p_package text)
returns table (order_id text, krw int, stars int, order_name text)
language plpgsql security definer set search_path = public as $$
declare v_pkg star_packages%rowtype; v_id text; v_status text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select status into v_status from profiles where id = auth.uid();
  if v_status <> 'active' then raise exception '제재 중인 계정입니다'; end if;
  select * into v_pkg from star_packages where id = p_package and active;
  if v_pkg.id is null then raise exception '상품을 찾을 수 없습니다'; end if;
  v_id := 'LS-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into orders (id, user_id, package_id, krw, stars) values (v_id, auth.uid(), v_pkg.id, v_pkg.krw, v_pkg.stars);
  return query select v_id, v_pkg.krw, v_pkg.stars, 'LIVE STAGE ' || v_pkg.label;
end $$;

-- 6. 결제 승인 후 지갑 적립 (Edge Function 이 service_role 로만 호출)
create or replace function public.credit_order(p_order text, p_payment_key text, p_method text, p_raw jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_o orders%rowtype; v_bal bigint;
begin
  select * into v_o from orders where id = p_order for update;
  if v_o.id is null then raise exception '주문 없음'; end if;
  if v_o.status = 'paid' then return; end if;   -- 멱등: 두 번 호출돼도 한 번만 적립
  update orders set status='paid', payment_key=p_payment_key, method=p_method, raw=p_raw, paid_at=now() where id = p_order;
  update wallets set balance = balance + v_o.stars, updated_at = now() where user_id = v_o.user_id returning balance into v_bal;
  insert into wallet_ledger (user_id, delta, reason, ref, balance_after) values (v_o.user_id, v_o.stars, 'charge', p_order, v_bal);
end $$;
revoke execute on function public.credit_order(text,text,text,jsonb) from public, anon, authenticated;

-- 7. 선물 보내기: 지갑 잔액 차감 버전으로 교체
create or replace function public.send_gift(p_stream text, p_performer uuid, p_gift text, p_emoji text, p_stars int)
returns void language plpgsql security definer set search_path = public as $$
declare v_nick text; v_status text; v_pname text; v_bal bigint; v_gid bigint;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select nick, status into v_nick, v_status from profiles where id = auth.uid();
  if v_status <> 'active' then raise exception '제재 중인 계정입니다'; end if;
  if p_stars < 1 or p_stars > 1000000 then raise exception '잘못된 수량'; end if;
  if not exists (select 1 from streams where id = p_stream and status = 'live') then raise exception '진행 중인 방송이 아닙니다'; end if;
  select name into v_pname from performers where id = p_performer and stream_id = p_stream;
  if v_pname is null then raise exception '출연자를 찾을 수 없습니다'; end if;
  -- 잔액 차감 (행 잠금으로 동시 요청 안전)
  select balance into v_bal from wallets where user_id = auth.uid() for update;
  if v_bal is null then insert into wallets (user_id) values (auth.uid()); v_bal := 0; end if;
  if v_bal < p_stars then raise exception 'INSUFFICIENT:스타가 부족합니다 (보유 %, 필요 %)', v_bal, p_stars; end if;
  update wallets set balance = balance - p_stars, updated_at = now() where user_id = auth.uid() returning balance into v_bal;
  insert into gifts (stream_id, performer_id, user_id, nick, gift, emoji, stars) values (p_stream, p_performer, auth.uid(), v_nick, p_gift, p_emoji, p_stars) returning id into v_gid;
  insert into wallet_ledger (user_id, delta, reason, ref, balance_after) values (auth.uid(), -p_stars, 'gift', v_gid::text, v_bal);
  update performers set total = total + p_stars where id = p_performer;
  insert into messages (stream_id, user_id, nick, text, kind) values (p_stream, auth.uid(), v_nick, p_emoji || ' ' || v_pname || ' 에게 ' || p_gift || ' ' || p_stars || ' 스타 선물!', 'gift');
end $$;

-- 8. RLS: 본인 지갑·주문·원장만 읽기, 쓰기는 함수로만
alter table public.star_packages enable row level security;
alter table public.wallets enable row level security;
alter table public.orders enable row level security;
alter table public.wallet_ledger enable row level security;
drop policy if exists "packages read" on public.star_packages;
create policy "packages read" on public.star_packages for select using (active);
drop policy if exists "wallet own" on public.wallets;
create policy "wallet own" on public.wallets for select using (auth.uid() = user_id);
drop policy if exists "orders own" on public.orders;
create policy "orders own" on public.orders for select using (auth.uid() = user_id);
drop policy if exists "ledger own" on public.wallet_ledger;
create policy "ledger own" on public.wallet_ledger for select using (auth.uid() = user_id);
do $$ begin alter publication supabase_realtime add table public.wallets; exception when duplicate_object then null; end $$;
