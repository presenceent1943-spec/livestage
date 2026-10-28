// LIVE STAGE — 결제 승인 Edge Function
// 앱 → (paymentKey, orderId, amount) → 이 함수 → 토스 승인 API → 지갑 적립
// 비밀키(TOSS_SECRET_KEY)는 Supabase Secrets 에만 존재. 앱에는 절대 없음.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "로그인이 필요합니다" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const tossSecret = Deno.env.get("TOSS_SECRET_KEY");
    if (!tossSecret) return json({ error: "서버에 TOSS_SECRET_KEY 가 설정되지 않았습니다" }, 500);

    // 1. 호출한 회원 확인
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return json({ error: "세션이 만료되었습니다" }, 401);

    const { paymentKey, orderId, amount } = await req.json();
    if (!paymentKey || !orderId || !amount) return json({ error: "잘못된 요청" }, 400);

    // 2. 주문 검증 (본인 주문 · 금액 일치 · 미승인)
    const admin = createClient(url, service);
    const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (!order) return json({ error: "주문을 찾을 수 없습니다" }, 404);
    if (order.user_id !== user.id) return json({ error: "본인 주문이 아닙니다" }, 403);
    if (order.status === "paid") return json({ ok: true, stars: order.stars, already: true });
    if (Number(amount) !== Number(order.krw)) {
      await admin.from("orders").update({ status: "failed", raw: { reason: "amount mismatch", amount } }).eq("id", orderId);
      return json({ error: "결제 금액이 주문과 다릅니다" }, 400);
    }

    // 3. 토스 승인 (서버 → 서버)
    const basic = btoa(`${tossSecret}:`);
    const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    });
    const pay = await res.json();
    if (!res.ok) {
      await admin.from("orders").update({ status: "failed", raw: pay }).eq("id", orderId);
      return json({ error: pay.message ?? "결제 승인 실패", code: pay.code }, 400);
    }

    // 4. 지갑 적립 (DB 함수, 멱등)
    const { error: cerr } = await admin.rpc("credit_order", { p_order: orderId, p_payment_key: paymentKey, p_method: pay.method ?? null, p_raw: pay });
    if (cerr) return json({ error: "적립 실패: " + cerr.message }, 500);
    return json({ ok: true, stars: order.stars, krw: order.krw, method: pay.method });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
