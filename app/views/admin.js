/* LIVE STAGE v2 — 관리자 화면  (#/admin/:tab?)
   현황 · 신고 · 이용자 · 방송 · 거래 검색 · 감사 기록.  파괴적 작업은 전부 confirmBox, 실패는 toast 로 그대로 보여준다. */
import { $, $$, esc, fmt, icon, toast, modal, setLoading, bus, debounce } from '../core.js';

/* core.confirmBox / promptBox 는 m.close() 가 onClose→res(false|null) 를 먼저 호출해 항상 취소로 끝난다 (core.js 수정 전 임시).
   같은 마크업의 로컬 래퍼 — core 가 고쳐지면 import 로 되돌리면 됨 */
const confirmBox = ({ title, text, ok = '확인', danger = false }) => new Promise(res => { let v = false; const m = modal({ title, body: `<p class="muted">${text}</p>`, footer: `<button class="btn ghost" data-close>취소</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cfOk">${esc(ok)}</button>`, onClose: () => res(v) }); $('#cfOk').onclick = () => { v = true; m.close(); }; });
const promptBox = ({ title, label, value = '', placeholder = '', ok = '확인' }) => new Promise(res => { let v = null; const m = modal({ title, body: `<label class="field"><span>${esc(label)}</span><input id="pbIn" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`, footer: `<button class="btn ghost" data-close>취소</button><button class="btn primary" id="pbOk">${esc(ok)}</button>`, onClose: () => res(v) }); const go = () => { v = $('#pbIn').value.trim(); m.close(); }; $('#pbOk').onclick = go; $('#pbIn').addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); });

const TABS = [['overview', '현황', 'home'], ['reports', '신고', 'flag'], ['users', '이용자', 'users'], ['streams', '방송', 'live'], ['txns', '거래 검색', 'search'], ['audit', '감사 기록', 'receipt']];
const SSTAT = { live: ['LIVE', 'live'], scheduled: ['예정', ''], ended: ['종료', 'dark'], stopped: ['중단', 'bad'] };
const USTAT = { active: ['정상', 'ok'], suspended: ['정지', 'warn'], blocked: ['차단', 'bad'] };
const ROLE = { viewer: '시청자', host: '호스트', moderator: '모더레이터', admin: '관리자' };
const REASONS = ['채팅 욕설·비하', '스팸·광고', '후원 강요 의심', '성적·선정적 내용', '사칭', '기타'];
const sPill = s => { const x = SSTAT[s] || [s, '']; return `<span class="pill ${x[1]}">${esc(x[0])}</span>`; };
const uPill = u => { const x = USTAT[u.status] || [u.status, '']; return `<span class="pill ${x[1]}">${esc(x[0])}${u.status === 'suspended' && u.until ? ` · ${fmt.dateTime(u.until)}까지` : ''}</span>`; };
const errBox = (e, what) => `<div class="note bad"><b>${esc(what)}을(를) 불러오지 못했습니다</b> ${esc(e.message || e)}</div>`;
const empty = (ic, t, s = '') => `<div class="empty"><div class="ic">${icon[ic]}</div><b>${t}</b>${s ? `<span class="muted">${s}</span>` : ''}</div>`;
const skel = (n = 3) => `<div class="stack">${'<div class="skeleton" style="height:64px"></div>'.repeat(n)}</div>`;
const hhmm = t => new Date(t).toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' });
const ell = 'max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

