/* LIVE STAGE v2 — 정산 시연 화면  (#/settle/:streamId?)
   모든 숫자는 후원 원장(data.gifts)에서 engine.settle() 로 계산한다. 임의 수치 없음. 실제 지급이 아닌 시뮬레이션. */
import { $, $$, esc, fmt, icon, toast, storage, csvCell, downloadText, bus, CONFIG, debounce } from '../core.js';
import { settle } from '../engine.js';

const STATUS_KEY = 'livestage-v2-settle-status';
const STATUS = [['scheduled', '예정'], ['review', '검토'], ['hold', '보류'], ['paid', '지급 완료']];
const STATUS_PILL = { scheduled: '', review: 'violet', hold: 'warn', paid: 'ok' };
const PAGE = 50;
const STREAM_STATUS = { live: ['LIVE', 'live'], scheduled: ['예정', ''], ended: ['종료', 'dark'], stopped: ['중단', 'bad'] };

function injectStyle() {
  if ($('#settleCss')) return;
  const s = document.createElement('style'); s.id = 'settleCss';
  s.textContent = `.tbl select.sm{height:30px;width:auto;min-width:112px;padding:0 28px 0 10px;font-size:var(--fs-sm);border-radius:var(--r-sm)}
.settle-eq{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:var(--fs-sm);color:var(--fg-2)}.settle-eq b{color:var(--fg)}.settle-eq .op{color:var(--fg-4)}
.settle-scope{display:grid;grid-template-columns:minmax(220px,420px) 1fr;gap:var(--sp-3);align-items:end}@media(max-width:760px){.settle-scope{grid-template-columns:1fr}}`;
  document.head.appendChild(s);
}

const loadStatus = () => storage.get(STATUS_KEY, {}) || {};
const statusOf = (scope, pid) => loadStatus()[scope + ':' + pid] || 'scheduled';
const saveStatus = (scope, pid, v) => { const m = loadStatus(); m[scope + ':' + pid] = v; storage.set(STATUS_KEY, m); };

