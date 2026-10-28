/* LIVE STAGE v2 — 홈: 메인 라이브 · 검색/필터 · 지금 라이브 · 예정 · 방송팀 · 지난 방송 */
import { $, $$, esc, fmt, icon, avatar, router, bus, toast, storage, debounce, setLoading } from '../core.js';
import { stageArt } from '../demo-data.js';

const CATS = ['전체', '합동방송', '노래', '토크', '댄스', '먹방', 'ASMR', '게임'];
const SEGS = [['live', '라이브'], ['scheduled', '예정'], ['all', '전체']];
const REMIND_KEY = 'livestage-v2-remind';

/* 화면 전용 스타일 — 한 번만 주입, tokens.css 토큰만 사용 */
function ensureStyle() {
  if ($('#home-css')) return;
  const s = document.createElement('style'); s.id = 'home-css';
  s.textContent = `
  .pill > svg, .hero-info .meta svg, .lcard svg { width: 13px; height: 13px; flex: none; }
  #heroWrap:not(:empty) { margin-bottom: var(--sp-6); }
  .scard .t, .hero-info .t, .lcard b { word-break: keep-all; overflow-wrap: anywhere; }
  .scard .m { flex-wrap: wrap; } .scard .m > span { white-space: nowrap; }
  .lcard .row.between { flex-wrap: nowrap; }
  .home-top { display: flex; gap: var(--sp-3); align-items: center; flex-wrap: wrap; margin-bottom: var(--sp-4); }
  .home-top .search { flex: 1 1 260px; }
  .home-top .seg { flex: none; }
  .home-top .chips { flex: 1 1 100%; }
  .hero-info { display: grid; gap: var(--sp-4); align-content: center; }
  .hero-info .meta { display: flex; gap: 6px 10px; flex-wrap: wrap; align-items: center; color: var(--fg-3); font-size: var(--fs-sm); }
  .hero-info .meta a:hover { color: var(--fg); }
  .perf-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .perf-chip { display: inline-flex; align-items: center; gap: 8px; padding: 4px 6px 4px 4px; border-radius: var(--r-full); background: var(--bg-2); border: 1px solid var(--line); font-size: var(--fs-sm); font-weight: 600; }
  .perf-chip .avatar { width: 28px; height: 28px; font-size: 12px; }
  .perf-chip .btn.sm { height: 24px; padding: 0 8px; font-size: var(--fs-xs); border-radius: var(--r-full); }
  .perf-chip .btn.sm svg { width: 12px; height: 12px; }
  .btn.following { border-color: var(--gold-line); background: var(--gold-dim); color: var(--gold-2); }
  .hero-cta { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
  .lcard { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--sp-3); align-items: start; }
  .lcard .bio { color: var(--fg-2); font-size: var(--fs-sm); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .lcard .ft { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--sp-2); margin-top: var(--sp-2); font-size: var(--fs-xs); color: var(--fg-3); }
  .scard .thumb.ended .art { opacity: .55; filter: saturate(.6); }
  .scard .m .sp { color: var(--fg-4); }
  .demo-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); margin-bottom: var(--sp-4); }
  .sk-card { display: grid; gap: 10px; } .sk-card .skeleton:first-child { aspect-ratio: 16/10; border-radius: var(--r-lg); }
  @media (max-width: 760px) { .demo-bar { flex-direction: column; align-items: stretch; } .demo-bar .btn { width: 100%; } }`;
  document.head.appendChild(s);
}

/* ---------- 작은 조각 ---------- */
const statusPill = s => s.status === 'live' ? `<span class="pill live">LIVE</span>` : s.status === 'scheduled' ? `<span class="pill">${icon.calendar} ${esc(fmt.until(s.startedAt))}</span>` : s.status === 'stopped' ? `<span class="pill bad">중단</span>` : `<span class="pill dark">종료</span>`;
const faces = s => `<span class="faces">${(s.performers || []).slice(0, 4).map(p => avatar(p)).join('')}</span>`;
const viewersPill = (s, demo) => s.status === 'live' && s.viewers != null ? `<span class="pill dark" title="${demo ? '시연 데이터' : '시청자'}">${icon.eye} ${fmt.compact(s.viewers)}</span>` : '';
const labelName = s => esc(s.label?.name || s.labelId);

