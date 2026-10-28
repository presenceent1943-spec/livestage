/* LIVE STAGE v2 — 프로필: 방송팀(#/team/:id) · 출연자(#/performer/:id) · 내 정보(#/me) */
import { $, $$, esc, fmt, icon, avatar, router, bus, toast, modal, setLoading, csvCell, downloadText } from '../core.js';
import { STAR_PACKAGES, fanStats } from '../engine.js';
import { stageArt } from '../demo-data.js';

function ensureStyle() {
  if ($('#profile-css')) return;
  const s = document.createElement('style'); s.id = 'profile-css';
  s.textContent = `
  .pill > svg, .phead .sub svg, .breadcrumb svg, .note > svg, .bm svg, .fan-badge svg { width: 13px; height: 13px; flex: none; vertical-align: -2px; }
  .scard .t, .phead h1, .pcard b { word-break: keep-all; overflow-wrap: anywhere; }
  .scard .m { flex-wrap: wrap; } .scard .m > span { white-space: nowrap; }
  .phead { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--sp-4); align-items: center; padding: var(--sp-5); }
  .phead h1 { font-size: var(--fs-xl); letter-spacing: -.02em; }
  .phead .bio { color: var(--fg-2); font-size: var(--fs-sm); margin-top: 4px; line-height: 1.55; }
  .phead .sub { display: flex; gap: 6px 10px; flex-wrap: wrap; align-items: center; color: var(--fg-3); font-size: var(--fs-sm); margin-top: 6px; }
  .phead .sub a:hover { color: var(--fg); }
  .btn.following { border-color: var(--gold-line); background: var(--gold-dim); color: var(--gold-2); }
  .pcard { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); }
  .pcard b { display: block; } .pcard small { color: var(--fg-3); font-size: var(--fs-xs); }
  .pcard .tag { margin-left: auto; }
  .bm { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: var(--sp-3); align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--line); font-size: var(--fs-sm); }
  .bm:last-child { border-bottom: 0; } .bm .ts { font-variant-numeric: tabular-nums; color: var(--gold-2); font-weight: 700; } .bm small { color: var(--fg-3); }
  .pkg { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: var(--sp-3); text-align: left; width: 100%; }
  .pkg b { font-size: var(--fs-md); } .pkg small { color: var(--fg-3); display: block; }
  .wallet-v { font-size: var(--fs-3xl); font-weight: 800; letter-spacing: -.03em; color: var(--gold-2); line-height: 1.1; }
  .tab-body { margin-top: var(--sp-4); }
  .tab-body .tbl, #giftsBox .tbl { min-width: 640px; }
  .tab-body .tbl td, #giftsBox .tbl td { white-space: nowrap; }
  .tab-body .tbl td:first-child, #giftsBox .tbl td:nth-child(3) { white-space: normal; min-width: 200px; word-break: keep-all; }
  @media (max-width: 560px) { .phead { grid-template-columns: auto minmax(0, 1fr); } .phead > .acts { grid-column: 1 / -1; } }`;
  document.head.appendChild(s);
}