export default async function render(ctx) {
  const { el, route, cleanup, data } = ctx;
  injectStyle();
  const me = data.me();
  const demo = data.mode === 'demo';

  // ---- 접근 권한 ----
  if (!me || !['host', 'admin'].includes(me.role)) {
    el.innerHTML = `<div class="page narrow"><div class="empty"><div class="ic">${icon.receipt}</div><b>정산 화면은 호스트·관리자만 볼 수 있습니다</b>
      <span class="muted">${demo ? '시연 역할을 호스트 또는 관리자로 바꾸면 볼 수 있습니다.' : me ? '현재 계정에는 호스트 권한이 없습니다. 권한은 서버가 판정합니다.' : '로그인 후 호스트 권한이 있어야 볼 수 있습니다.'}</span>
      ${demo ? `<button class="btn primary" id="stRole">역할 선택</button>` : !me ? `<button class="btn primary" id="stAuth">로그인</button>` : ''}</div></div>`;
    const b = $('#stRole'); if (b) b.onclick = () => ctx.openRole();
    const a = $('#stAuth'); if (a) a.onclick = () => ctx.openAuth();
    return;
  }

  // ---- 관리 가능한 방송 목록 ----
  let streams = [], labels = [];
  try {
    [streams, labels] = await Promise.all([data.streams(), data.labels().catch(() => [])]);
  } catch (e) { toast(e.message, 'bad'); el.innerHTML = `<div class="page narrow"><div class="note bad"><b>방송 목록을 불러오지 못했습니다</b> ${esc(e.message)}</div></div>`; return; }
  if (me.role !== 'admin') streams = streams.filter(s => (me.labelId ? s.labelId === me.labelId : s.ownerId ? s.ownerId === me.id : s.hostName === me.nick));
  const order = { live: 0, ended: 1, stopped: 2, scheduled: 3 };
  streams.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (b.startedAt || 0) - (a.startedAt || 0));
  const labelName = id => (labels.find(l => l.id === id) || {}).name || id || '—';
  const streamById = id => streams.find(s => s.id === id);

  let scope = route.seg[1] && streamById(route.seg[1]) ? route.seg[1] : 'all';
  if (route.seg[1] && scope === 'all') toast('해당 방송을 찾을 수 없어 전체 기준으로 표시합니다', 'warn');
  let tab = 'performers', ledgerShown = PAGE;
  let gifts = [], R = null;

  el.innerHTML = `<div class="page">
    <div class="sec"><div><div class="row" style="gap:8px"><h2>정산 시연</h2><span class="pill warn">정산 시뮬레이션 — 실제 지급 아님</span>${demo ? '<span class="pill">시연 데이터</span>' : ''}</div>
      <div class="sub">후원 원장에서 계산한 배분 결과입니다. 비율·수수료는 시연 가정이며, 실서비스 전 계약으로 확정됩니다.</div></div></div>
    <div class="card pad settle-scope">
      <label class="field"><span>정산 범위</span><select id="stScope">
        <option value="all" ${scope === 'all' ? 'selected' : ''}>전체 (관리 중인 방송 ${streams.length}개)</option>
        ${streams.map(s => `<option value="${esc(s.id)}" ${scope === s.id ? 'selected' : ''}>[${STREAM_STATUS[s.status]?.[0] || s.status}] ${esc(s.title)}</option>`).join('')}
      </select></label>
      <div id="stPeriod" class="muted" style="font-size:var(--fs-sm)"></div>
    </div>
    <div id="stBody" style="margin-top:16px"></div>
  </div>`;

  const skeleton = () => { $('#stBody').innerHTML = `<div class="grid stats">${'<div class="skeleton" style="height:66px"></div>'.repeat(7)}</div><div class="skeleton" style="height:48px;margin-top:16px"></div><div class="skeleton" style="height:260px;margin-top:12px"></div>`; };

  async function load() {
    skeleton();
    try {
      gifts = scope === 'all'
        ? (await Promise.all(streams.map(s => data.gifts({ streamId: s.id, limit: 5000 })))).flat()
        : await data.gifts({ streamId: scope, limit: 5000 });
    } catch (e) { toast(e.message, 'bad'); $('#stBody').innerHTML = `<div class="note bad"><b>후원 원장을 불러오지 못했습니다</b> ${esc(e.message)}</div>`; return; }
    gifts.sort((a, b) => b.createdAt - a.createdAt);
    R = settle(gifts, { performers: streams.flatMap(s => s.performers || []), streams });
    ledgerShown = PAGE;
    renderPeriod(); renderBody();
  }

  function renderPeriod() {
    const s = scope === 'all' ? null : streamById(scope);
    const ts = gifts.map(g => g.createdAt).filter(Boolean);
    const from = s ? s.startedAt : ts.length ? Math.min(...ts) : null, to = s ? (s.endedAt || (ts.length ? Math.max(...ts) : null)) : (ts.length ? Math.max(...ts) : null);
    const st = s ? STREAM_STATUS[s.status] || [s.status, ''] : null;
    $('#stPeriod').innerHTML = `<div class="row" style="gap:6px 10px">
      ${s ? `<span class="pill ${st[1]}">${st[0]}</span><span><b>${esc(s.title)}</b> · ${esc(labelName(s.labelId))} · 호스트 ${esc(s.hostName || '—')}</span>` : `<span>관리 중인 방송 <b class="num">${streams.length}</b>개 합산</span>`}
      <span class="num">기간 ${from ? fmt.dateTime(from) : '—'} ~ ${s && s.status === 'live' ? `진행 중 (마지막 후원 ${to ? fmt.time(to) : '—'})` : to ? fmt.dateTime(to) : '—'}</span>
      <span>후원 <b class="num">${fmt.num(gifts.length)}</b>건</span></div>`;
  }

  function renderBody() {
    const r = R; const body = $('#stBody'); if (!body) return;
    if (!gifts.length) {
      body.innerHTML = `<div class="empty"><div class="ic">${icon.gift}</div><b>정산할 후원 기록이 없습니다</b><span class="muted">${scope === 'all' ? '관리 중인 방송에 후원이 들어오면 여기에서 배분 결과를 볼 수 있습니다.' : '이 방송에는 아직 후원이 없습니다.'}</span></div>`;
      return;
    }
    const sp = r.split;
    body.innerHTML = `
      <div class="grid stats">
        ${stat('총 후원액', fmt.krw(r.gross), `${fmt.star(r.grossStars)} · ${fmt.num(r.count)}건`)}
        ${stat('환불 (제외)', fmt.krw(r.refundKrw), `${fmt.num(r.refundedCount)}건`)}
        ${stat(`PG 수수료 ${r.feePct}%`, '−' + fmt.krw(r.fee), '시연 가정')}
        ${stat('순액', fmt.krw(r.net), '총액 − 수수료')}
        ${stat(`플랫폼 몫 ${sp.platform}%`, fmt.krw(r.platform))}
        ${stat(`레이블 몫 ${sp.label}%`, fmt.krw(r.label))}
        ${stat(`출연자 풀 ${sp.performer}%`, fmt.krw(r.performerPool), '반올림 차액 포함', 'gold')}
      </div>
      <div class="note" style="margin-top:12px">
        <div class="settle-eq">
          <span>총 후원 <b class="num">${fmt.num(r.grossStars)}</b> 스타</span><span class="op">×</span><span><b class="num">${r.krwPerStar}</b>원</span><span class="op">=</span><span>총액 <b class="num">${fmt.krw(r.gross)}</b></span>
          <span class="op">·</span><span>환불 <b class="num">${r.refundedCount}</b>건 (${fmt.krw(r.refundKrw)}) 제외</span>
          <span class="op">·</span><span>PG 수수료 ${r.feePct}% <b class="num">${fmt.krw(r.fee)}</b></span><span class="op">→</span><span>순액 <b class="num">${fmt.krw(r.net)}</b></span>
        </div>
        <div class="settle-eq" style="margin-top:4px">
          <span>순액 <b class="num">${fmt.krw(r.net)}</b></span><span class="op">=</span>
          <span>플랫폼 ${sp.platform}% <b class="num">${fmt.krw(r.platform)}</b></span><span class="op">+</span>
          <span>레이블 ${sp.label}% <b class="num">${fmt.krw(r.label)}</b></span><span class="op">+</span>
          <span>출연자 풀 ${sp.performer}% <b class="num">${fmt.krw(r.performerPool)}</b></span>
          <span class="op">·</span><span class="${r.platform + r.label + r.performerPool === r.net ? 'ok' : 'bad'}">${r.platform + r.label + r.performerPool === r.net ? '합계 일치' : '합계 불일치'}</span>
        </div>
        <div style="margin-top:6px">규칙: 환불 건은 제외. 순액 = 총액 − PG 수수료(${r.feePct}%, 시연 가정). 배분 비율 플랫폼 ${sp.platform} : 레이블 ${sp.label} : 출연자 ${sp.performer} (CONFIG.split). 출연자 풀은 유효 스타 점유율로 나누고 반올림 차액은 마지막 출연자에 귀속. 원천세 3.3%는 프리랜서 가정의 시연 값입니다.
        ${demo ? '' : ' <b>서버 모드:</b> 서버 원장에는 환불 정보가 없어 환불 0건으로 계산되며, 지급 상태 표시는 이 브라우저에만 저장됩니다.'}</div>
      </div>
      <div class="tabs" style="margin-top:16px" id="stTabs">
        <button data-tab="performers" class="${tab === 'performers' ? 'on' : ''}">출연자별 <span class="tab-num muted">${r.performers.length}</span></button>
        <button data-tab="labels" class="${tab === 'labels' ? 'on' : ''}">레이블별 <span class="tab-num muted">${r.labels.length}</span></button>
        <button data-tab="ledger" class="${tab === 'ledger' ? 'on' : ''}">상세 명세 <span class="tab-num muted">${gifts.length}</span></button>
        ${scope === 'all' ? `<button data-tab="streams" class="${tab === 'streams' ? 'on' : ''}">방송별</button>` : ''}
      </div>
      <div id="stTab" style="margin-top:12px"></div>`;
    if (scope !== 'all' && tab === 'streams') tab = 'performers';
    $$('#stTabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; $$('#stTabs button').forEach(x => x.classList.toggle('on', x === b)); renderTab(); });
    renderTab();
  }
  const stat = (k, v, sub = '', cls = '') => `<div class="stat"><div class="k">${k}</div><div class="v num ${cls}">${v}</div>${sub ? `<div class="muted" style="font-size:var(--fs-xs);margin-top:2px">${sub}</div>` : ''}</div>`;

  function renderTab() {
    const box = $('#stTab'); if (!box) return;
    if (tab === 'performers') renderPerformers(box);
    else if (tab === 'labels') renderLabels(box);
    else if (tab === 'ledger') renderLedger(box);
    else renderStreams(box);
  }

  // ---- 출연자별 ----
  function renderPerformers(box) {
    const rows = R.performers;
    box.innerHTML = `<div class="row between" style="margin-bottom:10px"><span class="muted" style="font-size:var(--fs-sm)">지급 예정액 = 출연자 풀 × 점유율 · 실지급(시연) = 지급 예정액 − 원천세 3.3% · 상태는 작업 표시용 라벨이며 지급을 실행하지 않습니다.</span>
      <button class="btn sm" id="stCsvP">${icon.download}CSV</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>출연자</th><th>레이블</th><th class="r">스타</th><th class="r">후원 건수</th><th class="r">점유율</th><th class="r">지급 예정액</th><th class="r">원천세 3.3%</th><th class="r">실지급(시연)</th><th>상태</th></tr></thead><tbody>
      ${rows.map((p, i) => `<tr><td><span class="row" style="gap:6px;flex-wrap:nowrap">${i === 0 ? `<span class="pill gold">1</span>` : `<span class="muted num">${i + 1}</span>`}<b style="white-space:nowrap">${esc(p.name || p.performerId)}</b></span></td><td>${esc(labelName(p.labelId))}</td>
        <td class="r num">${fmt.num(p.stars)}</td><td class="r num">${fmt.num(p.count)}</td><td class="r num">${fmt.pct(p.share * 100)}</td><td class="r num">${fmt.krw(p.payout)}</td><td class="r num">−${fmt.krw(p.withholding)}</td><td class="r num"><b>${fmt.krw(p.net)}</b></td>
        <td><span class="row" style="gap:6px;flex-wrap:nowrap"><select class="sm" data-pid="${esc(p.performerId)}" aria-label="${esc(p.name)} 지급 상태">${STATUS.map(([v, n]) => `<option value="${v}" ${statusOf(scope, p.performerId) === v ? 'selected' : ''}>${n}</option>`).join('')}</select><span class="pill ${STATUS_PILL[statusOf(scope, p.performerId)]}" data-pill="${esc(p.performerId)}">${STATUS.find(x => x[0] === statusOf(scope, p.performerId))[1]}</span></span></td></tr>`).join('')}
      </tbody><tfoot><tr><td><b>합계</b></td><td></td><td class="r num"><b>${fmt.num(R.grossStars)}</b></td><td class="r num"><b>${fmt.num(R.count)}</b></td><td class="r num">100%</td><td class="r num"><b>${fmt.krw(R.performerPool)}</b></td><td class="r num">−${fmt.krw(rows.reduce((a, p) => a + p.withholding, 0))}</td><td class="r num"><b>${fmt.krw(rows.reduce((a, p) => a + p.net, 0))}</b></td><td></td></tr></tfoot></table></div>`;
    $$('select[data-pid]', box).forEach(s => s.onchange = () => { saveStatus(scope, s.dataset.pid, s.value); const pill = $(`[data-pill="${CSS.escape(s.dataset.pid)}"]`, box); if (pill) { pill.className = 'pill ' + (STATUS_PILL[s.value] || ''); pill.textContent = STATUS.find(x => x[0] === s.value)[1]; } toast('상태 표시를 저장했습니다 (이 브라우저에만 저장 · 지급 아님)', 'ok'); });
    $('#stCsvP').onclick = () => {
      const head = ['출연자', '레이블', '스타', '후원 건수', '점유율(%)', '지급 예정액', '원천세 3.3%', '실지급(시연)', '상태', '범위'];
      const lines = rows.map(p => [p.name, labelName(p.labelId), p.stars, p.count, (p.share * 100).toFixed(2), p.payout, p.withholding, p.net, STATUS.find(x => x[0] === statusOf(scope, p.performerId))[1], scope === 'all' ? '전체' : streamById(scope)?.title]);
      downloadText('settle-performers.csv', [['# 정산 시뮬레이션 — 실제 지급 아님'], head, ...lines].map(r => r.map(csvCell).join(',')).join('\n'));
    };
  }

  // ---- 레이블별 ----
  function renderLabels(box) {
    const rows = R.labels.slice().sort((a, b) => b.stars - a.stars);
    const sum = rows.reduce((a, l) => a + l.payout, 0), diff = R.label - sum;
    box.innerHTML = `<div class="row between" style="margin-bottom:10px"><span class="muted" style="font-size:var(--fs-sm)">레이블 몫(${R.split.label}%) ${fmt.krw(R.label)} 을 레이블별 스타 점유율로 배분한 값입니다.${diff ? ` 반올림 차액 ${fmt.krw(diff)} 은 표에 포함하지 않았습니다.` : ''}</span><button class="btn sm" id="stCsvL">${icon.download}CSV</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>레이블</th><th class="r">출연자 수</th><th class="r">스타</th><th class="r">점유율</th><th class="r">레이블 배분액</th></tr></thead><tbody>
      ${rows.map(l => `<tr><td><b>${esc(labelName(l.labelId))}</b> <span class="muted" style="font-size:var(--fs-xs)">${esc(l.labelId)}</span></td><td class="r num">${fmt.num(l.performers)}</td><td class="r num">${fmt.num(l.stars)}</td><td class="r num">${fmt.pct(l.share * 100)}</td><td class="r num"><b>${fmt.krw(l.payout)}</b></td></tr>`).join('')}
      </tbody><tfoot><tr><td><b>합계</b></td><td class="r num">${fmt.num(rows.reduce((a, l) => a + l.performers, 0))}</td><td class="r num"><b>${fmt.num(R.grossStars)}</b></td><td class="r num">100%</td><td class="r num"><b>${fmt.krw(sum)}</b></td></tr></tfoot></table></div>`;
    $('#stCsvL').onclick = () => downloadText('settle-labels.csv', [['# 정산 시뮬레이션 — 실제 지급 아님'], ['레이블', '레이블ID', '출연자 수', '스타', '점유율(%)', '레이블 배분액'], ...rows.map(l => [labelName(l.labelId), l.labelId, l.performers, l.stars, (l.share * 100).toFixed(2), l.payout])].map(r => r.map(csvCell).join(',')).join('\n'));
  }

  // ---- 상세 명세 (원장) ----
  function renderLedger(box) {
    const row = g => `<tr${g.refunded ? ' style="opacity:.55"' : ''}><td class="num" style="font-size:var(--fs-xs)">${esc(g.txn || g.id)}</td><td class="num">${fmt.dateTime(g.createdAt)}</td><td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><a href="#/live/${esc(g.streamId)}" title="${esc(streamById(g.streamId)?.title || g.streamId)}">${esc(streamById(g.streamId)?.title || g.streamId)}</a></td><td>${esc(g.performerName || g.performerId)}</td><td>${esc(g.nick)}</td><td>${esc(g.emoji || '')} ${esc(g.gift)}</td><td class="r num">${fmt.num(g.qty || 1)}</td><td class="r num">${fmt.num(g.stars)}</td><td class="r num">${fmt.krw(g.stars * R.krwPerStar)}</td><td>${g.refunded ? `<span class="pill bad" title="${esc(g.refundReason || '')}">환불</span>` : '<span class="pill ok">정상</span>'}</td></tr>`;
    box.innerHTML = `<div class="row between" style="margin-bottom:10px"><span class="muted" style="font-size:var(--fs-sm)">최신순 · 환불 건은 합계에서 제외됩니다${demo ? '' : ' · 서버 원장에는 환불 정보가 없습니다'}</span><button class="btn sm" id="stCsvG">${icon.download}CSV (전체 ${fmt.num(gifts.length)}건)</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>거래번호</th><th>시각</th><th>방송</th><th>출연자</th><th>닉네임</th><th>선물</th><th class="r">수량</th><th class="r">스타</th><th class="r">원화</th><th>상태</th></tr></thead><tbody id="stLedger">${gifts.slice(0, ledgerShown).map(row).join('')}</tbody></table></div>
      <div class="row" style="justify-content:center;margin-top:10px" id="stMore"></div>`;
    const more = () => { const m = $('#stMore'); if (!m) return; m.innerHTML = ledgerShown < gifts.length ? `<button class="btn" id="stMoreBtn">더 보기 <span class="muted num">(${fmt.num(ledgerShown)} / ${fmt.num(gifts.length)})</span></button>` : `<span class="muted" style="font-size:var(--fs-sm)">전체 ${fmt.num(gifts.length)}건 표시됨</span>`;
      const b = $('#stMoreBtn'); if (b) b.onclick = () => { const next = gifts.slice(ledgerShown, ledgerShown + PAGE); ledgerShown += next.length; $('#stLedger').insertAdjacentHTML('beforeend', next.map(row).join('')); more(); }; };
    more();
    $('#stCsvG').onclick = () => downloadText('settle-ledger.csv', [['# 정산 시뮬레이션 — 실제 지급 아님'], ['거래번호', '시각', '방송', '출연자', '닉네임', '선물', '수량', '스타', '원화', '상태', '환불 사유'], ...gifts.map(g => [g.txn || g.id, new Date(g.createdAt).toISOString(), streamById(g.streamId)?.title || g.streamId, g.performerName || g.performerId, g.nick, g.gift, g.qty || 1, g.stars, g.stars * R.krwPerStar, g.refunded ? '환불' : '정상', g.refundReason || ''])].map(r => r.map(csvCell).join(',')).join('\n'));
  }

  // ---- 방송별 (전체 범위) ----
  function renderStreams(box) {
    const rows = streams.map(s => { const g = gifts.filter(x => x.streamId === s.id); return { s, g, r: settle(g) }; }).filter(x => x.g.length).sort((a, b) => b.r.gross - a.r.gross);
    const tot = settle(gifts);
    box.innerHTML = `<div class="row between" style="margin-bottom:10px"><span class="muted" style="font-size:var(--fs-sm)">방송마다 따로 계산한 결과입니다. 방송별 합계와 전체 합계는 반올림 때문에 ±수 원 차이가 날 수 있습니다.</span><button class="btn sm" id="stCsvS">${icon.download}CSV</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>방송</th><th>레이블</th><th>상태</th><th class="r">건수</th><th class="r">스타</th><th class="r">총액</th><th class="r">환불</th><th class="r">수수료</th><th class="r">순액</th><th class="r">출연자 풀</th><th class="actions"></th></tr></thead><tbody>
      ${rows.map(({ s, r }) => { const st = STREAM_STATUS[s.status] || [s.status, '']; return `<tr><td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b title="${esc(s.title)}">${esc(s.title)}</b><div class="muted" style="font-size:var(--fs-xs)">${fmt.dateTime(s.startedAt)}</div></td><td>${esc(labelName(s.labelId))}</td><td><span class="pill ${st[1]}">${st[0]}</span></td><td class="r num">${fmt.num(r.count)}</td><td class="r num">${fmt.num(r.grossStars)}</td><td class="r num">${fmt.krw(r.gross)}</td><td class="r num">${r.refundedCount ? fmt.krw(r.refundKrw) : '—'}</td><td class="r num">−${fmt.krw(r.fee)}</td><td class="r num">${fmt.krw(r.net)}</td><td class="r num"><b>${fmt.krw(r.performerPool)}</b></td><td class="actions"><button class="btn sm ghost" data-scope="${esc(s.id)}">이 방송만</button></td></tr>`; }).join('')}
      </tbody><tfoot><tr><td><b>합계</b></td><td></td><td></td><td class="r num"><b>${fmt.num(tot.count)}</b></td><td class="r num"><b>${fmt.num(tot.grossStars)}</b></td><td class="r num"><b>${fmt.krw(tot.gross)}</b></td><td class="r num">${fmt.krw(tot.refundKrw)}</td><td class="r num">−${fmt.krw(tot.fee)}</td><td class="r num">${fmt.krw(tot.net)}</td><td class="r num"><b>${fmt.krw(tot.performerPool)}</b></td><td></td></tr></tfoot></table></div>`;
    $$('[data-scope]', box).forEach(b => b.onclick = () => setScope(b.dataset.scope));
    $('#stCsvS').onclick = () => downloadText('settle-streams.csv', [['# 정산 시뮬레이션 — 실제 지급 아님'], ['방송', '방송ID', '레이블', '상태', '건수', '스타', '총액', '환불', '수수료', '순액', '플랫폼', '레이블 몫', '출연자 풀'], ...rows.map(({ s, r }) => [s.title, s.id, labelName(s.labelId), STREAM_STATUS[s.status]?.[0] || s.status, r.count, r.grossStars, r.gross, r.refundKrw, r.fee, r.net, r.platform, r.label, r.performerPool])].map(r => r.map(csvCell).join(',')).join('\n'));
  }

  // ---- 범위 변경 · 실시간 갱신 ----
  let unsub = null;
  function watch() {
    if (unsub) { unsub(); unsub = null; }
    const ids = scope === 'all' ? streams.filter(s => s.status === 'live').map(s => s.id) : [scope];
    const refresh = debounce(() => load(), 800);
    const offs = ids.map(id => { try { return data.subscribe(id, { onGift: refresh }); } catch (e) { return null; } }).filter(Boolean);
    unsub = () => offs.forEach(f => f());
  }
  function setScope(v) {
    scope = v; $('#stScope').value = v;
    history.replaceState(null, '', '#/settle' + (v === 'all' ? '' : '/' + v));
    if (v === 'all' && tab === 'streams') tab = 'performers';
    watch(); load();
  }
  $('#stScope').onchange = e => setScope(e.target.value);
  cleanup(() => unsub && unsub());
  cleanup(bus.on('reset', () => load()));
  watch();
  await load();
}
