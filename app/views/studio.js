/* LIVE STAGE v2 — 스튜디오(호스트): 개요 · 방송 설정 · 출연자 · 라운드 · 미션 · OBS 오버레이 · 결과 */
import { $, $$, esc, fmt, icon, avatar, router, toast, modal, setLoading, copyText, debounce } from '../core.js';
import { rankPerformers, rankTeams, roundTimeLeft, missionProgress, sumBy } from '../engine.js';

const EMOJIS = ['🎤', '🎶', '💃', '🍜', '🎮', '🎧', '🌙', '🔥', '🎭', '✨', '🐱', '🌸'];
const CATS = ['토크', '노래', '댄스', '먹방', '게임', 'ASMR', '합동방송'];
const TABS = [['overview', '개요', icon.home], ['setup', '방송 설정', icon.settings], ['performers', '출연자', icon.users], ['rounds', '라운드', icon.timer], ['missions', '미션', icon.target], ['obs', 'OBS 오버레이', icon.layers], ['results', '결과', icon.trophy]];
const ST = { live: ['LIVE', 'live'], scheduled: ['예정', 'violet'], ended: ['종료', ''], stopped: ['중단', 'bad'] };
const RS = { idle: ['대기', ''], running: ['진행 중', 'ok'], paused: ['일시정지', 'warn'], ended: ['종료', ''] };
const pill = (map, k) => { const [t, c] = map[k] || [k, '']; return `<span class="pill ${c}">${esc(t)}</span>`; };
const opt = (list, cur) => list.map(v => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
const timeText = r => { const t = roundTimeLeft(r); if (!t) return '—'; if (t.countUp) return '경과 ' + fmt.mmss(t.elapsed); return fmt.mmss(t.left) + (t.over ? ' · 마감' : ''); };
/* core.confirmBox 는 close→onClose 순서 때문에 항상 false 를 돌려주는 문제가 있어 여기서 동일 UI 로 대체 */
const confirmBox = ({ title, text, ok = '확인', danger = false }) => new Promise(res => { let v = false; const m = modal({ title, body: `<p class="muted">${esc(text)}</p>`, footer: `<button class="btn ghost" data-close>취소</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cfOk">${esc(ok)}</button>`, onClose: () => res(v) }); $('#cfOk').onclick = () => { v = true; m.close(); }; });
const teamName = (s, t) => (s.teams && s.teams[t]) || (t ? t + '팀' : '');

function injectStyle() {
  if ($('#studioStyle')) return;
  const st = document.createElement('style'); st.id = 'studioStyle';
  st.textContent = `.st-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}.st-head select{width:auto;max-width:min(420px,100%);font-weight:700}#stBody{min-width:0}.field>.seg{justify-self:start}#stBody .timeline .it{grid-template-columns:76px 1fr}#stBody .tbl td.num{white-space:nowrap}
.st-prev{position:relative;background:#000;border:1px solid var(--line);border-radius:var(--r);overflow:hidden;margin:0 auto}.st-prev.p{width:min(100%,300px);aspect-ratio:9/16}.st-prev.l{width:100%;aspect-ratio:16/9}.st-prevwrap{align-content:start}.st-prev iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.st-timer{font-size:var(--fs-3xl);font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.tbl input,.tbl select{height:32px;padding:0 8px;font-size:var(--fs-sm);min-width:90px}.tbl select{padding-right:28px}.tbl .ord{display:inline-flex;gap:2px}
.st-miss{display:grid;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line)}.st-miss:last-child{border-bottom:0}
.st-quick .btn{min-width:110px}details.st-x summary{cursor:pointer;color:var(--fg-3);font-size:var(--fs-xs);list-style:none}details.st-x[open] summary{color:var(--fg)}
.st-url{word-break:break-all;font-family:ui-monospace,monospace;font-size:var(--fs-xs);background:var(--bg-3);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 10px;color:var(--fg-2)}`;
  document.head.appendChild(st);
}

export default async function render(ctx) {
  const { el, data, cleanup } = ctx;
  injectStyle();
  const me = data.me();
  const canManage = me && ['host', 'admin'].includes(me.role);
  if (!canManage) {
    el.innerHTML = `<div class="page narrow"><div class="empty"><div class="ic">${icon.studio}</div><b>스튜디오는 호스트 전용입니다</b><span>방송을 만들고 라운드·미션·오버레이를 운영하려면 호스트 권한이 필요합니다.</span>
      <button class="btn primary" id="stAuth">${data.mode === 'demo' ? '역할 선택 (호스트)' : '로그인'}</button></div></div>`;
    $('#stAuth').onclick = () => data.mode === 'demo' ? ctx.openRole() : ctx.openAuth();
    return;
  }
  const fail = (e, btn) => { console.warn(e); if (e?.code === 'AUTH') return data.mode === 'demo' ? ctx.openRole() : ctx.openAuth(); toast(e?.message || String(e), 'bad'); if (e?.code === 'NOT_SUPPORTED' && btn) { btn.disabled = true; btn.title = e.message; } };
  const act = async (btn, fn) => { if (btn?.disabled) return; setLoading(btn, true); try { await fn(); } catch (e) { setLoading(btn, false); fail(e, btn); return false; } setLoading(btn, false); return true; };

  let all = await data.streams();
  if (me.role === 'host' && me.labelId) all = all.filter(s => s.labelId === me.labelId);
  const S = { stream: null, tab: ctx.route.seg[2] || 'overview', unsub: null, rounds: [] };
  if (!TABS.some(t => t[0] === S.tab)) S.tab = 'overview';
  const syncUrl = () => history.replaceState(null, '', router.href(`studio/${S.stream.id}/${S.tab}`));

  // ---------- 새 방송 만들기 ----------
  function openCreate() {
    const m = modal({ title: '새 방송 만들기', body: `<form id="stNew" class="form">
      <label class="field"><span>제목</span><input name="title" required maxlength="60" placeholder="예: 금요일 밤 합동 라이브"></label>
      <div class="two"><label class="field"><span>카테고리</span><select name="category">${opt(CATS, '토크')}</select></label>
      <label class="field"><span>모드</span><select name="mode"><option value="individual">개인전</option><option value="team">팀전</option></select></label></div>
      <label class="field"><span>출연자 <span class="hint">쉼표로 구분</span></span><input name="performers" placeholder="미유, 리나, 우기"></label>
      <button class="btn primary block" id="stNewGo">만들기</button></form>` });
    $('#stNew').onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      const performers = String(f.get('performers') || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 12);
      await act($('#stNewGo'), async () => { const s = await data.createStream({ title: f.get('title').trim(), category: f.get('category'), mode: f.get('mode'), performers, labelId: me.labelId }); m.close(); toast('방송을 만들었습니다', 'ok'); router.go(`studio/${s.id}/setup`); });
    };
  }
  if (!all.length) {
    el.innerHTML = `<div class="page narrow"><div class="empty"><div class="ic">${icon.studio}</div><b>아직 만든 방송이 없습니다</b><span>첫 방송을 만들고 출연자·라운드·미션을 설정하세요.</span><button class="btn primary" id="stCreate">${icon.plus} 방송 생성</button></div></div>`;
    $('#stCreate').onclick = openCreate; openCreate(); return;
  }
  const wantId = ctx.route.seg[1];
  const first = all.find(s => s.id === wantId) || all.find(s => s.status === 'live') || all[0];

  // ---------- 셸 ----------
  el.innerHTML = `<div class="page">
    <div class="st-head"><select id="stSel" aria-label="방송 선택">${all.map(s => `<option value="${esc(s.id)}" ${s.id === first.id ? 'selected' : ''}>${esc(s.title)} · ${(ST[s.status] || [s.status])[0]}</option>`).join('')}</select>
      <span id="stPill"></span>${data.mode === 'demo' ? '<span class="pill warn">시연 데이터</span>' : ''}
      <a class="btn sm ghost" id="stView" href="#/live/${esc(first.id)}">${icon.eye} 시청자 화면 보기</a>
      <button class="btn sm" id="stNewBtn" style="margin-left:auto">${icon.plus} 새 방송</button></div>
    <div class="dash"><nav class="side-nav" aria-label="스튜디오 메뉴">${TABS.map(([k, n, ic]) => `<button data-tab="${k}" class="${k === S.tab ? 'on' : ''}">${ic}${n}</button>`).join('')}</nav><section id="stBody"></section></div></div>`;
  const body = $('#stBody');
  $('#stNewBtn').onclick = openCreate;
  $('#stSel').onchange = e => load(e.target.value);
  $$('[data-tab]', el).forEach(b => b.onclick = () => { S.tab = b.dataset.tab; $$('[data-tab]', el).forEach(x => x.classList.toggle('on', x === b)); syncUrl(); renderTab(); });

  async function load(id) {
    if (S.unsub) { S.unsub(); S.unsub = null; }
    body.innerHTML = '<div class="skeleton" style="height:240px"></div>';
    try { S.stream = await data.stream(id); } catch (e) { fail(e); return; }
    if (!S.stream) { body.innerHTML = `<div class="empty"><b>방송을 찾을 수 없습니다</b></div>`; return; }
    $('#stView').href = '#/live/' + S.stream.id; syncUrl(); paintPill();
    S.unsub = cleanup(data.subscribe(id, {
      onPerformers: list => { S.stream.performers = list; S.stream.performerIds = list.map(p => p.id); refresh(['overview', 'performers', 'rounds', 'results', 'missions']); },
      onRound: r => { S.stream.round = r; refresh(['overview', 'rounds', 'results']); },
      onMission: m => { const ms = S.stream.missions || []; const i = ms.findIndex(x => x.id === m.id); if (m._deleted) { if (i >= 0) ms.splice(i, 1); } else if (i >= 0) ms[i] = { ...ms[i], ...m }; else ms.push(m); S.stream.missions = ms; refresh(['overview', 'missions']); },
      onStream: s => { S.stream = { ...S.stream, ...s }; paintPill(); const o = $('#stSel option[value="' + CSS.escape(S.stream.id) + '"]'); if (o) o.textContent = `${S.stream.title} · ${(ST[S.stream.status] || [S.stream.status])[0]}`; refresh(['overview', 'rounds', 'results']); },
    }));
    renderTab();
  }
  const paintPill = () => { $('#stPill').innerHTML = pill(ST, S.stream.status); };
  const refresh = tabs => { if (tabs.includes(S.tab)) renderTab(); };
  function renderTab() { const fn = { overview, setup, performers, rounds, missions, obs, results }[S.tab]; try { fn(); } catch (e) { console.error(e); body.innerHTML = `<div class="note bad">화면 오류: ${esc(e.message)}</div>`; } }
  cleanup.timer(setInterval(() => { const r = S.stream?.round; $$('[data-rt]', body).forEach(x => x.textContent = timeText(r)); }, 1000));

  // ---------- 공통 액션 ----------
  const setStatus = async (btn, status) => {
    const txt = status === 'live' ? '방송을 시작합니다. 시청자에게 LIVE 로 표시됩니다.' : '방송을 종료합니다. 진행 중인 라운드도 함께 마감됩니다.';
    if (!await confirmBox({ title: status === 'live' ? '방송 시작' : '방송 종료', text: txt, ok: status === 'live' ? '시작' : '종료', danger: status !== 'live' })) return;
    await act(btn, async () => { const s = await data.updateStream(S.stream.id, { status }); if (s) S.stream = { ...S.stream, ...s }; paintPill(); toast(status === 'live' ? '방송을 시작했습니다' : '방송을 종료했습니다', 'ok'); renderTab(); });
  };
  const roundBtns = r => `<div class="row st-quick">
    ${r.status === 'running' ? `<button class="btn" data-ra="pause">${icon.pause} 일시정지</button>` : r.status === 'paused' ? `<button class="btn primary" data-ra="resume">${icon.play} 재개</button>` : ''}
    ${['running', 'paused'].includes(r.status) ? `<button class="btn danger" data-ra="end">${icon.stop} 라운드 종료</button>` : ''}
    ${!['running', 'paused'].includes(r.status) ? `<button class="btn primary" data-ra="start" ${S.stream.status !== 'live' ? 'disabled title="방송 중일 때만 시작할 수 있습니다"' : ''}>${icon.play} 라운드 시작</button>` : ''}</div>`;
  function bindRound(root) {
    $$('[data-ra]', root).forEach(b => b.onclick = async () => {
      const a = b.dataset.ra, id = S.stream.id;
      if (a === 'start') { const title = $('#rdTitle', root)?.value.trim() || ''; const minutes = Math.max(0, Number($('#rdMin', root)?.value || 0)); return act(b, async () => { await data.startRound(id, { title, minutes }); toast(`라운드 ${(S.stream.round?.no || 0) + 1} 시작`, 'ok'); }); }
      if (a === 'end' && !await confirmBox({ title: '라운드 종료', text: '현재 집계로 순위를 확정합니다. 종료 후 후원은 누적에만 반영됩니다.', ok: '종료', danger: true })) return;
      await act(b, async () => { await data[{ pause: 'pauseRound', resume: 'resumeRound', end: 'endRound' }[a]](id); toast({ pause: '라운드를 일시정지했습니다', resume: '라운드를 재개했습니다', end: '라운드를 종료했습니다' }[a], 'ok'); });
    });
  }
  const rankTable = (perfs, key, s) => {
    const rk = rankPerformers(perfs, key);
    if (!rk.length) return '<div class="empty"><b>출연자가 없습니다</b></div>';
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>순위</th><th>출연자</th>${s.mode === 'team' ? '<th>팀</th>' : ''}<th class="r">${key === 'roundTotal' ? '이번 라운드' : '누적'}</th></tr></thead><tbody>
      ${rk.map(p => `<tr><td class="num">${p.rank === 1 && p.value > 0 ? '👑 ' : ''}${p.rank}</td><td><span class="row">${avatar(p, 'sm')}<b>${esc(p.name)}</b></span></td>${s.mode === 'team' ? `<td>${esc(teamName(s, p.team))}</td>` : ''}<td class="r num ${p.rank === 1 && p.value > 0 ? 'gold' : ''}">${fmt.num(p.value)}</td></tr>`).join('')}</tbody></table></div>
      ${s.mode === 'team' ? `<div class="grid stats" style="margin-top:12px">${rankTeams(perfs, key).map(t => `<div class="stat"><div class="k">${t.rank === 1 && t.value > 0 ? '👑 ' : ''}${esc(teamName(s, t.team))}</div><div class="v num ${t.rank === 1 && t.value > 0 ? 'gold' : ''}">${fmt.num(t.value)}<small>스타</small></div></div>`).join('')}</div>` : ''}`;
  };

  // ---------- 1. 개요 ----------
  function overview() {
    const s = S.stream, r = s.round || { no: 0, status: 'idle' }, ms = s.missions || [];
    body.innerHTML = `<div class="grid stats">
      <div class="stat"><div class="k">상태</div><div class="v">${pill(ST, s.status)}</div></div>
      <div class="stat"><div class="k">현재 라운드</div><div class="v num">${r.no || '—'}<small>${(RS[r.status] || [''])[0]}</small></div></div>
      <div class="stat"><div class="k">남은 시간</div><div class="v num" data-rt>${timeText(r)}</div></div>
      <div class="stat"><div class="k">이번 라운드 합계</div><div class="v num">${fmt.num(sumBy(s.performers, 'roundTotal'))}<small>스타</small></div></div>
      <div class="stat"><div class="k">누적 합계</div><div class="v num gold">${fmt.num(sumBy(s.performers, 'total'))}<small>스타</small></div></div>
      <div class="stat"><div class="k">미션 달성</div><div class="v num">${ms.filter(m => m.done).length}<small>/ ${ms.length}</small></div></div></div>
    <div class="sec"><h2>빠른 조작</h2><span class="sub">${s.hostName ? esc(s.hostName) + ' · ' : ''}${esc(s.category || '')}</span></div>
    <div class="card pad stack"><div class="row st-quick">
      ${s.status === 'live' ? `<button class="btn danger" id="ovEnd">${icon.stop} 방송 종료</button>` : `<button class="btn primary" id="ovLive">${icon.live} 방송 시작</button>`}
      <a class="btn ghost" href="#/live/${esc(s.id)}">${icon.eye} 시청자 화면</a><a class="btn ghost" href="#/settle/${esc(s.id)}">${icon.receipt} 정산</a></div>
      <div class="row between"><div><b>라운드 ${r.no || '—'}${r.title ? ' · ' + esc(r.title) : ''}</b> ${pill(RS, r.status)}</div>${roundBtns(r)}</div></div>
    <div class="grid two" style="margin-top:16px">
      <div class="panel"><div class="panel-h">진행 순서 · 운영 메모<small>호스트만 봅니다</small></div><div class="panel-b stack"><textarea id="ovMemo" placeholder="예: 19:00 오프닝 → 라운드1 발라드 → 라운드2 댄스 → 결과 발표">${esc(s.memo || '')}</textarea><button class="btn sm" id="ovMemoSave" style="justify-self:start">메모 저장</button></div></div>
      <div class="panel"><div class="panel-h">방송 규칙<small>시청자에게 표시</small></div><div class="panel-b">${s.rules ? `<p class="muted" style="white-space:pre-wrap">${esc(s.rules)}</p>` : '<p class="dim">아직 규칙이 없습니다 — 방송 설정에서 입력하세요.</p>'}</div></div></div>`;
    const lb = $('#ovLive'); if (lb) lb.onclick = () => setStatus(lb, 'live');
    const eb = $('#ovEnd'); if (eb) eb.onclick = () => setStatus(eb, 'ended');
    $('#ovMemoSave').onclick = () => act($('#ovMemoSave'), async () => { const memo = $('#ovMemo').value; await data.updateStream(s.id, { memo }); S.stream.memo = memo; toast('메모를 저장했습니다', 'ok'); });
    bindRound(body);
  }

  // ---------- 2. 방송 설정 ----------
  function setup() {
    const s = S.stream, teams = s.teams || { A: 'A팀', B: 'B팀' };
    body.innerHTML = `<form id="stForm" class="card pad form">
      <label class="field"><span>제목</span><input name="title" required maxlength="60" value="${esc(s.title)}"></label>
      <div class="two"><label class="field"><span>카테고리</span><select name="category">${opt(CATS, s.category)}</select></label>
      <div class="field"><span>모드</span><div class="seg" id="stMode"><button type="button" data-m="individual" class="${s.mode !== 'team' ? 'on' : ''}">개인전</button><button type="button" data-m="team" class="${s.mode === 'team' ? 'on' : ''}">팀전</button></div></div></div>
      <div class="two" id="stTeams" ${s.mode === 'team' ? '' : 'hidden'}><label class="field"><span>팀 A 이름</span><input name="teamA" maxlength="20" value="${esc(teams.A || '')}"></label><label class="field"><span>팀 B 이름</span><input name="teamB" maxlength="20" value="${esc(teams.B || '')}"></label></div>
      <label class="field"><span>소개 <span class="hint">방송 카드에 표시</span></span><textarea name="desc" maxlength="300" style="min-height:64px">${esc(s.desc || '')}</textarea></label>
      <label class="field"><span>방송 규칙 <span class="hint">시청자 화면에 표시</span></span><textarea name="rules" maxlength="600" placeholder="예: 라운드마다 집계가 0부터 시작합니다. 동점은 먼저 도달한 쪽이 상위.">${esc(s.rules || '')}</textarea></label>
      <div class="row"><button class="btn primary" id="stSave">저장</button><button type="button" class="btn" id="stClone">${icon.copy} 이전 방송 설정 복제</button><button type="button" class="btn ghost" id="stNew2">${icon.plus} 새 방송 만들기</button></div>
      ${data.mode === 'server' ? '<div class="note">서버 모드에서는 복제를 지원하지 않습니다. 규칙·팀 저장은 v8 마이그레이션이 필요합니다.</div>' : ''}</form>`;
    let mode = s.mode === 'team' ? 'team' : 'individual';
    $$('#stMode button').forEach(b => b.onclick = () => { mode = b.dataset.m; $$('#stMode button').forEach(x => x.classList.toggle('on', x === b)); $('#stTeams').hidden = mode !== 'team'; });
    $('#stForm').onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); act($('#stSave'), async () => {
      const patch = { title: f.get('title').trim(), category: f.get('category'), mode, desc: f.get('desc'), rules: f.get('rules'), teams: { A: f.get('teamA').trim() || 'A팀', B: f.get('teamB').trim() || 'B팀' } };
      const r = await data.updateStream(s.id, patch); S.stream = { ...S.stream, ...(r || patch) }; paintPill();
      const o = $('#stSel option[value="' + CSS.escape(s.id) + '"]'); if (o) o.textContent = `${S.stream.title} · ${(ST[S.stream.status] || [''])[0]}`; toast('설정을 저장했습니다', 'ok'); }); };
    const cb = $('#stClone'); if (data.mode === 'server') { cb.disabled = true; cb.title = '서버 모드 미지원'; }
    cb.onclick = async () => { if (!await confirmBox({ title: '방송 설정 복제', text: '이 방송의 출연자·규칙·미션을 복사한 새 방송(예정)을 만듭니다.', ok: '복제' })) return; act(cb, async () => { const n = await data.cloneStream(s.id); toast('복제했습니다', 'ok'); router.go(`studio/${n.id}/setup`); }); };
    $('#stNew2').onclick = openCreate;
  }

  // ---------- 3. 출연자 ----------
  function performers() {
    const s = S.stream, list = [...(s.performers || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), team = s.mode === 'team';
    body.innerHTML = `<div class="sec"><h2>출연자 <span class="dim">${list.length}</span></h2><span class="sub">삭제 대신 비활성화 — 후원 기록이 보존됩니다</span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>순서</th><th>출연자</th><th>이모지</th>${team ? '<th>팀</th>' : ''}<th>소개</th><th class="r">이번 라운드</th><th class="r">누적</th><th class="c">상태</th></tr></thead><tbody>
      ${list.map((p, i) => `<tr data-pid="${esc(p.id)}" style="${p.active === false ? 'opacity:.5' : ''}"><td><span class="ord"><button class="btn icon sm ghost" data-mv="-1" ${i === 0 ? 'disabled' : ''} aria-label="위로">${icon.chevron.replace('<svg', '<svg style="transform:rotate(-90deg)"')}</button><button class="btn icon sm ghost" data-mv="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="아래로">${icon.chevron.replace('<svg', '<svg style="transform:rotate(90deg)"')}</button></span></td>
        <td><span class="row" style="flex-wrap:nowrap">${avatar(p, 'sm')}<input data-f="name" value="${esc(p.name)}" maxlength="20" style="min-width:110px"></span></td>
        <td><select data-f="emoji" style="min-width:70px">${opt(EMOJIS.includes(p.emoji) ? EMOJIS : [p.emoji, ...EMOJIS], p.emoji)}</select></td>
        ${team ? `<td><select data-f="team"><option value="A" ${p.team === 'A' ? 'selected' : ''}>${esc(teamName(s, 'A'))}</option><option value="B" ${p.team === 'B' ? 'selected' : ''}>${esc(teamName(s, 'B'))}</option></select></td>` : ''}
        <td><input data-f="bio" value="${esc(p.bio || '')}" maxlength="60" placeholder="한 줄 소개" style="min-width:160px"></td>
        <td class="r num">${fmt.num(p.roundTotal)}</td><td class="r num">${fmt.num(p.total)}</td>
        <td class="c"><button class="btn sm ${p.active === false ? 'primary' : 'ghost'}" data-act>${p.active === false ? '활성화' : '비활성화'}</button></td></tr>`).join('')}
      ${!list.length ? `<tr><td colspan="8" class="dim c">출연자가 없습니다 — 아래에서 추가하세요</td></tr>` : ''}</tbody></table></div>
    <form id="pfAdd" class="card pad" style="margin-top:16px"><div class="row" style="align-items:end"><label class="field" style="flex:1;min-width:160px"><span>이름</span><input name="name" required maxlength="20" placeholder="새 출연자"></label>
      <label class="field"><span>이모지</span><select name="emoji">${opt(EMOJIS, '🎤')}</select></label>${team ? `<label class="field"><span>팀</span><select name="team"><option value="A">${esc(teamName(s, 'A'))}</option><option value="B">${esc(teamName(s, 'B'))}</option></select></label>` : ''}
      <button class="btn primary" id="pfAddGo">${icon.plus} 추가</button></div></form>`;
    $$('tr[data-pid]', body).forEach(tr => {
      const pid = tr.dataset.pid, p = list.find(x => x.id === pid);
      $$('[data-f]', tr).forEach(inp => inp.onchange = async () => { const k = inp.dataset.f, v = inp.value.trim(); if (k === 'name' && !v) { inp.value = p.name; return; } try { await data.savePerformer(s.id, { id: pid, name: k === 'name' ? v : p.name, emoji: k === 'emoji' ? v : p.emoji, team: k === 'team' ? v : p.team, active: p.active !== false, bio: k === 'bio' ? v : p.bio, [k]: v }); p[k] = v; toast('저장했습니다', 'ok'); } catch (e) { inp.value = p[k] || ''; fail(e); if (e.code === 'NOT_SUPPORTED') inp.disabled = true; } });
      $$('[data-mv]', tr).forEach(b => b.onclick = () => act(b, async () => { const ids = list.map(x => x.id), i = ids.indexOf(pid), j = i + Number(b.dataset.mv); [ids[i], ids[j]] = [ids[j], ids[i]]; await data.reorderPerformers(s.id, ids); if (data.mode === 'server') { list.forEach(x => x.sort = ids.indexOf(x.id)); renderTab(); } }));
      const ab = $('[data-act]', tr); ab.onclick = () => act(ab, async () => { const on = p.active === false; await data.savePerformer(s.id, { id: pid, name: p.name, emoji: p.emoji, team: p.team, active: on, bio: p.bio }); p.active = on; toast(on ? '활성화했습니다' : '비활성화했습니다 — 순위에서 숨겨지고 기록은 유지됩니다', 'ok'); if (data.mode === 'server') renderTab(); });
    });
    $('#pfAdd').onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); act($('#pfAddGo'), async () => { await data.savePerformer(s.id, { name: f.get('name').trim(), emoji: f.get('emoji'), team: team ? f.get('team') : null }); toast('출연자를 추가했습니다', 'ok'); if (data.mode === 'server') { S.stream = await data.stream(s.id); renderTab(); } }); };
  }

  // ---------- 4. 라운드 ----------
  async function rounds() {
    const s = S.stream, r = s.round || { no: 0, status: 'idle' }, active = ['running', 'paused'].includes(r.status);
    body.innerHTML = `<div class="card pad stack">
      <div class="row between"><div class="row"><h2 style="font-size:var(--fs-lg)">라운드 ${r.no || '—'}</h2>${r.title ? `<span class="muted">${esc(r.title)}</span>` : ''}${pill(RS, r.status)}</div><div class="st-timer num" data-rt>${timeText(r)}</div></div>
      ${!active ? `<div class="form two" style="display:grid"><label class="field"><span>다음 라운드 제목</span><input id="rdTitle" maxlength="40" placeholder="예: 댄스 곡 대결"></label><label class="field"><span>제한 시간 (분) <span class="hint">0 = 무제한</span></span><input id="rdMin" type="number" min="0" max="180" value="10"></label></div>` : ''}
      ${roundBtns(r)}
      <div class="note">일시정지 중에는 후원이 접수되지 않습니다 · 마감 후 후원은 누적에만 반영 · 동점은 먼저 도달한 쪽이 상위</div></div>
    <div class="sec"><h2>이번 라운드 순위</h2><span class="sub">실시간 집계</span></div>${rankTable(s.performers, 'roundTotal', s)}
    <div class="sec"><h2>라운드 기록</h2></div><div id="rdHist"><div class="skeleton" style="height:80px"></div></div>`;
    bindRound(body);
    let hist = []; try { hist = await data.rounds(s.id); } catch (e) { fail(e); }
    const h = $('#rdHist'); if (!h) return;
    const nameOf = id => (s.performers.find(p => p.id === id) || {}).name || id;
    h.innerHTML = hist.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>라운드</th><th>제목</th><th>시작</th><th>종료</th><th>우승</th><th class="r">합계</th></tr></thead><tbody>
      ${hist.map(x => `<tr><td class="num">${x.no}</td><td>${esc(x.title || '—')}</td><td class="num">${fmt.time(x.startedAt)}</td><td class="num">${x.endedAt ? fmt.time(x.endedAt) : '<span class="pill ok">진행 중</span>'}</td><td>${x.winnerName ? '👑 ' + esc(x.winnerName) : '—'}</td><td class="r num">${fmt.num(x.total)}</td></tr>
      ${x.results?.length ? `<tr><td colspan="6" style="padding-top:0"><details class="st-x"><summary>결과 ${x.results.length}명 보기</summary><div class="row" style="margin-top:6px">${x.results.map(([pid, v], i) => `<span class="tag">${i + 1}. ${esc(nameOf(pid))} <b class="num">${fmt.num(v)}</b></span>`).join('')}</div></details></td></tr>` : ''}`).join('')}</tbody></table></div>` : '<div class="empty"><b>아직 라운드 기록이 없습니다</b></div>';
  }

  // ---------- 5. 미션 ----------
  function missions() {
    const s = S.stream, ms = [...(s.missions || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), team = s.mode === 'team';
    const targetOf = m => m.performerId ? (s.performers.find(p => p.id === m.performerId) || {}).name || '출연자' : m.team ? teamName(s, m.team) : '전체';
    body.innerHTML = `<form id="msAdd" class="card pad form"><div class="two"><label class="field"><span>대상</span><select name="target"><option value="">전체</option>${team ? `<option value="team:A">${esc(teamName(s, 'A'))}</option><option value="team:B">${esc(teamName(s, 'B'))}</option>` : ''}${s.performers.filter(p => p.active !== false).map(p => `<option value="p:${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field"><span>종류</span><select name="kind"><option value="single">한 번에 N스타 이상</option><option value="round">이번 라운드 누적 N스타</option></select></label></div>
      <div class="two"><label class="field"><span>N (스타)</span><input name="threshold" type="number" min="1" step="1" value="1000" required></label><label class="field"><span>미션 내용</span><input name="title" required maxlength="80" placeholder="예: 즉석 댄스"></label></div>
      <button class="btn primary" id="msAddGo" style="justify-self:start">${icon.plus} 미션 추가</button></form>
    <div class="sec"><h2>미션 <span class="dim">${ms.filter(m => m.done).length}/${ms.length}</span></h2><span class="sub">달성 시 시청자 화면·오버레이에 배너가 뜹니다</span></div>
    <div class="panel">${ms.length ? ms.map(m => { const pr = missionProgress(m, s.performers); return `<div class="st-miss" data-mid="${esc(m.id)}"><div class="row between"><div class="row"><span class="pill violet">${esc(targetOf(m))}</span><b>${esc(m.title)}</b><span class="dim" style="font-size:var(--fs-sm)">${m.kind === 'round' ? '라운드 누적' : '한 번에'} ${fmt.star(m.threshold)}</span></div>
      <div class="row">${m.done ? `<span class="pill ok">달성</span><span class="dim" style="font-size:var(--fs-xs)">${m.doneBy ? esc(m.doneBy) + ' · ' : ''}${m.doneAt ? fmt.time(m.doneAt) : ''}</span>` : '<span class="pill">대기</span>'}<button class="btn sm ghost" data-reset ${m.done ? '' : 'disabled'}>${icon.refresh} 다시</button><button class="btn sm ghost" data-del>${icon.x} 삭제</button></div></div>
      <div class="progress ${m.done ? 'gold' : ''}"><i style="width:${Math.round((m.done ? 1 : pr.ratio) * 100)}%"></i></div>${m.kind === 'round' && !m.done ? `<div class="dim num" style="font-size:var(--fs-xs)">${fmt.num(pr.cur)} / ${fmt.num(pr.max)}</div>` : ''}</div>`; }).join('') : '<div class="empty"><b>미션이 없습니다</b><span>위에서 첫 미션을 추가하세요</span></div>'}</div>`;
    $('#msAdd').onsubmit = e => { e.preventDefault(); const f = new FormData(e.target), t = String(f.get('target') || ''); act($('#msAddGo'), async () => { await data.addMission(s.id, { performerId: t.startsWith('p:') ? t.slice(2) : null, team: t.startsWith('team:') ? t.slice(5) : null, title: f.get('title').trim(), kind: f.get('kind'), threshold: Number(f.get('threshold')) }); toast('미션을 추가했습니다', 'ok'); e.target.reset(); }); };
    $$('[data-mid]', body).forEach(row => {
      const id = row.dataset.mid;
      $('[data-reset]', row).onclick = e => act(e.currentTarget, async () => { await data.resetMission(id); toast('미션을 초기화했습니다', 'ok'); });
      $('[data-del]', row).onclick = async e => { const b = e.currentTarget; if (!await confirmBox({ title: '미션 삭제', text: '이 미션을 삭제합니다.', ok: '삭제', danger: true })) return; act(b, async () => { await data.removeMission(id); toast('삭제했습니다', 'ok'); }); };
    });
  }

  // ---------- 6. OBS 오버레이 ----------
  function obs() {
    const s = S.stream, base = location.origin + location.pathname.replace(/[^/]*$/, '') + 'overlay.html';
    const o = { scale: 1, pos: 'tl', theme: 'dark', preset: 'portrait', spacing: 'normal', fx: false };
    const seg = (k, items) => `<div class="seg" data-seg="${k}">${items.map(([v, n]) => `<button type="button" data-v="${v}" class="${o[k] === v ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    body.innerHTML = `<div class="grid two">
      <div class="stack"><div class="card pad form">
        <label class="field"><span>크기 <span class="hint num" id="obScaleV">1.0×</span></span><input type="range" id="obScale" min="0.6" max="3" step="0.1" value="1"></label>
        <div class="field"><span>위치</span>${seg('pos', [['tl', '좌상'], ['tr', '우상'], ['bl', '좌하'], ['br', '우하']])}</div>
        <div class="field"><span>테마</span>${seg('theme', [['dark', '다크'], ['light', '라이트'], ['minimal', '미니멀']])}</div>
        <div class="field"><span>캔버스 프리셋</span>${seg('preset', [['portrait', '세로 1080×1920'], ['landscape', '가로 1920×1080']])}</div>
        <div class="field"><span>행 간격</span>${seg('spacing', [['compact', '촘촘'], ['normal', '보통']])}</div>
        <label class="check"><input type="checkbox" id="obFx"> 효과 줄이기 (저사양 PC)</label></div>
        <div class="card pad stack"><div class="eyebrow">브라우저 소스 URL</div><div class="st-url" id="obUrl"></div><div class="row"><button class="btn primary" id="obCopy">${icon.copy} URL 복사</button><a class="btn ghost" id="obOpen" target="_blank" rel="noopener">${icon.external} 새 창에서 열기</a></div>
        <div class="note">OBS → 소스 추가 → <b>브라우저</b> → URL 붙여넣기 → 너비·높이 <b id="obWH">1080 × 1920</b> → "소스가 보이지 않을 때 종료" 해제. 배경은 투명합니다.</div>
        ${data.mode === 'demo' ? '<div class="note warn">시연 모드 — 오버레이는 시연 데이터를 읽습니다. 실제 송출(RTMP/WHIP)은 서버 연동 모드에서만 가능합니다.</div>' : rtmpInfo(s)}</div></div>
      <div class="stack st-prevwrap"><div class="sec" style="margin:0"><h2>미리보기</h2><span class="sub">설정 변경 시 자동 갱신</span></div><div class="st-prev p" id="obPrev"><iframe title="오버레이 미리보기" loading="lazy"></iframe></div></div></div>`;
    const url = () => { const q = new URLSearchParams({ stream: s.id, scale: String(o.scale), pos: o.pos, theme: o.theme, spacing: o.spacing }); if (o.fx) q.set('fx', 'low'); if (data.mode === 'demo') q.set('mode', 'demo'); return base + '?' + q.toString(); };
    const frame = $('#obPrev iframe');
    const paintUrl = () => { const u = url(); $('#obUrl').textContent = u; $('#obOpen').href = u; $('#obWH').textContent = o.preset === 'portrait' ? '1080 × 1920' : '1920 × 1080'; $('#obPrev').className = 'st-prev ' + (o.preset === 'portrait' ? 'p' : 'l'); };
    const reload = debounce(() => { frame.src = url() + '&bg=1'; }, 500);
    const upd = () => { paintUrl(); reload(); };
    $$('[data-seg]', body).forEach(sg => $$('button', sg).forEach(b => b.onclick = () => { o[sg.dataset.seg] = b.dataset.v; $$('button', sg).forEach(x => x.classList.toggle('on', x === b)); upd(); }));
    $('#obScale').oninput = e => { o.scale = Math.round(Number(e.target.value) * 10) / 10; $('#obScaleV').textContent = o.scale.toFixed(1) + '×'; upd(); };
    $('#obFx').onchange = e => { o.fx = e.target.checked; upd(); };
    $('#obCopy').onclick = () => copyText(url());
    paintUrl(); frame.src = url();
  }
  function rtmpInfo(s) {
    let st = {}, pass = ''; try { st = data.settings() || {}; pass = data.publishPass() || ''; } catch (e) {}
    const ip = st.server_ip || '서버IP', tun = (st.tunnel || '').replace(/\/$/, '');
    return `<div class="card pad stack"><div class="eyebrow">송출 정보 (서버 연동)</div><dl class="kv">
      <dt>OBS 서버</dt><dd><code>rtmp://${esc(ip)}:1935/live</code></dd><dt>스트림 키</dt><dd><code>${esc(s.id)}?user=presence&amp;pass=${pass ? esc(pass) : '(비밀번호 미등록)'}</code></dd>
      <dt>폰 (Larix)</dt><dd><code>rtmp://${esc(ip)}:1935/live/${esc(s.id)}</code> · 아이디 presence</dd>
      ${st.whip_tunnel ? `<dt>WHIP</dt><dd><code>${esc(st.whip_tunnel.replace(/\/$/, ''))}/live/${esc(s.id)}/whip</code></dd>` : ''}
      <dt>재생 주소</dt><dd>${s.playUrl ? `<code>${esc(s.playUrl)}</code>` : tun ? `<code>${esc(tun)}/live/${esc(s.id)}/index.m3u8</code>` : '<span class="dim">터널 미등록</span>'}</dd></dl>
      <div class="note">권장 출력 1280×720 · 30fps · 2500~3500 kbps · 키프레임 2초. 비밀번호는 외부에 공유하지 마세요.</div></div>`;
  }

  // ---------- 7. 결과 ----------
  async function results() {
    const s = S.stream, r = s.round || { status: 'idle' }, ready = r.status === 'ended' || ['ended', 'stopped'].includes(s.status);
    body.innerHTML = `${ready ? '' : '<div class="note warn" style="margin-bottom:16px">라운드 또는 방송이 종료되면 최종 결과가 확정됩니다. 아래는 현재까지의 집계입니다.</div>'}
      <div class="sec"><h2>최종 순위 <span class="dim">누적</span></h2><a class="btn sm primary" href="#/settle/${esc(s.id)}">${icon.receipt} 정산 명세 보기</a></div>${rankTable(s.performers, 'total', s)}
      ${r.no ? `<div class="sec"><h2>라운드 ${r.no} 순위</h2><span class="sub">${(RS[r.status] || [''])[0]}</span></div>${rankTable(s.performers, 'roundTotal', s)}` : ''}
      <div class="sec"><h2>라운드 우승 타임라인</h2></div><div id="rsTl" class="card pad"><div class="skeleton" style="height:60px"></div></div>
      <div class="note" style="margin-top:16px"><b>결과 보관</b> — 라운드별 순위·합계는 라운드 기록에 자동 보관되며, 정산 명세는 후원 원장을 기준으로 계산됩니다.</div>`;
    let hist = []; try { hist = await data.rounds(s.id); } catch (e) { fail(e); }
    const tl = $('#rsTl'); if (!tl) return;
    tl.innerHTML = hist.length ? `<div class="timeline">${hist.slice().sort((a, b) => a.no - b.no).map(x => `<div class="it"><div class="t num">${fmt.time(x.startedAt)}</div><div><b>라운드 ${x.no}</b>${x.title ? ' · ' + esc(x.title) : ''} — ${x.winnerName ? `👑 <span class="gold">${esc(x.winnerName)}</span>` : x.endedAt ? '후원 없음' : '<span class="pill ok">진행 중</span>'} <span class="dim num">${fmt.num(x.total)} 스타</span></div></div>`).join('')}</div>` : '<div class="dim">라운드 기록이 없습니다</div>';
  }

  await load(first.id);
}