/* ---------- 공용 조각 ---------- */
const notFound = (what) => `<div class="page narrow"><div class="empty"><div class="ic">${icon.alert}</div><b>${esc(what)}을(를) 찾을 수 없습니다</b><span>주소가 잘못되었거나 삭제되었습니다</span><a class="btn" href="#/home">${icon.home} 홈으로</a></div></div>`;
const emptyBox = (b, s, ic = icon.info) => `<div class="empty"><div class="ic">${ic}</div><b>${esc(b)}</b>${s ? `<span>${esc(s)}</span>` : ''}</div>`;
const statusPill = s => s.status === 'live' ? `<span class="pill live">LIVE</span>` : s.status === 'scheduled' ? `<span class="pill">${icon.calendar} ${esc(fmt.until(s.startedAt))}</span>` : s.status === 'stopped' ? `<span class="pill bad">중단</span>` : `<span class="pill dark">종료</span>`;
const labelStatus = st => ({ active: '<span class="pill ok">운영 중</span>', pending: '<span class="pill warn">승인 대기</span>', suspended: '<span class="pill bad">정지</span>' }[st] || `<span class="pill">${esc(st || '')}</span>`);
const followBtn = (kind, id, on) => `<button class="btn ${on ? 'following' : 'outline'}" data-follow="${kind}:${esc(id)}" aria-pressed="${on}">${on ? icon.check : icon.star}<span>${on ? '팔로잉' : '팔로우'}</span></button>`;
const streamCard = s => `<a class="scard" href="#/live/${esc(s.id)}"><div class="thumb"><div class="art">${stageArt(s)}</div><div class="top">${statusPill(s)}${s.status === 'live' && s.viewers != null ? `<span class="pill dark">${icon.eye} ${fmt.compact(s.viewers)}</span>` : ''}</div><div class="bot"><span class="faces">${(s.performers || []).slice(0, 4).map(p => avatar(p)).join('')}</span><span class="tag">${esc(s.category || '')}</span></div></div><div class="t">${esc(s.title)}</div><div class="m"><span>${esc(s.hostName || '')}</span><span>·</span><span class="num">${esc(s.status === 'scheduled' ? fmt.dateTime(s.startedAt) : fmt.date(s.startedAt))}</span></div></a>`;
const grid = (list, empty) => list.length ? `<div class="grid cards">${list.map(streamCard).join('')}</div>` : emptyBox(empty, '', icon.film);
const hms = ms => { const t = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(t / 3600); return (h ? h + ':' : '') + String(Math.floor(t % 3600 / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
const demoNick = n => String(n || '').startsWith('시연·') ? `<span class="dim" title="시연 데이터">${esc(n)}</span>` : esc(n);

function tabs(ctx, el, list, cur, onPick) {
  const bar = $('.tabs', el);
  bar.innerHTML = list.map(([k, n]) => `<button data-tab="${k}" class="${cur === k ? 'on' : ''}" role="tab" aria-selected="${cur === k}">${n}</button>`).join('');
  bar.onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; $$('button', bar).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); const p = new URLSearchParams(location.hash.split('?')[1] || ''); p.set('tab', b.dataset.tab); history.replaceState(null, '', '#/' + ctx.route.path + '?' + p); onPick(b.dataset.tab); };
  onPick(cur);
}
function wireFollow(ctx, el, after) {
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-follow]'); if (!b) return;
    const [kind, id] = b.dataset.follow.split(':'); const on = b.getAttribute('aria-pressed') !== 'true';
    setLoading(b, true);
    try { await ctx.data.follow(kind, id, on); toast(on ? '팔로우했습니다' : '팔로우를 해제했습니다', on ? 'ok' : ''); }
    catch (err) { setLoading(b, false); toast(err.message, 'bad'); if (err.code === 'AUTH') (ctx.data.mode === 'demo' ? ctx.openRole : ctx.openAuth)(); }
  });
  const refresh = () => { const fw = ctx.data.follows(); $$('[data-follow]', el).forEach(b => { const [k, id] = b.dataset.follow.split(':'); const on = (k === 'label' ? fw.labels : fw.performers).includes(id); b.className = `btn ${b.classList.contains('sm') ? 'sm ' : ''}${on ? 'following' : 'outline'}`; b.setAttribute('aria-pressed', on); b.innerHTML = `${on ? icon.check : icon.star}<span>${on ? '팔로잉' : '팔로우'}</span>`; }); after && after(fw); };
  ctx.cleanup(bus.on('follows', refresh));
}

/* ======================================================================
   방송팀
   ====================================================================== */