export default async function render(ctx) {
  const { el, route, cleanup, data } = ctx;
  const me = data.me(); const demo = data.mode === 'demo';

  if (!me || me.role !== 'admin') {
    el.innerHTML = `<div class="page narrow"><div class="empty"><div class="ic">${icon.admin}</div><b>관리자 권한이 필요합니다</b>
      <span class="muted">${demo ? '시연 모드에서는 역할을 관리자로 바꿔 체험할 수 있습니다.' : me ? '현재 계정은 관리자가 아닙니다. 권한은 서버가 판정하며 이 화면에서 바꿀 수 없습니다.' : '관리자 계정으로 로그인하세요.'}</span>
      ${demo ? '<button class="btn primary" id="adRole">역할 선택</button>' : !me ? '<button class="btn primary" id="adAuth">로그인</button>' : ''}</div></div>`;
    const b = $('#adRole'); if (b) b.onclick = () => ctx.openRole();
    const a = $('#adAuth'); if (a) a.onclick = () => ctx.openAuth();
    return;
  }

  let tab = TABS.some(t => t[0] === route.seg[1]) ? route.seg[1] : 'overview';
  el.innerHTML = `<div class="page">
    <div class="sec"><div><div class="row" style="gap:8px"><h2>관리자</h2>${demo ? '<span class="pill">시연 데이터</span>' : '<span class="pill ok">서버 연동</span>'}</div><div class="sub">${esc(me.nick)} · 중요 작업은 모두 감사 기록에 남습니다.</div></div></div>
    <div class="dash"><nav class="side-nav" aria-label="관리자 메뉴">${TABS.map(([k, n, ic]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${icon[ic]}${n}</button>`).join('')}</nav><section id="adBody" style="min-width:0"></section></div></div>`;
  $$('.side-nav button', el).forEach(b => b.onclick = () => { tab = b.dataset.tab; $$('.side-nav button', el).forEach(x => x.classList.toggle('on', x === b)); history.replaceState(null, '', '#/admin/' + tab); show(); });

  let gen = 0;
  async function show() {
    const my = ++gen; const box = $('#adBody'); box.innerHTML = skel();
    const fn = { overview, reports, users, streams, txns, audit }[tab];
    try { await fn(box, () => my === gen); } catch (e) { if (my !== gen) return; console.error(e); toast(e.message, 'bad'); box.innerHTML = errBox(e, TABS.find(t => t[0] === tab)[1]); }
  }
  const act = async (btn, { title, text, ok, danger = true, run, done }) => {
    if (!await confirmBox({ title, text, ok, danger })) return;
    setLoading(btn, true);
    try { await run(); toast(done, 'ok'); } catch (e) { toast(e.message, 'bad'); if (e.code === 'NOT_SUPPORTED') btn.disabled = true; else if (e.code === 'AUTH') ctx.openAuth(); } finally { if (btn.isConnected) setLoading(btn, false); }
  };
  const stopStreamFlow = async (btn, s, after) => {
    const reason = await promptBox({ title: '방송 강제 중단', label: '중단 사유 (시청자에게 공지됩니다)', placeholder: '예: 운영 정책 위반', ok: '다음' });
    if (reason == null) return;
    await act(btn, { title: '방송 강제 중단', text: `<b>${esc(s.title)}</b> 방송을 중단합니다. 진행 중인 라운드도 종료되며 되돌릴 수 없습니다.<br>사유: ${esc(reason || '(없음)')}`, ok: '중단', run: () => data.stopStream(s.id, reason), done: '방송을 중단했습니다' });
    after && after();
  };
  const sumGiftsByStream = gifts => { const m = {}; gifts.forEach(g => { if (!g.refunded) m[g.streamId] = (m[g.streamId] || 0) + g.stars; }); return m; };

  /* ---------- 현황 ---------- */
  async function overview(box, alive) {
    const [sts, reps, us, gifts, aud] = await Promise.all([data.streams(), data.reports().catch(() => null), data.users().catch(() => null), data.gifts({ limit: 5000 }).catch(() => []), data.audit().catch(() => null)]);
    if (!alive()) return;
    const live = sts.filter(s => s.status === 'live'), sched = sts.filter(s => s.status === 'scheduled');
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const today = gifts.filter(g => g.createdAt >= +dayStart && !g.refunded);
    const openReps = reps ? reps.filter(r => r.status === 'open').length : null, sanctioned = us ? us.filter(u => u.status !== 'active').length : null;
    const sum = sumGiftsByStream(gifts);
    const stat = (k, v, sub = '') => `<div class="stat"><div class="k">${k}</div><div class="v num">${v}</div>${sub ? `<div class="muted" style="font-size:var(--fs-xs)">${sub}</div>` : ''}</div>`;
    box.innerHTML = `<div class="grid stats">
        ${stat('방송 중', live.length)}${stat('예정', sched.length)}${stat('미처리 신고', openReps ?? '—', openReps == null ? '지원되지 않음' : '')}${stat('제재 중 이용자', sanctioned ?? '—', sanctioned == null ? '지원되지 않음' : '')}${stat('오늘 후원', `${fmt.num(today.length)}<small>건</small>`, fmt.star(today.reduce((a, g) => a + g.stars, 0)))}
      </div>
      <div class="sec"><h2>진행 중인 방송</h2><span class="sub">${live.length}개</span></div>
      ${live.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>방송</th><th>레이블</th><th>호스트</th><th class="r">시청자</th><th class="r">후원 합계</th><th>시작</th><th class="actions">작업</th></tr></thead><tbody>
        ${live.map(s => `<tr data-sid="${esc(s.id)}"><td style="${ell}"><b title="${esc(s.title)}">${esc(s.title)}</b></td><td>${esc(s.label?.name || s.labelId)}</td><td>${esc(s.hostName || '—')}</td><td class="r num">${s.viewers == null ? '—' : fmt.num(s.viewers)}</td><td class="r num">${fmt.star(sum[s.id] || 0)}</td><td class="num">${fmt.rel(s.startedAt)}</td>
          <td class="actions"><a class="btn sm ghost" href="#/live/${esc(s.id)}">${icon.eye}보기</a> <button class="btn sm danger" data-stop="${esc(s.id)}">${icon.stop}강제 중단</button></td></tr>`).join('')}</tbody></table></div>` : empty('live', '진행 중인 방송이 없습니다')}
      <div class="sec"><h2>최근 감사 기록</h2><button class="btn sm ghost" data-go="audit">전체 보기 ${icon.chevron}</button></div>
      ${aud == null ? '<div class="note">서버 모드에서는 감사 기록 조회가 아직 지원되지 않습니다 (v8 migration 필요).</div>' : aud.length ? `<div class="timeline">${aud.slice(0, 5).map(a => `<div class="it"><span class="t" title="${fmt.dateTime(a.at)}">${hhmm(a.at)}</span><span><b>${esc(a.actor)}</b> · ${esc(a.action)} <span class="tag">${esc(a.target)}</span>${a.detail ? ` <span class="muted">${esc(a.detail)}</span>` : ''}</span></div>`).join('')}</div>` : empty('receipt', '아직 기록이 없습니다')}`;
    $$('[data-stop]', box).forEach(b => b.onclick = () => stopStreamFlow(b, live.find(s => s.id === b.dataset.stop), () => alive() && show()));
    $$('[data-go]', box).forEach(b => b.onclick = () => $(`.side-nav [data-tab="${b.dataset.go}"]`, el).click());
  }

  /* ---------- 신고 ---------- */
  let repFilter = 'open';
  async function reports(box, alive) {
    let list; try { list = await data.reports(); } catch (e) { if (!alive()) return; box.innerHTML = e.code === 'NOT_SUPPORTED' ? `<div class="note warn"><b>신고 목록</b> ${esc(e.message)}</div>` : errBox(e, '신고 목록'); return; }
    if (!alive()) return;
    let sts = []; try { sts = await data.streams(); } catch (e) {}
    const sName = id => (sts.find(s => s.id === id) || {}).title || id || '—';
    list.sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.at - a.at);
    const shown = list.filter(r => repFilter === 'all' || (repFilter === 'open' ? r.status === 'open' : r.status !== 'open'));
    const cnt = { open: list.filter(r => r.status === 'open').length, done: list.filter(r => r.status !== 'open').length, all: list.length };
    box.innerHTML = `<div class="row between" style="margin-bottom:12px"><div class="seg" role="tablist">${[['open', '대기'], ['done', '처리됨'], ['all', '전체']].map(([k, n]) => `<button data-f="${k}" class="${repFilter === k ? 'on' : ''}">${n} <span class="num muted">${cnt[k]}</span></button>`).join('')}</div>
      ${demo ? `<button class="btn sm violet" id="adDemoRep">${icon.flag}데모 신고 접수</button>` : ''}</div>
      ${shown.length ? `<div class="stack">${shown.map(r => `<div class="card pad" data-rid="${esc(r.id)}"><div class="stack" style="gap:10px">
        <div style="min-width:0"><div class="row" style="gap:6px"><b>${esc(r.reporter || '익명')}</b><span class="muted">→</span><b>${esc(r.target)}</b><span class="pill ${r.status === 'open' ? 'warn' : r.status === 'dismissed' ? '' : 'ok'}">${r.status === 'open' ? '대기' : r.status === 'dismissed' ? '기각' : '처리됨'}</span>${r.action ? `<span class="tag">${esc(r.action)}</span>` : ''}</div>
          <div style="margin-top:4px"><span class="tag">${esc(r.reason)}</span> ${r.detail ? `<span class="muted">${esc(r.detail)}</span>` : ''}</div>
          <div class="muted num" style="font-size:var(--fs-xs);margin-top:4px">${fmt.dateTime(r.at)} (${fmt.rel(r.at)}) · <a href="#/live/${esc(r.streamId)}" style="text-decoration:underline">${esc(sName(r.streamId))}</a>${r.resolvedAt ? ` · 처리 ${fmt.dateTime(r.resolvedAt)}` : ''}</div></div>
        ${r.status === 'open' ? `<div class="row"><button class="btn sm" data-act="resolve">${icon.check}조치 완료</button><button class="btn sm ghost" data-act="dismiss">기각</button><button class="btn sm danger" data-act="suspend">대상 3일 정지</button><button class="btn sm danger" data-act="block">${icon.block}영구 차단</button></div>` : ''}
      </div></div>`).join('')}</div>` : empty('flag', repFilter === 'open' ? '대기 중인 신고가 없습니다' : '신고가 없습니다')}`;
    $$('[data-f]', box).forEach(b => b.onclick = () => { repFilter = b.dataset.f; show(); });
    $$('[data-act]', box).forEach(b => b.onclick = () => { const id = b.closest('[data-rid]').dataset.rid; const r = list.find(x => x.id === id);
      const txt = { resolve: '신고를 조치 완료로 표시합니다 (대상 제재 없음).', dismiss: '신고를 기각합니다.', suspend: `<b>${esc(r.target)}</b> 을(를) 3일간 정지하고 신고를 처리합니다.`, block: `<b>${esc(r.target)}</b> 을(를) 영구 차단하고 신고를 처리합니다. 되돌리려면 이용자 탭에서 해제해야 합니다.` }[b.dataset.act];
      act(b, { title: '신고 처리', text: txt, ok: b.textContent.trim(), danger: b.dataset.act !== 'resolve', run: () => data.resolveReport(id, b.dataset.act), done: '신고를 처리했습니다' }).then(() => alive() && show()); });
    const dr = $('#adDemoRep'); if (dr) dr.onclick = () => openReportForm(sts, () => alive() && show());
  }
  function openReportForm(sts, after) {
    const m = modal({ title: '신고 접수 (시청자 화면과 같은 양식)', body: `<form id="adRepForm" class="form">
      <label class="field"><span>방송</span><select name="streamId">${sts.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('')}</select></label>
      <div class="two"><label class="field"><span>대상 닉네임</span><input name="target" required maxlength="30" placeholder="신고할 이용자"></label>
      <label class="field"><span>사유</span><select name="reason">${REASONS.map(r => `<option>${r}</option>`).join('')}</select></label></div>
      <label class="field"><span>상세 <span class="hint">선택</span></span><textarea name="detail" maxlength="300" placeholder="상황을 간단히 적어주세요"></textarea></label>
      <div class="note">시연 모드: 접수된 신고는 바로 위 목록의 '대기'에 나타납니다. 접수→처리 흐름을 그대로 보여줄 수 있습니다.</div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>취소</button><button class="btn primary" id="adRepGo">접수</button></div></form>` });
    $('#adRepForm').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); const b = $('#adRepGo'); setLoading(b, true);
      try { await data.report({ streamId: f.get('streamId'), target: String(f.get('target')).trim(), reason: f.get('reason'), detail: String(f.get('detail') || '').trim() }); m.close(); toast('신고를 접수했습니다', 'ok'); after && after(); } catch (err) { toast(err.message, 'bad'); } finally { setLoading(b, false); } };
  }

  /* ---------- 이용자 ---------- */
  let userQ = '';
  async function users(box, alive) {
    const list = await data.users(); if (!alive()) return;
    box.innerHTML = `<div class="row between" style="margin-bottom:12px"><label class="search" style="flex:1;max-width:360px">${icon.search}<input id="adUserQ" placeholder="닉네임 검색" value="${esc(userQ)}" aria-label="이용자 검색"></label><span class="muted" style="font-size:var(--fs-sm)">전체 ${fmt.num(list.length)}명 · 제재 중 ${fmt.num(list.filter(u => u.status !== 'active').length)}명</span></div><div id="adUserTbl"></div>`;
    const draw = () => {
      const q = userQ.trim().toLowerCase(); const rows = list.filter(u => !q || String(u.nick).toLowerCase().includes(q)).sort((a, b) => (a.status === 'active' ? 1 : 0) - (b.status === 'active' ? 1 : 0) || b.joinedAt - a.joinedAt);
      $('#adUserTbl').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>닉네임</th><th>역할</th><th>상태</th><th>가입</th><th class="actions">작업</th></tr></thead><tbody>
        ${rows.map(u => `<tr><td><b>${esc(u.nick)}</b></td><td>${esc(ROLE[u.role] || u.role)}</td><td>${uPill(u)}</td><td class="num">${fmt.date(u.joinedAt)}</td><td class="actions">
          ${u.status !== 'suspended' ? `<button class="btn sm" data-s="suspended" data-n="${esc(u.nick)}">정지 3일</button> ` : ''}${u.status !== 'blocked' ? `<button class="btn sm danger" data-s="blocked" data-n="${esc(u.nick)}">${icon.block}영구 차단</button> ` : ''}${u.status !== 'active' ? `<button class="btn sm ghost" data-s="active" data-n="${esc(u.nick)}">${icon.check}해제</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('users', '검색 결과가 없습니다');
      $$('[data-s]', box).forEach(b => b.onclick = () => { const n = b.dataset.n, s = b.dataset.s;
        act(b, { title: { suspended: '3일 정지', blocked: '영구 차단', active: '제재 해제' }[s], text: `<b>${esc(n)}</b> 을(를) ${{ suspended: '3일간 정지합니다. 기간 동안 채팅·후원이 막힙니다.', blocked: '영구 차단합니다. 해제 전까지 서비스를 이용할 수 없습니다.', active: '정상 상태로 되돌립니다.' }[s]}`, ok: b.textContent.trim(), danger: s !== 'active', run: () => data.sanction(n, s), done: '처리했습니다' }).then(() => alive() && show()); });
    };
    draw();
    $('#adUserQ').oninput = debounce(e => { userQ = e.target.value; draw(); }, 120);
  }

  /* ---------- 방송 · 레이블 ---------- */
  async function streams(box, alive) {
    const [sts, gifts, labels] = await Promise.all([data.streams(), data.gifts({ limit: 5000 }).catch(() => []), data.labels().catch(() => [])]);
    if (!alive()) return;
    const sum = sumGiftsByStream(gifts); const order = { live: 0, scheduled: 1, ended: 2, stopped: 3 };
    sts.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (b.startedAt || 0) - (a.startedAt || 0));
    const LST = { active: ['승인됨', 'ok'], pending: ['대기', 'warn'], suspended: ['정지', 'bad'] };
    box.innerHTML = `<div class="sec"><h2>전체 방송</h2><span class="sub">${sts.length}개 · 후원 합계는 환불 제외</span></div>
      ${sts.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>방송</th><th>레이블</th><th>호스트</th><th>상태</th><th class="r">시청자</th><th class="r">후원 합계</th><th class="actions">작업</th></tr></thead><tbody>
        ${sts.map(s => `<tr><td style="${ell}"><b title="${esc(s.title)}">${esc(s.title)}</b><div class="muted num" style="font-size:var(--fs-xs)">${fmt.dateTime(s.startedAt)}${s.stoppedReason ? ` · 중단 사유: ${esc(s.stoppedReason)}` : ''}</div></td><td>${esc(s.label?.name || (labels.find(l => l.id === s.labelId) || {}).name || s.labelId)}</td><td>${esc(s.hostName || '—')}</td><td>${sPill(s.status)}</td><td class="r num">${s.status === 'live' && s.viewers != null ? fmt.num(s.viewers) : '—'}</td><td class="r num">${fmt.star(sum[s.id] || 0)}</td>
          <td class="actions"><a class="btn sm ghost" href="#/live/${esc(s.id)}">${icon.eye}보기</a> ${s.status === 'live' ? `<button class="btn sm danger" data-stop="${esc(s.id)}">${icon.stop}강제 중단</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('live', '방송이 없습니다')}
      <div class="sec"><h2>레이블</h2><span class="sub">${labels.length}개${demo ? '' : ' · 서버 모드에서는 상태 변경이 아직 지원되지 않습니다'}</span></div>
      ${labels.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>레이블</th><th>대표</th><th>상태</th><th class="r">방송 수</th><th>가입</th><th class="actions">작업</th></tr></thead><tbody>
        ${labels.map(l => { const st = LST[l.status] || [l.status || '—', '']; return `<tr><td><b>${esc(l.name)}</b> <span class="muted" style="font-size:var(--fs-xs)">${esc(l.id)}</span></td><td>${esc(l.owner || '—')}</td><td><span class="pill ${st[1]}">${esc(st[0])}</span></td><td class="r num">${fmt.num(l.streams ?? sts.filter(s => s.labelId === l.id).length)}</td><td class="num">${l.joinedAt ? fmt.date(l.joinedAt) : '—'}</td>
          <td class="actions">${l.status !== 'active' ? `<button class="btn sm" data-ls="active" data-l="${esc(l.id)}" ${demo ? '' : 'disabled title="서버 모드 미지원"'}>${icon.check}승인</button> ` : ''}${l.status !== 'suspended' ? `<button class="btn sm danger" data-ls="suspended" data-l="${esc(l.id)}" ${demo ? '' : 'disabled title="서버 모드 미지원"'}>정지</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : empty('team', '레이블이 없습니다')}`;
    $$('[data-stop]', box).forEach(b => b.onclick = () => stopStreamFlow(b, sts.find(s => s.id === b.dataset.stop), () => alive() && show()));
    $$('[data-ls]', box).forEach(b => b.onclick = () => { const l = labels.find(x => x.id === b.dataset.l), s = b.dataset.ls;
      act(b, { title: s === 'active' ? '레이블 승인' : '레이블 정지', text: `<b>${esc(l.name)}</b> 레이블을 ${s === 'active' ? '승인합니다. 방송 개설이 가능해집니다.' : '정지합니다. 새 방송을 열 수 없습니다.'}`, ok: s === 'active' ? '승인' : '정지', danger: s !== 'active', run: () => data.setLabelStatus(l.id, s), done: '처리했습니다' }).then(() => alive() && show()); });
  }

  /* ---------- 거래 검색 ---------- */
  let txQ = '';
  async function txns(box, alive) {
    let sts = []; try { sts = await data.streams(); } catch (e) {}
    const sName = id => (sts.find(s => s.id === id) || {}).title || id;
    box.innerHTML = `<div class="row" style="margin-bottom:12px"><label class="search" style="flex:1;max-width:420px">${icon.search}<input id="adTxQ" placeholder="닉네임 또는 거래번호 (예: DEMO-00012)" value="${esc(txQ)}" aria-label="거래 검색"></label><button class="btn" id="adTxGo">${icon.search}검색</button></div>
      <div class="muted" style="font-size:var(--fs-sm);margin-bottom:10px">${demo ? '환불 처리 시 출연자 집계에서 차감되고 감사 기록에 남습니다.' : '서버 모드: 닉네임 검색만 가능하며 환불 처리는 아직 지원되지 않습니다.'}</div><div id="adTxRes"></div>`;
    const run = async () => {
      const res = $('#adTxRes'); if (!res) return; res.innerHTML = skel(2);
      let list; try { list = await data.gifts({ q: txQ.trim(), limit: 200 }); } catch (e) { if (!alive()) return; toast(e.message, 'bad'); res.innerHTML = errBox(e, '거래'); return; }
      if (!alive() || !$('#adTxRes')) return;
      res.innerHTML = list.length ? `<div class="muted" style="font-size:var(--fs-xs);margin-bottom:6px">최신 ${fmt.num(list.length)}건${list.length >= 200 ? ' (상한 — 조건을 좁혀 주세요)' : ''}</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>거래번호</th><th>시각</th><th>방송</th><th>출연자</th><th>닉네임</th><th>선물</th><th class="r">스타</th><th>상태</th>${demo ? '<th class="actions">작업</th>' : ''}</tr></thead><tbody>
        ${list.map(g => `<tr${g.refunded ? ' style="opacity:.55"' : ''}><td class="num" style="font-size:var(--fs-xs)">${esc(g.txn || g.id)}</td><td class="num">${fmt.dateTime(g.createdAt)}</td><td style="${ell};max-width:200px"><a href="#/live/${esc(g.streamId)}" title="${esc(sName(g.streamId))}">${esc(sName(g.streamId))}</a></td><td>${esc(g.performerName || g.performerId)}</td><td>${esc(g.nick)}</td><td>${esc(g.emoji || '')} ${esc(g.gift)}${(g.qty || 1) > 1 ? ` ×${g.qty}` : ''}</td><td class="r num">${fmt.num(g.stars)}</td><td>${g.refunded ? `<span class="pill bad" title="${esc(g.refundReason || '')}">환불</span>` : '<span class="pill ok">정상</span>'}</td>
          ${demo ? `<td class="actions">${g.refunded ? `<span class="muted" style="font-size:var(--fs-xs)">${esc(g.refundReason || '')}</span>` : `<button class="btn sm danger" data-rf="${esc(g.id)}">환불 처리</button>`}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : empty('search', '일치하는 거래가 없습니다', txQ ? '닉네임·거래번호·선물명으로 검색합니다' : '');
      $$('[data-rf]', res).forEach(b => b.onclick = async () => { const g = list.find(x => x.id === b.dataset.rf);
        const reason = await promptBox({ title: '환불 처리', label: '환불 사유', placeholder: '예: 중복 결제', ok: '다음' }); if (reason == null) return;
        act(b, { title: '환불 처리', text: `${esc(g.txn)} · <b>${esc(g.nick)}</b> → ${esc(g.performerName)} ${fmt.star(g.stars)} 을 환불합니다. 출연자 집계에서 차감되며 되돌릴 수 없습니다.<br>사유: ${esc(reason || '운영자 환불')}`, ok: '환불', run: () => data.refundGift(g.id, reason), done: '환불 처리했습니다' }).then(run); });
    };
    $('#adTxGo').onclick = () => { txQ = $('#adTxQ').value; run(); };
    $('#adTxQ').addEventListener('keydown', e => { if (e.key === 'Enter') { txQ = e.target.value; run(); } });
    $('#adTxQ').oninput = debounce(e => { txQ = e.target.value; run(); }, 350);
    run();
  }

  /* ---------- 감사 기록 ---------- */
  async function audit(box, alive) {
    let list; try { list = await data.audit(); } catch (e) { if (!alive()) return; box.innerHTML = e.code === 'NOT_SUPPORTED' ? `<div class="note warn"><b>감사 기록</b> ${esc(e.message)}</div>` : errBox(e, '감사 기록'); return; }
    if (!alive()) return;
    box.innerHTML = `<div class="note" style="margin-bottom:12px"><b>중요 작업은 모두 기록됩니다.</b> 신고 처리·제재·방송 중단·환불·레이블 상태 변경이 담당자와 함께 남습니다. 최근 ${fmt.num(list.length)}건.</div>
      ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>시각</th><th>담당자</th><th>작업</th><th>대상</th><th>상세</th></tr></thead><tbody>
        ${list.map(a => `<tr><td class="num" style="white-space:nowrap">${fmt.dateTime(a.at)}</td><td><b>${esc(a.actor)}</b></td><td>${esc(a.action)}</td><td><span class="tag">${esc(a.target)}</span></td><td class="muted">${esc(a.detail || '')}</td></tr>`).join('')}</tbody></table></div>` : empty('receipt', '아직 기록이 없습니다')}`;
  }

  // 실시간 갱신: 신고·이용자 버스
  const refresh = debounce(() => { if (tab === 'reports' || tab === 'users' || tab === 'overview') show(); }, 300);
  cleanup(bus.on('reports', () => { if (tab === 'reports' || tab === 'overview') refresh(); }));
  cleanup(bus.on('users', () => { if (tab === 'users' || tab === 'overview') refresh(); }));
  cleanup(bus.on('reset', () => show()));
  await show();
}
