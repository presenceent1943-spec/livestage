/* LIVE STAGE v2 — 3분 시연 시나리오 (시연 모드 전용). 건너뛰기·초기화 가능, 시연 데이터에만 영향. */
import { $, $$, esc, icon, router, bus, toast, confirmBox, storage } from './core.js';
import { data } from './data.js';

const STEPS = [
  { title: '대표 방송 입장', text: '홈에서 오늘의 대표 무대를 고릅니다. 시청자 수·후원은 모두 시연 데이터입니다.', route: 'home', hl: '.scard.hero', next: '방송 입장', action: () => router.go('live/d1') },
  { title: '출연자 · 순위 · 라운드 규칙', text: '영상 위 순위판과 오른쪽 패널에서 라운드 집계, 남은 시간, 미션 진행률을 확인합니다. "라운드/누적/팀" 보기를 바꿔 보세요.', route: 'live/d1', hl: '#rankSeg', next: '다음' },
  { title: '가상 선물 보내기', text: '지미에게 샴페인(300 스타)을 보내 봅니다. 잔액·대상·수량을 확인하고 "보내기"를 누르세요. 시연용 가상 포인트입니다.', route: 'live/d1', hl: '#giftBtn', wait: 'gift', setup: async () => { await data.setRole('viewer'); }, next: '선물 창 열기', action: () => window.LiveStageGift ? window.LiveStageGift('p-jimi', { gid: 'champ', qty: 1 }) : $('#giftBtn')?.click() },
  { title: '순위 역전과 미션 달성', text: '선물이 들어오면 순위판이 움직이고 효과가 재생됩니다. 300 스타 이상 한 번에 보내면 "지미 애교 3종" 미션이 달성됩니다. 왕관(1,000)을 보내면 큰 효과를 볼 수 있어요.', route: 'live/d1', hl: '#rank', next: '다음' },
  { title: '스튜디오에서 라운드 종료', text: '호스트 역할로 전환해 라운드를 종료합니다. 우승자가 발표되고 결과가 기록됩니다.', route: 'studio/d1/rounds', setup: async () => { await data.setRole('host'); }, hl: '[data-ra="end"]', wait: 'round-ended', next: '라운드 종료', action: () => $('[data-ra="end"]')?.click() },
  { title: '최종 결과와 정산 명세', text: '라운드 결과와 후원 원장을 바탕으로 정산 시뮬레이션을 확인합니다. 플랫폼·레이블·출연자 비율과 공제 항목이 분리되어 있고, CSV로 내려받을 수 있습니다.', route: 'settle/d1', hl: '.grid.stats', next: '다음' },
  { title: 'OBS 오버레이', text: '같은 순위판을 OBS 브라우저 소스로 넣어 송출 영상에 바로 얹을 수 있습니다. 미리보기에서 크기·위치·테마를 바꿔 보세요.', route: 'studio/d1/obs', hl: 'iframe', next: '시연 마치기', last: true },
];

let state = { i: -1, el: null, unsub: null, hlEl: null, timer: null };
function panel() { if (!state.el) { state.el = document.createElement('div'); state.el.className = 'tour'; state.el.setAttribute('role', 'dialog'); state.el.setAttribute('aria-label', '시연 안내'); document.body.appendChild(state.el); } return state.el; }
function unhighlight() { if (state.hlEl) { state.hlEl.style.outline = ''; state.hlEl.style.outlineOffset = ''; state.hlEl = null; } }
function highlight(sel) { unhighlight(); if (!sel) return; const tryIt = (n = 0) => { const e = sel.split(',').map(x => $(x.trim())).find(Boolean); if (e) { state.hlEl = e; e.style.outline = '2px solid var(--gold)'; e.style.outlineOffset = '4px'; e.scrollIntoView({ block: 'center', behavior: 'smooth' }); } else if (n < 20) setTimeout(() => tryIt(n + 1), 250); }; tryIt(); }
async function show(i) {
  state.i = i; const st = STEPS[i]; if (!st) return stop();
  if (state.unsub) { state.unsub(); state.unsub = null; }
  if (st.setup) await st.setup();
  const cur = router.parse(); if (cur.path !== st.route) router.go(st.route);
  const p = panel();
  p.innerHTML = `<div class="step">3분 시연 · ${i + 1} / ${STEPS.length}</div><h4>${esc(st.title)}</h4><p>${esc(st.text)}</p>
    <div class="acts"><button class="btn sm ghost" id="trSkip">건너뛰기</button>${i > 0 ? '<button class="btn sm" id="trPrev">이전</button>' : ''}${st.action ? `<button class="btn sm violet" id="trAct">${esc(st.next)}</button>` : ''}<button class="btn sm primary" id="trNext">${st.last ? '마치기' : st.action ? '다음 단계' : esc(st.next)}</button></div>`;
  $('#trSkip', p).onclick = stop; const pv = $('#trPrev', p); if (pv) pv.onclick = () => show(i - 1);
  $('#trNext', p).onclick = () => st.last ? finish() : show(i + 1);
  const ac = $('#trAct', p); if (ac) ac.onclick = () => setTimeout(st.action, 50);
  setTimeout(() => highlight(st.hl), 400);
  if (st.wait === 'gift') state.unsub = bus.on('gift:d1', () => { toast('선물 완료 — 순위판과 효과를 확인하세요', 'ok'); setTimeout(() => show(i + 1), 2500); });
  if (st.wait === 'round-ended') state.unsub = bus.on('round:d1', r => { if (r.status === 'ended') setTimeout(() => show(i + 1), 2500); });
}
function finish() { stop(); toast('시연을 마쳤습니다. "시연 초기화"로 언제든 처음부터 다시 볼 수 있습니다.', 'ok', 6000); }
export function stop() { if (state.unsub) state.unsub(); state.unsub = null; unhighlight(); if (state.el) state.el.remove(); state.el = null; state.i = -1; storage.del('livestage-v2-tour'); }
export async function start({ reset = true } = {}) {
  if (data.mode !== 'demo') { toast('3분 시연은 시연 모드에서만 실행됩니다 — 모드 배지에서 전환하세요', 'warn', 5000); return; }
  if (reset) { const ok = await confirmBox({ title: '3분 시연 시작', text: '재현 가능한 결과를 위해 시연 데이터를 처음 상태로 되돌리고 시작합니다 (서버 데이터 영향 없음). 안내는 언제든 건너뛸 수 있습니다.', ok: '초기화하고 시작' }); if (!ok) return; await data.reset(); }
  storage.set('livestage-v2-tour', 1);
  show(0);
}
window.LiveStageTour = { start, stop };
