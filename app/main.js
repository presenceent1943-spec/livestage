/* LIVE STAGE v2 — 앱 셸: 헤더 · 내비 · 모드 표시 · 라우팅 · 화면 생명주기 */
import { $, $$, esc, icon, router, bus, toast, modal, confirmBox, makeCleanup, storage, CONFIG, fmt } from './core.js';
import { data } from './data.js';
import * as tour from './tour.js';

const VIEWS = {
  home: () => import('./views/home.js'),
  live: () => import('./views/live.js'),
  studio: () => import('./views/studio.js'),
  settle: () => import('./views/settle.js'),
  admin: () => import('./views/admin.js'),
  team: () => import('./views/profile.js'),
  performer: () => import('./views/profile.js'),
  me: () => import('./views/profile.js'),
};
const NAV = [['home', '홈', icon.home], ['live', '라이브', icon.live], ['studio', '스튜디오', icon.studio], ['settle', '정산', icon.receipt], ['admin', '관리자', icon.admin]];

let cleanup = makeCleanup();
const app = $('#app');

function renderHeader() {
  const r = router.parse(); const me = data.me();
  const roleName = { viewer: '시청자', host: '호스트', moderator: '모더레이터', admin: '관리자' };
  $('#header').innerHTML = `<div class="in">
    <a class="brand" href="#/home" aria-label="LIVE STAGE 홈"><span class="dot"></span>LIVE STAGE<small>PRESENCE</small></a>
    <nav class="nav" aria-label="주요 메뉴">${NAV.map(([k, n]) => `<a href="#/${k}" class="${r.name === k ? 'on' : ''}">${n}</a>`).join('')}</nav>
    <div class="header-right">
      <button class="mode-badge ${data.mode === 'server' ? (data.status.ok ? 'server' : 'offline') : 'demo'}" id="modeBtn" title="데이터 모드"><i></i>${data.mode === 'server' ? '서버 연동' : '시연 모드'}</button>
      ${me ? `<button class="btn sm ghost" id="meBtn">${icon.user}<span class="hide-sm">${esc(me.nick)} · ${roleName[me.role] || me.role}</span></button>` : `<button class="btn sm primary" id="loginBtn">${data.mode === 'demo' ? '역할 선택' : '로그인'}</button>`}
    </div></div>`;
  $('#bottomNav').innerHTML = NAV.map(([k, n, ic]) => `<a href="#/${k}" class="${r.name === k ? 'on' : ''}">${ic}<span>${n}</span></a>`).join('');
  $('#modeBtn').onclick = openModeDialog;
  const lb = $('#loginBtn'); if (lb) lb.onclick = () => data.mode === 'demo' ? openRoleDialog() : openAuthDialog();
  const mb = $('#meBtn'); if (mb) mb.onclick = () => router.go('me');
}