async function renderTeam(ctx) {
  const { el, data } = ctx; const id = ctx.route.seg[1];
  const l = id && await data.label(id);
  if (!l) { el.innerHTML = notFound('방송팀'); return; }
  const demo = data.mode === 'demo'; const fw = data.follows();
  const streams = (l.streams || []).map(s => ({ ...s, label: l }));
  const live = streams.filter(s => s.status === 'live'), sched = streams.filter(s => s.status === 'scheduled').sort((a, b) => a.startedAt - b.startedAt), past = streams.filter(s => ['ended', 'stopped'].includes(s.status)).sort((a, b) => b.startedAt - a.startedAt);
  const perfs = l.performers || [];
  el.innerHTML = `<div class="page">
    <div class="breadcrumb"><a href="#/home">홈</a>${icon.chevron}<span>방송팀</span></div>
    <div class="card phead" style="margin-top:12px">
      ${avatar({ name: l.name, hue: l.hue, useInitials: true }, 'xl')}
      <div style="min-width:0"><div class="row" style="gap:8px"><h1>${esc(l.name)}</h1>${labelStatus(l.status)}${live.length ? `<span class="pill live">LIVE ${live.length}</span>` : ''}</div>
        <p class="bio">${esc(l.bio || '소개가 아직 없습니다')}</p>
        <div class="sub">${l.owner ? `<span>대표 ${esc(l.owner)}</span><span>·</span>` : ''}<span class="num" id="teamFollowers">${l.followers != null ? `팔로워 ${fmt.num(l.followers + (demo && fw.labels.includes(l.id) ? 1 : 0))}${demo ? ' (시연)' : ''}` : ''}</span><span>·</span><span class="num">출연자 ${perfs.length}명 · 방송 ${streams.length}회</span>${l.joinedAt ? `<span>·</span><span>${esc(fmt.date(l.joinedAt))} 합류</span>` : ''}</div></div>
      <div class="acts">${followBtn('label', l.id, fw.labels.includes(l.id))}</div>
    </div>
    <div class="tabs" role="tablist" style="margin-top:20px"></div>
    <div class="tab-body" id="tabBody"></div>
  </div>`;
  wireFollow(ctx, el, f => { const t = $('#teamFollowers', el); if (t && l.followers != null) t.textContent = `팔로워 ${fmt.num(l.followers + (demo && f.labels.includes(l.id) ? 1 : 0))}${demo ? ' (시연)' : ''}`; });

  let bookmarks = null;
  async function highlights() {
    if (bookmarks) return bookmarks;
    const all = await Promise.all(streams.map(async s => (await data.rounds(s.id)).map(r => ({ ...r, stream: s }))));
    bookmarks = all.flat().filter(r => r.endedAt && r.winnerName).sort((a, b) => b.endedAt - a.endedAt);
    return bookmarks;
  }
  tabs(ctx, el, [['streams', '방송'], ['performers', '출연자'], ['highlights', '하이라이트']], ctx.route.q.tab || 'streams', async tab => {
    const body = $('#tabBody', el);
    if (tab === 'streams') {
      body.innerHTML = streams.length ? `${live.length ? `<div class="sec"><h2>지금 라이브</h2></div>${grid(live)}` : ''}${sched.length ? `<div class="sec"><h2>예정 방송</h2></div>${grid(sched)}` : ''}${past.length ? `<div class="sec"><h2>지난 방송</h2></div>${grid(past)}` : ''}` : emptyBox('아직 방송 기록이 없습니다', '첫 방송이 열리면 여기에 표시됩니다', icon.film);
    } else if (tab === 'performers') {
      body.innerHTML = perfs.length ? `<div class="grid cards">${perfs.map(p => `<a class="card hover pcard" href="#/performer/${esc(p.id)}">${avatar(p, 'lg')}<div style="min-width:0"><b>${esc(p.name)}</b><small>${esc(p.bio || '')}</small></div>${p.team ? `<span class="tag">${esc((streams.find(s => s.teams?.[p.team]) || {}).teams?.[p.team] || p.team + '팀')}</span>` : ''}</a>`).join('')}</div>` : emptyBox('등록된 출연자가 없습니다', '', icon.users);
    } else {
      body.innerHTML = `<div class="skeleton" style="height:120px"></div>`;
      const bm = await highlights();
      body.innerHTML = `<div class="note" style="margin-bottom:12px">${icon.info} 라운드 기록 기반 북마크 (영상 저장 기능 없음) — 시각은 방송 시작 기준 경과 시간입니다.</div>` + (bm.length ? `<div class="card">${bm.map(r => `<a class="bm" href="#/live/${esc(r.stream.id)}"><span class="ts">${hms(r.endedAt - r.stream.startedAt)}</span><span><b>라운드 ${r.no} 우승 👑 ${esc(r.winnerName)}</b>${r.title ? ` <span class="muted">· ${esc(r.title)}</span>` : ''}<br><small>${esc(r.stream.title)} · 합계 <span class="num">${fmt.star(r.total)}</span> · ${esc(fmt.date(r.stream.startedAt))}</small></span></a>`).join('')}</div>` : emptyBox('종료된 라운드가 아직 없습니다', '라운드가 끝나면 우승 북마크가 쌓입니다', icon.trophy));
    }
  });
}