function streamCard(s, demo) {
  const when = s.status === 'live' ? fmt.rel(s.startedAt) + ' 시작' : s.status === 'scheduled' ? fmt.dateTime(s.startedAt) : fmt.date(s.startedAt);
  return `<a class="scard" href="#/live/${esc(s.id)}" data-stream="${esc(s.id)}">
    <div class="thumb ${s.status === 'ended' || s.status === 'stopped' ? 'ended' : ''}"><div class="art">${stageArt(s)}</div>
      <div class="top">${statusPill(s)}${viewersPill(s, demo)}</div>
      <div class="bot">${faces(s)}<span class="tag">${esc(s.category || '')}</span></div></div>
    <div class="t">${esc(s.title)}</div>
    <div class="m"><span>${labelName(s)}</span><span class="sp">·</span><span>${esc(s.hostName || '')}</span><span class="sp">·</span><span class="num">${esc(when)}</span></div>
  </a>`;
}
function followBtn(kind, id, on, sm = true) {
  return `<button class="btn ${sm ? 'sm' : ''} ${on ? 'following' : 'outline'}" data-follow="${kind}:${esc(id)}" aria-pressed="${on}">${on ? icon.check : icon.star}<span>${on ? '팔로잉' : '팔로우'}</span></button>`;
}
const emptyBox = (title, sub, extra = '') => `<div class="empty"><div class="ic">${icon.search}</div><b>${esc(title)}</b><span>${esc(sub)}</span>${extra}</div>`;
const skGrid = n => `<div class="grid cards">${Array.from({ length: n }, () => `<div class="sk-card"><div class="skeleton"></div><div class="skeleton" style="height:16px;width:80%"></div><div class="skeleton" style="height:12px;width:50%"></div></div>`).join('')}</div>`;

