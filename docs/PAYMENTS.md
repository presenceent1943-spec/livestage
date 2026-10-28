# 결제(스타 충전) 설정 — 테스트 모드

## 흐름
앱 "⭐ 충전" → 서버가 주문 생성(금액은 서버 상품표) → 토스 결제창 → 성공 리다이렉트 → Edge Function `confirm-payment` 가 토스에 승인 요청 → 지갑 적립 → 선물 시 잔액 차감

## 1회 설정 (Supabase)
1. SQL Editor → `supabase/schema_v2_payments.sql` 전체 실행
2. Edge Functions → Deploy a new function → "Via Editor" → 이름 `confirm-payment` → `supabase/functions/confirm-payment/index.ts` 내용 붙여넣기 → Deploy
3. Edge Functions → Secrets → `TOSS_SECRET_KEY` = `test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6` (문서용 테스트 비밀키) → Save
4. Edge Functions → confirm-payment → Details → "Verify JWT" 는 켜진 상태 그대로

## 실서비스 전환 때 바꿀 것
- 토스페이먼츠 가맹 계약 → `live_gck_` 클라이언트 키를 `index.html` 의 `CONFIG.tossClientKey` 에, `live_gsk_` 비밀키를 Secrets `TOSS_SECRET_KEY` 에
- 상품 가격·보너스: `star_packages` 테이블에서 수정 (앱 배포 불필요)
- 환불: `orders` 의 payment_key 로 토스 취소 API 호출 + `wallet_ledger` 에 refund 기록 (관리자 기능으로 추후)