/* ======================================================================
   출연자
   ====================================================================== */
async function renderPerformer(ctx) {
  const { el, data } = ctx; const id = ctx.route.seg[1];
  const p = id && await data.performer(id);
  if (!p) { el.innerHTML = notFound('출연자'); return; }
  const fw = data.follows(); const gifts = (p.gifts || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  const streams = p.streams || [], rounds = (p.rounds || []).slice().sort((a, b) => (b.endedAt || b.startedAt) - (a.endedAt || a.startedAt));
  const wins = rounds.filter(r => r.winnerId === p.id).length;
  const teamName = (streams.find(s => s.teams?.[p.team]) || {}).teams?.[p.team] || (p.team ? p.team + '팀' : '');
  const total = p.total ?? gifts.reduce((a, g) => a + g.stars, 0);
  el.innerHTML = `<div class="page">
    <div class="breadcrumb"><a href="#/home">홈</a>${icon.chevron}${p.label ? `<a href="#/team/${esc(p.label.id)}">${esc(p.label.name)}</a>${icon.chevron}` : ''}<span>출연자</span></div>
    <div class="card phead" style="margin-top:12px">
      ${avatar(p, 'xl')}
      <div style="min-width:0"><div class="row" style="gap:8px"><h1>${esc(p.name)}</h1>${teamName ? `<span class="tag">${esc(teamName)}</span>` : ''}${p.active === false ? '<span class="pill">비활성</span>' : ''}</div>
        <p class="bio">${esc(p.bio || '소개가 아직 없습니다')}</p>
        <div class="sub">${p.label ? `<a href="#/team/${esc(p.label.id)}">${icon.users} ${esc(p.label.name)}</a>` : p.labelId ? `<a href="#/team/${esc(p.labelId)}">${icon.users} ${esc(p.labelId)}</a>` : ''}</div></div>
      <div class="acts">${followBtn('performer', p.id, fw.performers.includes(p.id))}</div>
    </div>
    <div class="grid stats" style="margin-top:16px">
      <div class="stat"><div class="k">누적 스타</div><div class="v num gold">${fmt.num(total)}<small>스타</small></div></div>
      <div class="stat"><div class="k">응원 수</div><div class="v num">${fmt.num(gifts.length)}<small>건</small></div></div>
      <div class="stat"><div class="k">참여 방송</div><div class="v num">${fmt.num(streams.length)}<small>회</small></div></div>
      <div class="stat"><div class="k">라운드 우승</div><div class="v num">${fmt.num(wins)}<small>회</small></div></div>
    </div>
    <div class="tabs" role="tablist" style="margin-top:20px"></div>
    <div class="tab-body" id="tabBody"></div>
  </div>`;
  wireFollow(ctx, el);
  tabs(ctx, el, [['rounds', '참여 회차'], ['gifts', '응원 기록'], ['upcoming', '예정 방송']], ctx.route.q.tab || 'rounds', tab => {
    const body = $('#tabBody', el);
    if (tab === 'rounds') {
      body.innerHTML = rounds.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>방송</th><th>라운드</th><th class="c">순위</th><th class="r">스타</th><th class="r">라운드 합계</th><th>결과</th></tr></thead><tbody>${rounds.map(r => {
        const sorted = (r.results || []).slice().sort((a, b) => b[1] - a[1]); const idx = sorted.findIndex(x => x[0] === p.id); const mine = sorted[idx]?.[1] || 0; const won = r.winnerId === p.id; const st = streams.find(s => s.id === r.streamId);
        return `<tr><td><a href="#/live/${esc(r.streamId)}">${esc(st?.title || r.streamId)}</a><br><small class="dim">${esc(fmt.date(r.startedAt))}</small></td><td>라운드 ${r.no}${r.title ? ` <span class="dim">· ${esc(r.title)}</span>` : ''}</td><td class="c num"><b class="${idx === 0 ? 'gold' : ''}">${idx >= 0 ? idx + 1 + '위' : '—'}</b></td><td class="r num">${fmt.num(mine)}</td><td class="r num dim">${fmt.num(r.total)}</td><td>${won ? `<span class="pill gold">${icon.crown} 우승</span>` : r.endedAt ? '<span class="pill">참가</span>' : '<span class="pill violet">진행 중</span>'}</td></tr>`;
      }).join('')}</tbody></table></div>` : emptyBox('참여한 라운드가 없습니다', '라운드 결과가 집계되면 여기에 표시됩니다', icon.trophy);
    } else if (tab === 'gifts') {
      const list = gifts.slice(0, 100);
      body.innerHTML = list.length ? `<div class="row between" style="margin-bottom:10px"><span class="sub dim" style="font-size:var(--fs-sm)">최근 ${list.length}건${gifts.length > list.length ? ` / 전체 ${fmt.num(gifts.length)}건` : ''}</span>${data.mode === 'demo' ? '<span class="pill">시연· 닉네임은 가상 시청자</span>' : ''}</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>시각</th><th>닉네임</th><th>선물</th><th class="r">스타</th></tr></thead><tbody>${list.map(g => `<tr><td class="num">${esc(fmt.dateTime(g.createdAt))}</td><td>${demoNick(g.nick)}</td><td>${esc(g.emoji || '')} ${esc(g.gift)}${g.qty > 1 ? ` <span class="dim">×${g.qty}</span>` : ''}</td><td class="r num"><b>${fmt.num(g.stars)}</b></td></tr>`).join('')}</tbody></table></div>` : emptyBox('아직 응원 기록이 없습니다', '첫 응원을 보내보세요', icon.gift);
    } else {
      const up = streams.filter(s => s.status === 'scheduled').sort((a, b) => a.startedAt - b.startedAt);
      body.innerHTML = up.length ? grid(up) : emptyBox('예정된 방송이 없습니다', '방송팀을 팔로우하면 새 일정을 먼저 받습니다', icon.calendar);
    }
  });
}

/* ======================================================================
   내 정보
   ====================================================================== */
async function renderMe(ctx) {
  const { el, data, cleanup } = ctx; const demo = data.mode === 'demo';
  const me = data.me();
  if (!me) {
    el.innerHTML = `<div class="page narrow"><div class="empty"><div class="ic">${icon.user}</div><b>${demo ? '역할을 선택하면 내 정보를 볼 수 있습니다' : '로그인이 필요합니다'}</b><span>${demo ? '시연 모드에서는 가입 없이 시청자·호스트·관리자 역할로 체험합니다' : '응원 기록·지갑·팔로우 목록은 로그인 후 표시됩니다'}</span><button class="btn primary" id="meCta">${demo ? '역할 선택' : '로그인'}</button></div></div>`;
    $('#meCta', el).onclick = () => demo ? ctx.openRole() : ctx.openAuth();
    return;
  }
  const roleName = { viewer: '시청자', host: '호스트', moderator: '모더레이터', admin: '관리자' }[me.role] || me.role;
  el.innerHTML = `<div class="page narrow">
    <div class="grid two">
      <div class="card pad"><div class="row" style="gap:14px">${avatar({ name: me.nick, useInitials: true }, 'lg')}<div style="min-width:0"><h1 style="font-size:var(--fs-lg)">${esc(me.nick)}</h1><div class="row" style="gap:6px;margin-top:4px"><span class="pill violet">${esc(roleName)}</span><span class="pill ${demo ? 'warn' : 'ok'}">${demo ? '시연 모드' : '서버 연동'}</span>${me.email ? `<span class="dim" style="font-size:var(--fs-xs)">${esc(me.email)}</span>` : ''}</div></div>
        <button class="btn ghost sm" id="logoutBtn" style="margin-left:auto">${icon.logout} ${demo ? '시청자로' : '로그아웃'}</button></div></div>
      <div class="card pad"><div class="row between"><div><div class="eyebrow">보유 스타</div><div class="wallet-v num" id="walletV">—</div></div><button class="btn primary" id="chargeBtn" ${demo ? '' : 'disabled'}>${icon.wallet} ${demo ? '가상 충전' : '충전'}</button></div>
        ${demo ? `<p class="dim" style="font-size:var(--fs-xs);margin-top:8px">시연 모드의 스타는 가상 포인트입니다 · 1스타 = ₩10 기준 표시</p>` : `<div class="note" style="margin-top:10px">서버 모드의 충전은 기존 토스페이먼츠 테스트 결제 화면으로만 진행합니다. 이 화면에서는 충전할 수 없습니다.</div>`}</div>
    </div>
    <div class="sec"><h2>응원 기록</h2><button class="btn sm" id="csvBtn">${icon.download} CSV 내려받기</button></div>
    <div id="giftsBox"><div class="skeleton" style="height:120px"></div></div>
    <div class="sec"><h2>팬 배지</h2><span class="sub">응원 기록으로 자동 획득</span></div>
    <div id="badgeBox"></div>
    <div class="sec"><h2>팔로우 목록</h2></div>
    <div id="followBox"><div class="skeleton" style="height:60px"></div></div>
  </div>`;

  /* 지갑 */
  const setWallet = v => { const w = $('#walletV', el); if (w) w.innerHTML = v == null ? '—' : `${fmt.num(v)}<small style="font-size:var(--fs-sm);color:var(--fg-3);margin-left:6px">스타 · ${fmt.krw(v * 10)}</small>`; };
  try { setWallet(await data.wallet()); } catch (e) { setWallet(null); }
  cleanup(bus.on('wallet', setWallet));
  cleanup(bus.on('auth', () => { if (router.parse().name === 'me') renderMe(ctx); }));

  $('#chargeBtn', el).onclick = () => {
    if (!demo) { toast('서버 모드의 충전은 토스페이먼츠 테스트 결제(기존 화면)로만 진행합니다', 'warn'); return; }
    const m = modal({ title: '가상 충전 (시연)', body: `<p class="muted" style="font-size:var(--fs-sm)">실제 결제가 아닙니다. 선택한 스타가 바로 지갑에 들어옵니다.</p><div class="stack">${STAR_PACKAGES.map(p => `<button class="card pad hover pkg" data-pkg="${p.id}"><span><b class="num gold">${fmt.num(p.stars)} 스타</b><small>${p.stars >= 10000 ? '유성우도 거뜬한 큰 응원' : p.stars >= 3000 ? '왕관 몇 번은 보낼 수 있는 양' : '하트·장미 응원용'}</small></span><span class="num" style="font-weight:700">${fmt.krw(p.krw)}</span></button>`).join('')}</div>`, footer: `<button class="btn ghost" data-close>닫기</button>` });
    $$('[data-pkg]', m.el).forEach(b => b.onclick = async () => {
      $$('[data-pkg]', m.el).forEach(x => x.disabled = true); setLoading(b, true);
      try { const r = await data.charge(b.dataset.pkg); m.close(); toast(`충전 완료 — 거래번호 ${r.txn} · 잔액 ${fmt.star(r.balance)}`, 'ok', 4000); }
      catch (err) { setLoading(b, false); $$('[data-pkg]', m.el).forEach(x => x.disabled = false); toast(err.message, 'bad'); if (err.code === 'NOT_SUPPORTED') m.close(); }
    });
  };

  /* 응원 기록 · 배지 */
  let myGifts = [];
  async function paintGifts() {
    const box = $('#giftsBox', el);
    try {
      const [g, streams] = await Promise.all([data.myGifts(), data.streams().catch(() => [])]);
      myGifts = g; const sname = id => streams.find(s => s.id === id)?.title || id;
      box.innerHTML = myGifts.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>거래번호</th><th>시각</th><th>방송</th><th>출연자</th><th>선물</th><th class="r">스타</th></tr></thead><tbody>${myGifts.map(g => `<tr><td><code>${esc(g.txn || '—')}</code></td><td class="num">${esc(fmt.dateTime(g.createdAt))}</td><td><a href="#/live/${esc(g.streamId)}">${esc(sname(g.streamId))}</a></td><td>${g.performerId ? `<a href="#/performer/${esc(g.performerId)}">${esc(g.performerName || '—')}</a>` : esc(g.performerName || '—')}</td><td>${esc(g.emoji || '')} ${esc(g.gift)}${g.qty > 1 ? ` <span class="dim">×${g.qty}</span>` : ''}${g.refunded ? ' <span class="pill bad">환불</span>' : ''}</td><td class="r num"><b>${fmt.num(g.stars)}</b></td></tr>`).join('')}</tbody></table></div><p class="dim num" style="font-size:var(--fs-xs);margin-top:8px">총 ${fmt.num(myGifts.length)}건 · ${fmt.star(myGifts.reduce((a, g) => a + (g.refunded ? 0 : g.stars), 0))}</p>` : emptyBox('아직 보낸 응원이 없습니다', '라이브에 입장해 출연자를 응원해 보세요', icon.gift);
      const st = fanStats(myGifts.filter(g => !g.refunded));
      $('#badgeBox', el).innerHTML = `<div class="badge-grid">${st.badges.map(b => `<span class="fan-badge ${b.earned ? '' : 'locked'}" title="${b.earned ? '획득' : '미획득'}">${esc(b.emoji)} ${esc(b.name)}${b.earned ? '' : ` <span class="dim">${icon.block}</span>`}</span>`).join('')}</div><p class="dim" style="font-size:var(--fs-xs);margin-top:8px">획득 ${st.badges.filter(b => b.earned).length} / ${st.badges.length} · 응원 ${fmt.num(st.count)}건 · ${fmt.star(st.stars)}</p>`;
      $('#csvBtn', el).onclick = () => {
        if (!myGifts.length) { toast('내려받을 기록이 없습니다', 'warn'); return; }
        const rows = [['거래번호', '시각', '방송', '출연자', '선물', '수량', '스타', '환불'], ...myGifts.map(g => [g.txn, new Date(g.createdAt).toISOString(), sname(g.streamId), g.performerName || '', g.gift, g.qty || 1, g.stars, g.refunded ? 'Y' : ''])];
        downloadText('my-gifts.csv', rows.map(r => r.map(csvCell).join(',')).join('\n')); toast('my-gifts.csv 를 내려받습니다', 'ok');
      };
    } catch (e) { box.innerHTML = `<div class="empty"><div class="ic">${icon.alert}</div><b>응원 기록을 불러오지 못했습니다</b><span>${esc(e.message || e)}</span><button class="btn sm" id="giftsRetry">${icon.refresh} 다시 시도</button></div>`; $('#giftsRetry', el).onclick = paintGifts; }
  }
  cleanup(bus.on('wallet', () => { paintGifts(); }));   // 후원/충전 뒤 기록 갱신

  /* 팔로우 */
  async function paintFollows() {
    const box = $('#followBox', el); const fw = data.follows();
    try {
      const labels = await data.labels();
      const perfs = (await Promise.all(fw.performers.map(id => data.performer(id).catch(() => null)))).filter(Boolean);
      const ls = fw.labels.map(id => labels.find(l => l.id === id) || { id, name: id });
      box.innerHTML = (ls.length || perfs.length) ? `<div class="grid two">
        <div class="panel"><div class="panel-h">방송팀 <small>${ls.length}</small></div><div class="panel-b stack" style="gap:8px">${ls.length ? ls.map(l => `<div class="row between"><a class="row" href="#/team/${esc(l.id)}" style="gap:10px">${avatar({ name: l.name, hue: l.hue, useInitials: true }, 'sm')}<b>${esc(l.name)}</b></a>${followBtn('label', l.id, true).replace('class="btn', 'class="btn sm')}</div>`).join('') : '<span class="dim">팔로우한 방송팀이 없습니다</span>'}</div></div>
        <div class="panel"><div class="panel-h">출연자 <small>${perfs.length}</small></div><div class="panel-b stack" style="gap:8px">${perfs.length ? perfs.map(p => `<div class="row between"><a class="row" href="#/performer/${esc(p.id)}" style="gap:10px">${avatar(p, 'sm')}<b>${esc(p.name)}</b>${p.label ? `<span class="dim" style="font-size:var(--fs-xs)">${esc(p.label.name)}</span>` : ''}</a>${followBtn('performer', p.id, true).replace('class="btn', 'class="btn sm')}</div>`).join('') : '<span class="dim">팔로우한 출연자가 없습니다</span>'}</div></div></div>` : emptyBox('팔로우한 방송팀·출연자가 없습니다', '홈에서 관심 있는 무대를 팔로우해 보세요', icon.star);
    } catch (e) { box.innerHTML = emptyBox('팔로우 목록을 불러오지 못했습니다', e.message || String(e), icon.alert); }
  }
  wireFollow(ctx, el, () => paintFollows());

  $('#logoutBtn', el).onclick = async () => { try { await data.logout(); toast(demo ? '시청자 역할로 돌아갔습니다' : '로그아웃했습니다', 'ok'); ctx.renderHeader(); if (!demo) router.go('home'); } catch (e) { toast(e.message, 'bad'); } };

  await Promise.all([paintGifts(), paintFollows()]);
}

/* ---------- 진입점 ---------- */
export default async function render(ctx) {
  ensureStyle();
  const name = ctx.route.name;
  try {
    if (name === 'team') return await renderTeam(ctx);
    if (name === 'performer') return await renderPerformer(ctx);
    return await renderMe(ctx);
  } catch (e) {
    console.error(e);
    ctx.el.innerHTML = `<div class="page narrow"><div class="empty"><div class="ic">${icon.alert}</div><b>불러오지 못했습니다</b><span>${esc(e.message || e)}</span><div class="row"><button class="btn" id="pfRetry">${icon.refresh} 다시 시도</button><a class="btn ghost" href="#/home">홈으로</a></div></div></div>`;
    $('#pfRetry', ctx.el).onclick = () => render(ctx);
    if (e.code === 'AUTH') (ctx.data.mode === 'demo' ? ctx.openRole : ctx.openAuth)();
  }
}