/* ---------- 화면 ---------- */
export default async function render(ctx) {
  const { el, data, cleanup } = ctx;
  ensureStyle();
  const demo = data.mode === 'demo';
  const q0 = ctx.route.q || {};
  const state = { q: q0.q || '', cat: CATS.includes(q0.cat) ? q0.cat : '전체', f: SEGS.some(([k]) => k === q0.f) ? q0.f : 'all' };
  let streams = [], labels = [];
  let reminders = new Set(storage.get(REMIND_KEY, []));

  const syncUrl = () => { const p = new URLSearchParams(); if (state.q) p.set('q', state.q); if (state.cat !== '전체') p.set('cat', state.cat); if (state.f !== 'all') p.set('f', state.f); const qs = p.toString(); history.replaceState(null, '', '#/home' + (qs ? '?' + qs : '')); };

  /* 셸 */
  el.innerHTML = `<div class="page">
    ${demo ? `<div class="note gold demo-bar"><span>시연 모드 — 모든 방송·시청자·후원은 가상 데이터입니다</span><button class="btn primary sm" id="tourBtn">${icon.play} 3분 시연 시작</button></div>` : ''}
    <div id="heroWrap"></div>
    <div class="home-top">
      <div class="search">${icon.search}<input id="homeQ" type="search" placeholder="방송·호스트·출연자·방송팀 검색" value="${esc(state.q)}" aria-label="검색"></div>
      <div class="seg" id="homeSeg" role="group" aria-label="상태 필터">${SEGS.map(([k, n]) => `<button data-f="${k}" class="${state.f === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="chips" id="homeChips">${CATS.map(c => `<button class="chip ${state.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    </div>
    <div id="homeBody">${skGrid(3)}</div>
  </div>`;

  $('#tourBtn', el)?.addEventListener('click', () => { if (window.LiveStageTour?.start) window.LiveStageTour.start(); else router.go('live/d1'); });

  /* 데이터 */
  async function load() {
    try {
      [streams, labels] = await Promise.all([data.streams(), data.labels()]);
      streams = streams.map(s => ({ ...s, label: s.label || labels.find(l => l.id === s.labelId) }));
      paintAll();
    } catch (e) {
      console.error(e);
      $('#heroWrap', el).innerHTML = '';
      $('#homeBody', el).innerHTML = `<div class="empty"><div class="ic">${icon.alert}</div><b>방송 목록을 불러오지 못했습니다</b><span>${esc(e.message || e)}</span><button class="btn" id="retryBtn">${icon.refresh} 다시 시도</button></div>`;
      $('#retryBtn', el).onclick = () => { $('#homeBody', el).innerHTML = skGrid(3); load(); };
    }
  }

  const hero = () => streams.filter(s => s.status === 'live').sort((a, b) => (b.labelId === 'presence') - (a.labelId === 'presence') || (b.viewers || 0) - (a.viewers || 0))[0] || null;
  const filtering = () => !!state.q || state.cat !== '전체';
  function matches(s) {
    if (state.cat !== '전체' && s.category !== state.cat) return false;
    if (!state.q) return true;
    const q = state.q.toLowerCase();
    return [s.title, s.hostName, s.label?.name, s.category, ...(s.performers || []).map(p => p.name)].some(v => String(v || '').toLowerCase().includes(q));
  }

  /* 그리기 */
  function paintAll() { paintHero(); paintBody(); }

  function paintHero() {
    const wrap = $('#heroWrap', el); const h = hero();
    if (!h || filtering() || state.f === 'scheduled') { wrap.innerHTML = ''; return; }
    const fw = data.follows();
    wrap.innerHTML = `<section class="scard hero" aria-label="메인 라이브" data-hero="${esc(h.id)}">
      <a class="thumb" href="#/live/${esc(h.id)}"><div class="art">${stageArt(h, { w: 960, h: 540 })}</div>
        <div class="top"><span class="row" style="gap:6px"><span class="pill live">LIVE</span>${demo ? `<span class="pill dark">시연 데이터</span>` : ''}</span>${viewersPill(h, demo)}</div>
        <div class="bot">${faces(h)}<span class="tag">${esc(h.category || '')}</span></div></a>
      <div class="hero-info">
        <div class="stack" style="gap:8px">
          <span class="eyebrow">지금 가장 뜨거운 무대</span>
          <h1 class="t">${esc(h.title)}</h1>
          <div class="meta"><a href="#/team/${esc(h.labelId)}"><b>${labelName(h)}</b></a><span>·</span><span>${esc(h.category || '')}</span><span>·</span><span class="num">${esc(fmt.rel(h.startedAt))} 시작</span>${h.viewers != null ? `<span>·</span><span class="num">${icon.eye} ${fmt.num(h.viewers)}명 시청 중</span>` : ''}</div>
          ${h.desc ? `<p class="muted" style="font-size:var(--fs-sm)">${esc(h.desc)}</p>` : ''}
        </div>
        <div class="perf-row">${(h.performers || []).map(p => `<span class="perf-chip">${avatar(p)}<span>${esc(p.name)}</span>${followBtn('performer', p.id, fw.performers.includes(p.id))}</span>`).join('')}</div>
        <div class="hero-cta"><a class="btn primary lg" href="#/live/${esc(h.id)}">${icon.play} 입장하기</a><a class="btn lg outline" href="#/team/${esc(h.labelId)}">${icon.users} 방송팀 보기</a></div>
      </div></section>`;
  }

  function paintBody() {
    const body = $('#homeBody', el); const h = hero();
    const vis = streams.filter(matches);
    const live = vis.filter(s => s.status === 'live' && !(h && s.id === h.id && !filtering() && state.f !== 'scheduled'));
    const sched = vis.filter(s => s.status === 'scheduled').sort((a, b) => a.startedAt - b.startedAt);
    const ended = vis.filter(s => s.status === 'ended' || s.status === 'stopped').sort((a, b) => (b.endedAt || b.startedAt) - (a.endedAt || a.startedAt));
    const showLive = state.f !== 'scheduled', showSched = state.f !== 'live', showRest = state.f === 'all';
    const parts = [];
    if (showLive && live.length) parts.push(`<div class="sec"><h2>지금 라이브</h2><span class="sub num">${live.length}개 방송</span></div><div class="grid cards">${live.map(s => streamCard(s, demo)).join('')}</div>`);
    if (showSched && sched.length) parts.push(`<div class="sec"><h2>예정 방송</h2><span class="sub">알림을 켜두면 시작 전에 알려드립니다</span></div><div class="grid cards">${sched.map(s => `<div class="stack" style="gap:8px">${streamCard(s, demo)}<button class="btn sm ${reminders.has(s.id) ? 'following' : 'outline'}" data-remind="${esc(s.id)}" aria-pressed="${reminders.has(s.id)}">${icon.bell}<span>${reminders.has(s.id) ? '알림 설정됨' : '알림 받기'}</span></button></div>`).join('')}</div>`);
    if (showRest && !filtering()) parts.push(`<div class="sec"><h2>방송팀</h2><span class="sub">레이블을 팔로우하면 새 방송을 먼저 만납니다</span></div><div class="grid cards" id="labelGrid">${labels.map(labelCard).join('')}</div>`);
    if (showRest && ended.length) parts.push(`<div class="sec"><h2>지난 방송</h2><span class="sub">결과와 라운드 기록을 볼 수 있습니다</span></div><div class="grid cards">${ended.map(s => streamCard(s, demo)).join('')}</div>`);
    if (!parts.length) {
      const any = (showLive && live.length) || (showSched && sched.length) || (showRest && ended.length);
      parts.push(any ? '' : emptyBox(filtering() ? '검색 결과가 없습니다' : '표시할 방송이 없습니다', filtering() ? `"${state.q || state.cat}" 에 해당하는 방송을 찾지 못했습니다` : '조건을 바꿔 다시 찾아보세요', `<button class="btn sm" id="clearFilter">${icon.x} 필터 초기화</button>`));
    }
    body.innerHTML = parts.join('');
    $('#clearFilter', el)?.addEventListener('click', () => { state.q = ''; state.cat = '전체'; state.f = 'all'; $('#homeQ', el).value = ''; syncChips(); syncUrl(); paintAll(); });
  }

  function labelCard(l) {
    const on = data.follows().labels.includes(l.id);
    const liveN = streams.filter(s => s.labelId === l.id && s.status === 'live').length;
    return `<div class="card pad hover" data-label="${esc(l.id)}"><div class="lcard">
      <a href="#/team/${esc(l.id)}">${avatar({ name: l.name, hue: l.hue, useInitials: true }, 'lg')}</a>
      <div style="min-width:0"><div class="row between" style="gap:6px"><a href="#/team/${esc(l.id)}"><b>${esc(l.name)}</b></a>${liveN ? `<span class="pill live">LIVE ${liveN}</span>` : l.status === 'pending' ? `<span class="pill warn">승인 대기</span>` : ''}</div>
        <div class="bio">${esc(l.bio || '')}</div></div></div>
      <div class="ft"><span class="num">${l.followers != null ? `팔로워 ${fmt.compact(l.followers + (on && demo ? 1 : 0))}${demo ? ' <span class="dim">(시연)</span>' : ''}` : ''}${l.owner ? ` · ${esc(l.owner)}` : ''}</span>${followBtn('label', l.id, on)}</div></div>`;
  }

  /* 팔로우 버튼만 갱신 (전체 다시 그리지 않음) */
  function refreshFollows() {
    const fw = data.follows();
    $$('[data-follow]', el).forEach(b => {
      const [kind, id] = b.dataset.follow.split(':'); const on = (kind === 'label' ? fw.labels : fw.performers).includes(id);
      b.className = `btn sm ${on ? 'following' : 'outline'}`; b.setAttribute('aria-pressed', on); b.innerHTML = `${on ? icon.check : icon.star}<span>${on ? '팔로잉' : '팔로우'}</span>`;
    });
    $$('[data-label]', el).forEach(c => { const l = labels.find(x => x.id === c.dataset.label); if (l) c.outerHTML = labelCard(l); });
  }
  function syncChips() {
    $$('#homeChips .chip', el).forEach(c => c.classList.toggle('on', c.dataset.cat === state.cat));
    $$('#homeSeg button', el).forEach(b => b.classList.toggle('on', b.dataset.f === state.f));
  }

  /* 이벤트 (위임) */
  el.addEventListener('click', async e => {
    const fb = e.target.closest('[data-follow]');
    if (fb) {
      e.preventDefault(); const [kind, id] = fb.dataset.follow.split(':'); const on = fb.getAttribute('aria-pressed') !== 'true';
      setLoading(fb, true);
      try { await data.follow(kind, id, on); toast(on ? '팔로우했습니다' : '팔로우를 해제했습니다', on ? 'ok' : ''); }
      catch (err) { setLoading(fb, false); toast(err.message, 'bad'); if (err.code === 'AUTH') (data.mode === 'demo' ? ctx.openRole : ctx.openAuth)(); }
      return;
    }
    const rb = e.target.closest('[data-remind]');
    if (rb) {
      e.preventDefault(); const id = rb.dataset.remind; const on = !reminders.has(id);
      on ? reminders.add(id) : reminders.delete(id); storage.set(REMIND_KEY, [...reminders]);
      rb.className = `btn sm ${on ? 'following' : 'outline'}`; rb.setAttribute('aria-pressed', on); rb.innerHTML = `${icon.bell}<span>${on ? '알림 설정됨' : '알림 받기'}</span>`;
      const s = streams.find(x => x.id === id);
      toast(on ? `${fmt.until(s?.startedAt)} 시작 — 알림을 켰습니다${demo ? ' (시연: 브라우저에만 저장)' : ''}` : '알림을 껐습니다', on ? 'ok' : '');
      return;
    }
    const chip = e.target.closest('#homeChips .chip');
    if (chip) { state.cat = chip.dataset.cat; syncChips(); syncUrl(); paintAll(); return; }
    const seg = e.target.closest('#homeSeg button');
    if (seg) { state.f = seg.dataset.f; syncChips(); syncUrl(); paintAll(); }
  });
  const onSearch = debounce(() => { state.q = $('#homeQ', el).value.trim(); syncUrl(); paintAll(); }, 220);
  $('#homeQ', el).addEventListener('input', onSearch);

  /* 버스 */
  cleanup(bus.on('follows', refreshFollows));
  cleanup(bus.on('reset', () => { reminders = new Set(storage.get(REMIND_KEY, [])); load(); }));

  await load();
}
