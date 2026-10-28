/* LIVE STAGE v2 — 순위판 오버레이 (뷰어 · OBS 공용)
   사용:
     import { mount } from './app/excel-board.js';
     const b = mount(host, { data, streamId, mode:'viewer'|'obs', theme:'dark'|'light'|'minimal', scale:1, pos:'tl'|'tr'|'bl'|'br',
                             spacing:'normal'|'compact', fx:'full'|'low', showMissions:true, showTimer:true, showTeams:'auto' });
     b.destroy(); b.reload(); b.test('small'|'mid'|'big'|'huge'|'round'|'mission'); b.pause(true); b.skip();
   이 모듈은 tokens.css 에 의존하지 않는다 — 필요한 CSS 를 한 번만(id 'xb-css') 주입한다. 클래스 접두사 xb- */
import { bus, esc, fmt, hueOf, initials, prefersReducedMotion } from './core.js';
import { GIFTS, rankPerformers, rankTeams, rankDeltas, roundTimeLeft, roundLabel, missionProgress, effectTier } from './engine.js';

const STYLE = `
.xb{position:absolute;z-index:5;pointer-events:none;font-family:"Noto Sans KR",Pretendard,-apple-system,system-ui,sans-serif;line-height:1.3;color:#f2efe9;--g:#d4af5a;--g2:#f0d48a;--v:#8b6cf6;--v2:#c9b8ff;--bad:#e5484d;--ok:#3ecf8e;--ink:#f2efe9;--mute:rgba(242,239,233,.62);--card:rgba(10,10,14,.74);--line:rgba(212,175,90,.35);--rowline:rgba(255,255,255,.08);--barbg:rgba(255,255,255,.09);--mcard:rgba(10,10,14,.7);--sh:none;--px:10px;--py:4px;--rs:1}
.xb *{box-sizing:border-box;margin:0}
.xb.viewer{font-size:12px;width:min(46%,250px);--off:10px}
.xb.obs{font-size:16px;width:400px;--off:24px}
.xb.compact{--py:2px;--px:8px}
.xb.t-light{color:#1a1a22;--ink:#1a1a22;--mute:rgba(26,26,34,.6);--card:rgba(255,255,255,.86);--line:rgba(160,120,30,.45);--rowline:rgba(0,0,0,.08);--barbg:rgba(0,0,0,.08);--mcard:rgba(255,255,255,.84);--g:#a8812a;--g2:#9a7420;--v2:#6b4ee6;--sh:none}
.xb.t-minimal{--card:transparent;--line:transparent;--rowline:rgba(255,255,255,.12);--mcard:transparent;--sh:0 1px 3px rgba(0,0,0,.95),0 0 10px rgba(0,0,0,.8);text-shadow:var(--sh)}
.xb.t-minimal .xb-card,.xb.t-minimal .xb-mi{backdrop-filter:none;border-color:transparent}
.xb .xb-card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.xb .xb-h{display:flex;align-items:center;gap:6px;padding:calc(var(--py) + 3px) var(--px);background:linear-gradient(90deg,rgba(212,175,90,.28),rgba(139,108,246,.18));border-bottom:1px solid var(--line);font-weight:800;letter-spacing:.01em;min-width:0}
.xb.t-light .xb-h{background:linear-gradient(90deg,rgba(212,175,90,.35),rgba(139,108,246,.18))}
.xb.t-minimal .xb-h{background:transparent;border-bottom-color:var(--rowline)}
.xb .xb-h .t{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xb .xb-h .tm{flex:none;font-variant-numeric:tabular-nums;color:var(--g2);font-weight:900}
.xb .xb-h .tm.paused{color:var(--v2)}
.xb .xb-h .tm.over{color:var(--bad);animation:xbblink 1s steps(2) infinite}
.xb .xb-conn{display:none;align-items:center;gap:4px;padding:2px var(--px);background:rgba(229,72,77,.85);color:#fff;font-size:.78em;font-weight:700;text-shadow:none}
.xb .xb-conn::before{content:"";width:.5em;height:.5em;border-radius:50%;background:#fff;animation:xbblink 1.2s steps(2) infinite}
.xb.offline .xb-conn{display:flex}
.xb .xb-rows{position:relative;padding:3px 0;font-size:calc(1em * var(--rs))}
.xb .xb-row{display:grid;grid-template-columns:1.3em 1.7em minmax(0,1fr) auto;align-items:center;column-gap:.4em;padding:var(--py) var(--px);transition:transform .55s cubic-bezier(.2,.8,.2,1);position:relative}
.xb.compact .xb-row{grid-template-columns:1.2em 1.4em minmax(0,1fr) auto}
.xb .xb-row .rk{font-weight:900;color:var(--g2);text-align:center;font-variant-numeric:tabular-nums}
.xb .xb-row.r1 .rk{color:#ffd54a}
.xb.t-light .xb-row.r1 .rk{color:#b8860b}
.xb .xb-row .av{width:1.5em;height:1.5em;border-radius:50%;display:grid;place-items:center;font-size:.85em;font-weight:800;background:hsl(var(--h) 55% 38%);color:#fff;overflow:hidden;text-shadow:none;line-height:1}
.xb .xb-row .av.em{background:transparent;font-size:1.2em}
.xb.compact .xb-row .av{width:1.3em;height:1.3em}
.xb .xb-row .nm{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;display:flex;align-items:center;gap:.25em}
.xb .xb-row .nm span{overflow:hidden;text-overflow:ellipsis;min-width:0}
.xb .xb-row .nm .cr{flex:none;font-size:.9em}
.xb .xb-row .nm .tg{flex:none;font-style:normal;font-size:.7em;padding:0 .35em;border-radius:.5em;background:rgba(139,108,246,.35);color:var(--v2);font-weight:800;text-shadow:none}
.xb.t-light .xb-row .nm .tg{background:rgba(139,108,246,.18)}
.xb .xb-row .nm .tg.b{background:rgba(229,72,77,.35);color:#ffb3b5}
.xb.t-light .xb-row .nm .tg.b{background:rgba(229,72,77,.15);color:#c22}
.xb .xb-row .st{font-variant-numeric:tabular-nums;font-weight:900;color:var(--g2);display:flex;align-items:center;gap:.3em;white-space:nowrap}
.xb .xb-row .st .d{font-style:normal;font-size:.72em;font-weight:900;opacity:0;transition:opacity .3s}
.xb .xb-row .st .d.up{color:var(--ok);opacity:1}
.xb .xb-row .st .d.dn{color:var(--bad);opacity:1}
.xb .xb-row .bar{grid-column:3/5;height:3px;background:var(--barbg);border-radius:2px;overflow:hidden;margin-top:2px}
.xb.compact .xb-row .bar{height:2px;margin-top:1px}
.xb .xb-row .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--g),var(--g2));transition:width .6s}
.xb .xb-row.r1 .bar i{background:linear-gradient(90deg,#ffb300,#ffe066)}
.xb .xb-row.flash{animation:xbflash .9s ease-out}
.xb .xb-row.empty .nm{color:var(--mute);font-weight:500}
.xb .xb-teams{display:grid;grid-template-columns:1fr 1fr;gap:1px;border-top:1px solid var(--rowline);background:var(--rowline)}
.xb .xb-team{padding:calc(var(--py) + 2px) var(--px);background:var(--card);display:flex;flex-direction:column;gap:1px;min-width:0}
.xb.t-minimal .xb-team{background:transparent}
.xb .xb-team .tn{font-size:.82em;font-weight:700;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xb .xb-team .tv{font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap}
.xb .xb-team.lead{background:linear-gradient(90deg,rgba(212,175,90,.22),transparent)}
.xb .xb-team.lead .tn{color:var(--g2)}
.xb .xb-team.lead .tv{color:var(--g2)}
.xb .xb-team .tb{height:3px;background:var(--barbg);border-radius:2px;overflow:hidden;margin-top:2px}
.xb .xb-team .tb i{display:block;height:100%;background:var(--v)}
.xb .xb-team.lead .tb i{background:linear-gradient(90deg,var(--g),var(--g2))}
.xb .xb-f{display:flex;justify-content:space-between;align-items:center;padding:var(--py) var(--px);border-top:1px solid var(--rowline);color:var(--mute);font-size:.88em}
.xb .xb-f b{color:var(--ink);font-variant-numeric:tabular-nums}
.xb .xb-m{margin-top:6px;display:grid;gap:4px}
.xb.compact .xb-m{margin-top:4px;gap:3px}
.xb .xb-mi{background:var(--mcard);border:1px solid rgba(139,108,246,.45);border-radius:9px;padding:calc(var(--py) + 1px) var(--px);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 6px;align-items:center;font-size:.9em;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.xb .xb-mi.done{border-color:rgba(62,207,142,.6);opacity:.85}
.xb .xb-mi .mt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700}
.xb .xb-mi .mt small{color:var(--mute);font-weight:500;margin-left:.3em}
.xb .xb-mi .mp{color:var(--v2);font-variant-numeric:tabular-nums;font-weight:800;white-space:nowrap}
.xb .xb-mi.done .mp{color:var(--ok)}
.xb .xb-mi .mb{grid-column:1/3;height:2px;background:var(--barbg);border-radius:1px;overflow:hidden}
.xb .xb-mi .mb i{display:block;height:100%;background:var(--v);transition:width .5s}
/* ---- 효과 레이어 ---- */
.xb-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:6;--fs:1;font-family:"Noto Sans KR",Pretendard,system-ui,sans-serif}
.xb-fx.obs{--fs:1.6}
.xb-fx.paused *{animation-play-state:paused!important}
.xb-fx .fl{position:absolute;bottom:18%;font-size:calc(28px * var(--fs));animation:xbfloat 2.4s ease-out forwards;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))}
.xb-fx .burst{position:absolute;left:50%;top:45%;font-size:calc(44px * var(--fs));animation:xbburst 1.6s ease-out forwards;filter:drop-shadow(0 2px 8px rgba(0,0,0,.7))}
.xb-fx .big{position:absolute;inset:0;display:grid;place-items:center;text-align:center;background:radial-gradient(ellipse at center,rgba(212,175,90,.35),rgba(0,0,0,.55) 70%);animation:xbbig 5s ease-out forwards}
.xb-fx .big.huge{background:radial-gradient(ellipse at center,rgba(139,108,246,.45),rgba(212,175,90,.25) 40%,rgba(0,0,0,.65) 75%);animation-duration:6.5s}
.xb-fx .big .e{font-size:calc(96px * var(--fs));animation:xbpulse 1s ease-in-out infinite alternate;filter:drop-shadow(0 0 24px rgba(255,214,74,.9))}
.xb-fx .big .t{font-size:calc(26px * var(--fs));font-weight:900;color:#ffe066;text-shadow:0 2px 12px rgba(0,0,0,.8);margin-top:6px;padding:0 6%}
.xb-fx .big .s{font-size:calc(15px * var(--fs));color:#f2efe9;text-shadow:0 1px 6px rgba(0,0,0,.8)}
.xb-fx .rain{position:absolute;top:-60px;animation:xbrain linear forwards;will-change:transform}
.xb-fx .banner{position:absolute;left:50%;top:14%;transform:translateX(-50%);background:rgba(10,10,14,.86);border:2px solid #ffd54a;border-radius:14px;padding:calc(10px * var(--fs)) calc(18px * var(--fs));text-align:center;animation:xbbanner 5s ease forwards;min-width:min(60%,calc(360px * var(--fs)));max-width:92%}
.xb-fx .banner .e{font-size:calc(40px * var(--fs))}.xb-fx .banner .t{font-size:calc(18px * var(--fs));font-weight:900;color:#ffe066}.xb-fx .banner .s{font-size:calc(13px * var(--fs));color:#f2efe9;margin-top:2px}
.xb-fx .banner.mission{border-color:#8b6cf6}.xb-fx .banner.mission .t{color:#c9b8ff}
@keyframes xbflash{0%{background:rgba(255,214,74,.55)}100%{background:transparent}}
@keyframes xbblink{50%{opacity:.3}}
@keyframes xbfloat{0%{transform:translateY(0) scale(.8);opacity:0}15%{opacity:1}100%{transform:translateY(-160px) scale(1.2);opacity:0}}
@keyframes xbburst{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}25%{transform:translate(-50%,-50%) scale(1.3);opacity:1}100%{transform:translate(-50%,-50%) scale(1) translateY(-40px);opacity:0}}
@keyframes xbbig{0%{opacity:0}8%{opacity:1}85%{opacity:1}100%{opacity:0}}
@keyframes xbpulse{from{transform:scale(1)}to{transform:scale(1.15)}}
@keyframes xbrain{to{transform:translateY(120vh) rotate(360deg)}}
@keyframes xbbanner{0%{opacity:0;transform:translateX(-50%) translateY(-20px)}10%{opacity:1;transform:translateX(-50%) translateY(0)}85%{opacity:1}100%{opacity:0}}
`;
function injectCss() { if (document.getElementById('xb-css')) return; const st = document.createElement('style'); st.id = 'xb-css'; st.textContent = STYLE; document.head.appendChild(st); }