function openModeDialog() {
  const srvMsg = data.serverError ? `<div class="note bad"><b>서버 연동 실패:</b> ${esc(data.serverError)}<br>시연 모드로 동작 중입니다.</div>` : '';
  const m = modal({ title: '데이터 모드', body: `
    ${srvMsg}
    <div class="stack">
      <label class="card pad" style="display:grid;grid-template-columns:auto 1fr;gap:12px;cursor:pointer"><input type="radio" name="md" value="demo" ${data.mode === 'demo' ? 'checked' : ''}><div><b>시연 모드</b><div class="muted" style="font-size:12.5px;margin-top:2px">가입 없이 바로 체험. 가상 포인트·가상 방송팀·가상 채팅. 서버 데이터에 영향 없음. 역할 전환 가능.</div></div></label>
      <label class="card pad" style="display:grid;grid-template-columns:auto 1fr;gap:12px;cursor:pointer"><input type="radio" name="md" value="server" ${data.mode === 'server' ? 'checked' : ''}><div><b>서버 연동 모드</b><div class="muted" style="font-size:12.5px;margin-top:2px">Supabase 계정으로 로그인. 실제 저장·실시간 채팅·선물. 권한은 서버가 판정합니다.</div></div></label>
      ${data.mode === 'demo' ? `<label class="check"><input type="checkbox" id="simChk" ${data.sim ? 'checked' : ''}> 가상 시청자 채팅 표시 (닉네임에 "시연·" 표시)</label>
      <button class="btn danger sm" id="resetDemo" style="justify-self:start">시연 데이터 초기화</button>` : ''}
    </div>`, footer: `<button class="btn ghost" data-close>닫기</button><button class="btn primary" id="mdOk">적용</button>` });
  $('#mdOk').onclick = async () => { const v = $('input[name=md]:checked').value; m.close(); if (v !== data.mode) { toast(v === 'server' ? '서버에 연결하는 중…' : '시연 모드로 전환'); await data.setMode(v); if (v === 'server' && data.mode !== 'server') toast('서버 연결 실패 — 시연 모드 유지: ' + (data.serverError || ''), 'bad', 5000); renderHeader(); route(); } };
  const sc = $('#simChk'); if (sc) sc.onchange = () => data.setSim(sc.checked);
  const rd = $('#resetDemo'); if (rd) rd.onclick = async () => { if (await confirmBox({ title: '시연 데이터 초기화', text: '가상 방송·후원·라운드·지갑이 처음 상태로 돌아갑니다. 서버 데이터는 건드리지 않습니다.', ok: '초기화', danger: true })) { await data.reset(); toast('시연 데이터를 초기화했습니다', 'ok'); renderHeader(); route(); } };
}
export function openRoleDialog() {
  const roles = [['viewer', '시청자', '방송 보기 · 채팅 · 가상 후원'], ['host', '호스트 (PRESENCE)', '스튜디오 · 라운드 · 미션 · 정산 보기'], ['admin', '관리자', '신고 처리 · 제재 · 방송 중단 · 감사 기록']];
  const cur = data.me()?.role || 'viewer';
  const m = modal({ title: '시연 역할 선택', body: `<p class="muted" style="font-size:12.5px">시연 모드에서만 역할을 바꿀 수 있습니다. 서버 연동 모드에서는 계정 권한을 서버가 판정합니다.</p><div class="stack">${roles.map(([k, n, d]) => `<button class="card pad hover" data-role="${k}" style="text-align:left;display:grid;gap:2px;${cur === k ? 'border-color:var(--gold-line)' : ''}"><b>${n}</b><span class="muted" style="font-size:12.5px">${d}</span></button>`).join('')}</div>` });
  $$('[data-role]', m.el).forEach(b => b.onclick = async () => { await data.setRole(b.dataset.role); m.close(); toast(`역할: ${b.querySelector('b').textContent}`, 'ok'); renderHeader(); route(); });
}
export function openAuthDialog(mode = 'login') {
  const m = modal({ title: mode === 'login' ? '로그인' : '회원가입', body: `<form id="authForm" class="form">
    <label class="field"><span>이메일</span><input type="email" name="email" required autocomplete="email" placeholder="you@example.com"></label>
    ${mode === 'signup' ? '<label class="field"><span>닉네임</span><input name="nick" required maxlength="20" placeholder="방송에서 보일 이름"></label>' : ''}
    <label class="field"><span>비밀번호</span><input type="password" name="password" required minlength="6" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>
    <div id="authErr" class="note bad" hidden></div>
    <button class="btn primary block" id="authGo">${mode === 'login' ? '로그인' : '가입하기'}</button>
    <button type="button" class="btn ghost block" id="authSwap">${mode === 'login' ? '계정이 없나요? 회원가입' : '이미 계정이 있나요? 로그인'}</button></form>` });
  $('#authSwap').onclick = () => { m.close(); openAuthDialog(mode === 'login' ? 'signup' : 'login'); };
  $('#authForm').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); const b = $('#authGo'); b.classList.add('loading'); try { if (mode === 'login') await data.login(f.get('email'), f.get('password')); else await data.signup(f.get('email'), f.get('password'), f.get('nick')); m.close(); toast('환영합니다', 'ok'); renderHeader(); route(); } catch (err) { const el = $('#authErr'); el.hidden = false; el.textContent = err.message; } finally { b.classList.remove('loading'); } };
}

async function route() {
  const r = router.parse();
  cleanup.run(); cleanup = makeCleanup();
  window.scrollTo({ top: 0 });
  renderHeader();
  const loader = VIEWS[r.name] || VIEWS.home;
  app.innerHTML = '<div class="page"><div class="skeleton" style="height:180px;margin-bottom:16px"></div><div class="grid cards"><div class="skeleton" style="height:200px"></div><div class="skeleton" style="height:200px"></div><div class="skeleton" style="height:200px"></div></div></div>';
  try {
    const mod = await loader();
    await mod.default({ el: app, route: r, cleanup, data, openAuth: openAuthDialog, openRole: openRoleDialog, renderHeader });
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="page narrow"><div class="empty"><div class="ic">${icon.alert}</div><b>화면을 불러오지 못했습니다</b><span class="muted">${esc(e.message || e)}</span><div class="row"><button class="btn" onclick="location.reload()">새로고침</button><a class="btn ghost" href="#/home">홈으로</a></div></div></div>`;
  }
}

async function boot() {
  $('#header').innerHTML = '<div class="in"><span class="brand"><span class="dot"></span>LIVE STAGE</span></div>';
  await data.init();
  if (data.serverError) toast('서버 연동 실패 — 시연 모드로 시작합니다', 'warn', 4000);
  bus.on('auth', renderHeader);
  router.on(route);
  route();
  if (router.parse().q.tour === '1') setTimeout(() => tour.start({ reset: false }), 800);
  // 서비스 워커: 새 버전이 있으면 안내
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').then(reg => { reg.addEventListener('updatefound', () => { const nw = reg.installing; nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) { const t = toast('새 버전이 있습니다 — 새로고침하면 적용됩니다', 'ok', 8000); t.onclick = () => location.reload(); } }); }); }).catch(() => {});
  }
  window.addEventListener('online', () => toast('인터넷 연결이 복구되었습니다', 'ok'));
  window.addEventListener('offline', () => toast('오프라인입니다 — 저장된 화면만 볼 수 있습니다', 'warn', 5000));
}
boot();