const num = n => { n = Number(n || 0); if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억'; if (n >= 1e6) return (n / 1e4).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '만'; return fmt.num(n); };
const rowScale = n => n <= 6 ? 1 : n <= 8 ? .92 : n <= 10 ? .84 : .76;
const TIER_STARS = { small: 50, mid: 300, big: 1000, huge: 5000 };
const FX_MS = { small: 3200, mid: 2200, big: 5200, huge: 6700, banner: 5100 };

export function mount(host, opts = {}) {
  injectCss();
  const { data, streamId, mode = 'viewer', theme = 'dark', pos = 'tl', spacing = 'normal', showMissions = true, showTimer = true, showTeams = 'auto' } = opts;
  const scale = Math.max(.25, Number(opts.scale) || 1);
  const lowFx = () => opts.fx === 'low' || prefersReducedMotion();
  if (!data || !streamId) throw new Error('mount: data 와 streamId 가 필요합니다');
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const root = document.createElement('div');
  root.className = `xb ${mode === 'obs' ? 'obs' : 'viewer'} t-${['dark', 'light', 'minimal'].includes(theme) ? theme : 'dark'}${spacing === 'compact' ? ' compact' : ''}`;
  const fx = document.createElement('div'); fx.className = 'xb-fx' + (mode === 'obs' ? ' obs' : '');
  host.appendChild(root); host.appendChild(fx);

  const st = { stream: null, performers: [], missions: [], round: null, ranked: [], deltas: {}, deltaUntil: 0, deltaTimer: null,
    dead: false, connOk: true, lastEvent: Date.now(), lastReload: 0, seen: new Set(), seenList: [],
    queue: [], current: null, paused: false, unsub: null, offConn: null, timer: null, hb: null, ro: null };

  /* ---------- 위치 · 배율 (모서리 기준 transform-origin, 화면에 맞게 배율 자동 축소) ---------- */
  const corner = { v: pos.includes('b') ? 'bottom' : 'top', h: pos.includes('r') ? 'right' : 'left' };
  root.style.transformOrigin = `${corner.v} ${corner.h}`;
  root.style[corner.v] = 'var(--off)'; root.style[corner.h] = 'var(--off)';
  function fit() {
    const off = mode === 'obs' ? 24 : 10;
    const W = host.clientWidth, H = host.clientHeight;
    let s = scale;
    if (W > 0 && root.offsetWidth > 0) s = Math.min(s, (W - off * 2) / root.offsetWidth);
    if (H > 0 && root.offsetHeight > 0) s = Math.min(s, (H - off * 2) / root.offsetHeight);
    s = Math.max(.25, s);
    root.style.transform = s === 1 ? '' : `scale(${s})`;
  }

  /* ---------- 데이터 ---------- */
  const rankKey = () => (st.round && st.round.no > 0) ? 'roundTotal' : 'total';
  const teamMode = () => showTeams === true || (showTeams === 'auto' && st.stream && st.stream.mode === 'team');
  const teamName = t => (st.stream && st.stream.teams && st.stream.teams[t]) || t;
  const perfById = id => st.performers.find(p => p.id === id) || {};

  async function load() {
    try {
      const s = await data.stream(streamId);
      if (!s) throw new Error('방송을 찾을 수 없습니다');
      if (st.dead) return;
      st.stream = s; st.performers = s.performers || []; st.missions = (s.missions || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)); st.round = s.round || null;
      st.lastReload = Date.now(); st.lastEvent = Date.now();
      setConn(true);
      updateRank(false);
      render();
    } catch (e) {
      console.warn('[xb] reload 실패 — 마지막 데이터 유지', e);
      setConn(false);
      if (!st.stream) render();   // 아직 아무 데이터도 없으면 빈 판이라도 그린다
    }
  }
  function setConn(ok) { st.connOk = !!ok; root.classList.toggle('offline', !ok); }
  function updateRank(withDelta = true) {
    const next = rankPerformers(st.performers, rankKey());
    if (withDelta && st.ranked.length) {
      const d = rankDeltas(st.ranked, next);
      if (Object.values(d).some(x => x)) { st.deltas = d; st.deltaUntil = Date.now() + 4000; clearTimeout(st.deltaTimer); st.deltaTimer = setTimeout(() => { st.deltas = {}; render(); }, 4100); }
    }
    st.ranked = next;
  }

  /* ---------- 타이머 ---------- */
  function timerText() {
    if (!showTimer) return null;
    const t = roundTimeLeft(st.round);
    if (!t) return null;
    if (st.round.status === 'paused') return { text: '⏸ 일시정지', cls: 'paused' };
    if (t.countUp) return { text: '⏱ ' + fmt.mmss(t.elapsed), cls: '' };
    if (t.over) return { text: '시간 종료', cls: 'over' };
    return { text: '⏳ ' + fmt.mmss(t.left), cls: '' };
  }
  function tick() {
    const el = root.querySelector('.xb-h .tm'); const t = timerText();
    if (!t && !el) return;
    if (!t || !el) { render(); return; }
    el.textContent = t.text; el.className = 'tm ' + t.cls;
  }

  /* ---------- 렌더 (FLIP 행 이동) ---------- */
  function render() {
    if (st.dead) return;
    const key = rankKey(); const list = st.ranked; const sum = list.reduce((a, p) => a + p.value, 0);
    const t = timerText(); const showDelta = Date.now() < st.deltaUntil;
    const before = {}; root.querySelectorAll('.xb-row[data-id]').forEach(r => before[r.dataset.id] = r.getBoundingClientRect().top);
    const rows = list.map(p => {
      const d = showDelta ? (st.deltas[p.id] || 0) : 0;
      const av = p.emoji ? `<span class="av em" aria-hidden="true">${esc(p.emoji)}</span>` : `<span class="av" style="--h:${p.hue ?? hueOf(p.name)}" aria-hidden="true">${esc(initials(p.name))}</span>`;
      const tag = teamMode() && p.team ? `<em class="tg ${p.team === 'B' ? 'b' : ''}">${esc(teamName(p.team))}</em>` : '';
      return `<div class="xb-row r${p.rank}" data-id="${esc(p.id)}"><span class="rk">${p.rank}</span>${av}<span class="nm"><span>${esc(p.name)}</span>${p.rank === 1 && p.value > 0 ? '<i class="cr">👑</i>' : ''}${tag}</span><span class="st"><i class="d ${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${d > 0 ? '▲' + d : d < 0 ? '▼' + (-d) : ''}</i>${num(p.value)}</span><span class="bar"><i style="width:${Math.max(3, p.share * 100)}%"></i></span></div>`;
    }).join('') || '<div class="xb-row empty"><span></span><span></span><span class="nm">출연자 없음</span></div>';
    let teams = '';
    if (teamMode() && list.length) {
      const tr = rankTeams(st.performers, key).filter(x => x.team !== '팀 없음');
      if (tr.length) teams = `<div class="xb-teams">${tr.map(x => `<div class="xb-team ${x.rank === 1 && x.value > 0 ? 'lead' : ''}"><span class="tn">${x.rank === 1 && x.value > 0 ? '🏆 ' : ''}${esc(teamName(x.team))}</span><span class="tv">${num(x.value)}</span><span class="tb"><i style="width:${Math.max(3, x.share * 100)}%"></i></span></div>`).join('')}</div>`;
    }
    const missions = showMissions && st.missions.length ? `<div class="xb-m">${st.missions.map(m => {
      const pr = missionProgress(m, st.performers);
      const who = m.performerId ? perfById(m.performerId).name : m.team ? teamName(m.team) : '';
      return `<div class="xb-mi ${m.done ? 'done' : ''}" data-id="${esc(m.id)}"><span class="mt">${m.done ? '✅' : '🎯'} ${esc(m.title)}${who ? `<small>· ${esc(who)}</small>` : ''}</span><span class="mp">${m.done ? '달성' : m.kind === 'single' ? '한 번에 ' + num(m.threshold) : num(pr.cur) + ' / ' + num(pr.max)}</span>${m.kind === 'round' && !m.done ? `<span class="mb"><i style="width:${Math.round(pr.ratio * 100)}%"></i></span>` : ''}</div>`;
    }).join('')}</div>` : '';
    root.innerHTML = `<div class="xb-card">
      <div class="xb-h"><span class="t">${esc(roundLabel(st.round))}</span>${t ? `<span class="tm ${t.cls}">${t.text}</span>` : ''}</div>
      <div class="xb-conn">연결 끊김 — 마지막 데이터 유지</div>
      <div class="xb-rows" style="--rs:${rowScale(list.length)}">${rows}</div>${teams}
      <div class="xb-f"><span>합계</span><b>${num(sum)} 스타</b></div></div>${missions}`;
    root.querySelectorAll('.xb-row[data-id]').forEach(r => { const b = before[r.dataset.id]; if (b == null) return; const d = b - r.getBoundingClientRect().top; if (!d) return; r.style.transition = 'none'; r.style.transform = `translateY(${d}px)`; requestAnimationFrame(() => { r.style.transition = ''; r.style.transform = ''; }); });
    fit();
  }
  function flash(pid) { const r = [...root.querySelectorAll('.xb-row[data-id]')].find(x => x.dataset.id === String(pid)); if (r) { r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); } }

  /* ---------- 효과 큐: 대형은 한 번에 하나, 소형은 즉시(묶음) ---------- */
  function enqueue(item) { st.queue.push(item); if (st.queue.length > 40) st.queue.splice(0, st.queue.length - 40); pump(); }
  function pump() {
    if (st.dead || st.paused || st.current) return;
    while (st.queue.length) {
      const it = st.queue.shift();
      if (it.exclusive) { play(it); return; }
      play(it);   // 소형·중형은 바로 재생하고 계속 비운다
    }
  }
  function play(it) {
    const els = it.kind === 'gift' ? giftFx(it.gift, it.tier) : bannerFx(it);
    if (!it.exclusive) return;
    const cur = { it, els, left: it.ms, startedAt: Date.now(), t: null };
    st.current = cur;
    cur.t = setTimeout(() => finish(cur), cur.left);
  }
  function finish(cur) {
    if (st.current !== cur) return;
    clearTimeout(cur.t); st.current = null;
    cur.els.forEach(e => e.remove());
    pump();
  }
  function giftFx(g, tier) {
    const p = perfById(g.performerId); const stars = Number(g.stars) || 0; const emoji = g.emoji || '💛'; const els = [];
    flash(g.performerId);
    if (lowFx()) { els.push(floatEmoji(emoji)); return els; }
    if (tier === 'big' || tier === 'huge') {
      const d = document.createElement('div'); d.className = 'big ' + tier;
      d.innerHTML = `<div><div class="e">${esc(emoji)}</div><div class="t">${esc(g.nick || '익명')} 님의 ${esc(g.gift || '선물')}${g.qty > 1 ? ' ×' + g.qty : ''} ${fmt.num(stars)} 스타!</div><div class="s">→ ${esc(p.emoji || '')} ${esc(p.name || g.performerName || '')}</div></div>`;
      fx.appendChild(d); els.push(d);
      const n = tier === 'huge' ? 40 : 18;
      for (let i = 0; i < n; i++) { const r = document.createElement('div'); r.className = 'rain'; r.textContent = emoji; r.style.left = Math.random() * 100 + '%'; r.style.animationDuration = (2.2 + Math.random() * 2) + 's'; r.style.animationDelay = (Math.random() * 1.8) + 's'; r.style.fontSize = (22 + Math.random() * 26) * (mode === 'obs' ? 1.4 : 1) + 'px'; fx.appendChild(r); els.push(r); }
    } else if (tier === 'mid') {
      const d = document.createElement('div'); d.className = 'burst'; d.textContent = emoji; fx.appendChild(d); els.push(d); setTimeout(() => d.remove(), 1700);
      for (let i = 0; i < 6; i++) els.push(floatEmoji(emoji));
    } else { for (let i = 0; i < 2; i++) els.push(floatEmoji(emoji)); }
    return els;
  }
  function floatEmoji(e) { const d = document.createElement('div'); d.className = 'fl'; d.textContent = e; d.style.left = (15 + Math.random() * 70) + '%'; d.style.animationDelay = (Math.random() * .6) + 's'; fx.appendChild(d); setTimeout(() => d.remove(), 3200); return d; }
  function bannerFx(it) { const d = document.createElement('div'); d.className = 'banner ' + (it.cls || ''); d.innerHTML = `<div class="e">${esc(it.emoji)}</div><div class="t">${esc(it.title)}</div>${it.sub ? `<div class="s">${esc(it.sub)}</div>` : ''}`; fx.appendChild(d); return [d]; }
  function banner(cls, emoji, title, sub) { enqueue({ kind: 'banner', cls, emoji, title, sub, exclusive: true, ms: FX_MS.banner }); }
  function onGift(g) {
    if (!g) return;
    st.lastEvent = Date.now();
    if (g.id != null) { const k = String(g.id); if (st.seen.has(k)) return; st.seen.add(k); st.seenList.push(k); if (st.seenList.length > 500) st.seen.delete(st.seenList.shift()); }
    const tier = effectTier(Number(g.stars) || 0);
    const big = tier === 'big' || tier === 'huge';
    enqueue({ kind: 'gift', gift: g, tier, exclusive: big && !lowFx(), ms: FX_MS[tier] });
  }

  /* ---------- 실시간 ---------- */
  st.unsub = data.subscribe(streamId, {
    onPerformers(list) { st.lastEvent = Date.now(); if (Array.isArray(list)) st.performers = list; updateRank(true); render(); },
    onGift,
    onRound(r) {
      st.lastEvent = Date.now(); if (!r) return;
      const prev = st.round || {}; st.round = { ...r };
      if (r.status === 'running' && (prev.status !== 'running' || prev.no !== r.no) && prev.status !== 'paused') { st.performers.forEach(p => p.roundTotal = 0); st.ranked = []; banner('', '🏁', `라운드 ${r.no} 시작!`, r.title || ''); }
      if (r.status === 'ended' && ['running', 'paused'].includes(prev.status)) { const w = rankPerformers(st.performers, 'roundTotal')[0]; if (w && w.value > 0) banner('', '👑', `라운드 ${r.no} 우승 — ${w.emoji || ''} ${w.name}`, `${fmt.num(w.value)} 스타`); }
      updateRank(false); render();
    },
    onMission(m) {
      st.lastEvent = Date.now(); if (!m) return;
      if (m._deleted) st.missions = st.missions.filter(x => x.id !== m.id);
      else { const i = st.missions.findIndex(x => x.id === m.id); const was = i >= 0 ? st.missions[i].done : false; if (i >= 0) st.missions[i] = m; else st.missions.push(m); if (m.done && !was) banner('mission', '🎯', '미션 달성!', m.title + (m.doneBy ? ' — ' + m.doneBy + ' 님' : '')); }
      st.missions.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)); render();
    },
    onStream(s) { st.lastEvent = Date.now(); if (!s) return; st.stream = { ...(st.stream || {}), ...s, performers: st.performers }; if (s.performers) { st.performers = s.performers; } if (s.round) st.round = s.round; if (s.missions) st.missions = s.missions.slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)); updateRank(true); render(); },
  });
  st.offConn = bus.on('conn', c => { setConn(c && c.ok !== false); if (c && c.ok) load(); });
  st.timer = setInterval(tick, 1000);
  st.hb = setInterval(() => { const now = Date.now(); if (now - st.lastEvent > 60000 && now - st.lastReload > 60000) load(); }, 30000);
  if ('ResizeObserver' in window) { st.ro = new ResizeObserver(() => fit()); st.ro.observe(host); }
  load();

  /* ---------- 공개 API ---------- */
  return {
    destroy() { st.dead = true; clearInterval(st.timer); clearInterval(st.hb); clearTimeout(st.deltaTimer); if (st.current) clearTimeout(st.current.t); st.unsub && st.unsub(); st.offConn && st.offConn(); st.ro && st.ro.disconnect(); root.remove(); fx.remove(); },
    reload: load,
    test(kind = 'small') {
      if (kind === 'round') { const no = (st.round && st.round.no) || 1; banner('', '🏁', `라운드 ${no} 시작!`, (st.round && st.round.title) || '테스트 배너'); return; }
      if (kind === 'mission') { banner('mission', '🎯', '미션 달성!', (st.missions[0] && st.missions[0].title || '테스트 미션') + ' — 테스트 님'); return; }
      const stars = TIER_STARS[kind] || TIER_STARS.small;
      const gi = GIFTS.slice().reverse().find(x => x.stars <= stars) || GIFTS[0];
      const list = st.ranked.length ? st.ranked : st.performers; const p = list[Math.floor(Math.random() * list.length)] || {};
      onGift({ id: 'test-' + Date.now() + Math.random(), streamId, performerId: p.id, performerName: p.name, nick: '테스트', giftId: gi.id, gift: gi.name, emoji: gi.emoji, qty: 1, stars, createdAt: Date.now() });
    },
    pause(on = true) {
      st.paused = !!on; fx.classList.toggle('paused', st.paused);
      const c = st.current;
      if (c) { if (st.paused) { clearTimeout(c.t); c.left = Math.max(0, c.left - (Date.now() - c.startedAt)); } else { c.startedAt = Date.now(); c.t = setTimeout(() => finish(c), c.left); } }
      if (!st.paused) pump();
    },
    skip() { if (st.current) finish(st.current); else if (st.queue.length) st.queue.shift(); },
    get state() { return { paused: st.paused, queued: st.queue.length, playing: !!st.current, connected: st.connOk }; },
  };
}
export default { mount };
