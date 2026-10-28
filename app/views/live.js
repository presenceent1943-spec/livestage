/* LIVE STAGE v2 — 라이브 시청 화면: 영상 · 순위판 · 라운드/미션 · 가상 후원 · 채팅 · 신고/차단 */
import { $, $$, esc, fmt, icon, avatar, router, bus, toast, modal, confirmBox, setLoading, makeCleanup, storage, CONFIG, prefersReducedMotion, hueOf } from '../core.js';
import { GIFTS, STAR_PACKAGES, giftById, rankPerformers, rankTeams, rankDeltas, roundTimeLeft, canAcceptGift, roundLabel, missionProgress, effectTier } from '../engine.js';
import { stageArt } from '../demo-data.js';

const CSS = `
.lv-mtabs{display:none}
.lv-side{display:contents}
@media(max-width:760px){.lv-mtabs{display:flex;gap:4px;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r);padding:4px;margin-top:10px}.lv-mtabs button{flex:1;padding:8px;border-radius:7px;font-weight:700;color:var(--fg-3);font-size:var(--fs-sm)}.lv-mtabs button.on{background:var(--bg-4);color:var(--fg)}.lv-side{display:block}.lv-side>[data-pane]{display:none}.lv-side>[data-pane].on{display:flex}.lv-side>.panel.chat{height:52vh}}
.lv-alerts{position:absolute;left:10px;right:10px;bottom:48px;display:grid;gap:6px;z-index:5;pointer-events:none}
.lv-alert{justify-self:start;max-width:92%;background:rgba(10,10,14,.78);border:1px solid var(--gold-line);border-radius:var(--r);padding:6px 10px;font-size:var(--fs-sm);font-weight:600;animation:up .25s var(--ease);backdrop-filter:blur(6px)}
.lv-alert.big{border-color:var(--gold);background:rgba(212,175,90,.22)}
.lv-stage{position:absolute;inset:0;width:100%;height:100%}
#vwrap .xb.viewer{top:42px!important}
.lv-vstat{position:absolute;left:10px;bottom:10px;z-index:4;display:flex;gap:6px;align-items:center}
.gift-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.gift-grid button{display:grid;gap:2px;justify-items:center;padding:10px 6px;border-radius:var(--r);border:1px solid var(--line-2);background:var(--bg-3);font-weight:700}
.gift-grid button .e{font-size:26px;line-height:1}.gift-grid button .n{font-size:var(--fs-sm)}.gift-grid button .s{font-size:var(--fs-xs);color:var(--gold-2)}
.gift-grid button.on{border-color:var(--gold);background:var(--gold-dim)}
.perf-pick{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
.perf-pick button{flex:none;display:grid;justify-items:center;gap:4px;padding:8px 10px;border-radius:var(--r);border:1px solid var(--line-2);background:var(--bg-3);font-size:var(--fs-sm);font-weight:700;min-width:76px}
.perf-pick button.on{border-color:var(--violet);background:var(--violet-dim)}
.qty{display:inline-flex;align-items:center;border:1px solid var(--line-2);border-radius:var(--r);background:var(--bg-3)}
.qty button{width:36px;height:36px;display:grid;place-items:center}.qty input{width:56px;text-align:center;border:0;background:none;height:36px;padding:0}
.sum{display:grid;gap:6px;background:var(--bg-3);border-radius:var(--r);padding:10px 12px;font-size:var(--fs-sm)}.sum div{display:flex;justify-content:space-between}.sum .tot{font-size:var(--fs-md);font-weight:800;color:var(--gold-2)}
.ms-list{display:grid;gap:6px;padding:10px 12px}
.ms{display:grid;gap:4px;padding:8px 10px;border-radius:var(--r);background:var(--bg-3);font-size:var(--fs-sm)}
.ms .t{display:flex;justify-content:space-between;gap:8px}.ms .t b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ms.done{opacity:.7}.ms.done .t b::before{content:"✓ ";color:var(--ok)}
.rules{font-size:var(--fs-sm);color:var(--fg-2);line-height:1.55}
.nickmenu{position:absolute;z-index:20;background:var(--bg-4);border:1px solid var(--line-2);border-radius:var(--r);box-shadow:var(--shadow);display:grid;min-width:140px;overflow:hidden}
.nickmenu button{text-align:left;padding:8px 12px;font-size:var(--fs-sm);font-weight:600}.nickmenu button:hover{background:var(--bg-3)}
`;
function injectCss() { if (!$('#lv-css')) { const s = document.createElement('style'); s.id = 'lv-css'; s.textContent = CSS; document.head.appendChild(s); } }

export default async function render(ctx) {
  injectCss();
  const { el, cleanup, data } = ctx;
  let id = ctx.route.seg[1];
  if (!id) { const live = await data.streams({ status: 'live' }); id = live[0]?.id; if (!id) { el.innerHTML = `<div class="page narrow"><div class="empty"><div class="ic">${icon.live}</div><b>진행 중인 방송이 없습니다</b><a class="btn" href="#/home">홈으로</a></div></div>`; return; } router.go('live/' + id, { replace: true }); }
  let s = await data.stream(id);
  if (!s) { el.innerHTML = `<div class="page narrow"><div class="empty"><div class="ic">${icon.alert}</div><b>방송을 찾을 수 없습니다</b><a class="btn" href="#/home">홈으로</a></div></div>`; return; }
  const isDemo = data.mode === 'demo';
  const me = () => data.me();
  const state = { s, view: storage.get('livestage-v2-rankview', 'round'), fxLow: storage.get('livestage-v2-fxlow', false) || prefersReducedMotion(), muted: true, pane: 'rank', prevRank: null, deltas: {}, wallet: null, sending: false };
  const perfsById = () => Object.fromEntries(s.performers.map(p => [p.id, p]));

  if (s.status === 'scheduled') return renderScheduled();
  const ended = s.status !== 'live';
  const portrait = CONFIG.orientation === 'portrait';
  el.innerHTML = `<div class="page wide" style="max-width:1400px">
    <div class="live-layout ${portrait ? 'portrait' : ''}">
      <div style="min-width:0">
        <div class="video-wrap" id="vwrap">
          ${s.playUrl && !ended ? `<video id="vid" playsinline autoplay muted></video>` : `<canvas id="stage" class="stage"></canvas>`}
          <div class="ov-top">
            <span class="pill ${ended ? 'dark' : 'live'}">${ended ? ({ ended: '종료됨', stopped: '운영자 중단' }[s.status] || '종료') : 'LIVE'}</span>
            ${s.viewers != null ? `<span class="pill dark num" id="vw">${icon.eye} ${fmt.compact(s.viewers)}${isDemo ? ' <small style="opacity:.7">시연</small>' : ''}</span>` : ''}
            <span class="pill dark">${s.playUrl && !ended ? '실제 송출' : '샘플 무대'}</span>
          </div>
          <div class="lv-alerts" id="alerts"></div>
          <div class="ov-bot">
            <button class="btn sm dark" id="fxBtn" title="효과 줄이기">${icon.sparkle}<span class="hide-sm">${state.fxLow ? '효과 최소' : '효과 켜짐'}</span></button>
            ${s.playUrl && !ended ? `<button class="btn sm" id="muteBtn">${icon.mute}<span class="hide-sm">소리 켜기</span></button>` : ''}
          </div>
          ${s.playUrl && !ended ? `<div class="vmsg" id="vmsg">서버 연결 중…</div>` : ''}
        </div>
        <div class="lv-mtabs" role="tablist"><button class="on" data-pane="rank">순위</button><button data-pane="chat">채팅</button><button data-pane="info">정보</button></div>
        <div class="row between" style="margin-top:12px;align-items:flex-start">
          <div style="min-width:0">
            <h1 style="font-size:var(--fs-lg)">${esc(s.title)}</h1>
            <div class="muted" style="font-size:var(--fs-sm);margin-top:2px"><a href="#/team/${esc(s.labelId)}"><b>${esc(s.label?.name || s.labelId)}</b></a> · 호스트 ${esc(s.hostName)} · ${esc(s.category)} · ${ended && s.endedAt ? fmt.dateTime(s.startedAt) : fmt.rel(s.startedAt) + ' 시작'}${s.mode === 'team' ? ' · 팀전' : ' · 개인전'}</div>
          </div>
          <div class="row">
            <button class="btn primary" id="giftBtn" ${ended ? 'disabled' : ''}>${icon.gift} 선물하기</button>
            <button class="btn sm ghost" id="reportBtn" title="신고">${icon.flag}</button>
            <button class="btn sm ghost" id="shareBtn" title="공유">${icon.share}</button>
          </div>
        </div>
        ${isDemo && !ended ? `<p class="dim" style="font-size:var(--fs-xs);margin-top:8px">시연 모드 — 시청자 수·채팅·후원은 가상 데이터이며, "시연·" 표시가 있는 활동은 자동 생성된 것입니다.</p>` : ''}
        <div class="lv-side" id="infoPane"></div>
      </div>
      <div class="lv-side" id="side">
        <div class="panel on" data-pane="rank" style="display:flex">
          <div class="panel-h"><span>${icon.trophy} 출연자 순위</span><div class="seg" id="rankSeg"><button data-v="round" class="${state.view === 'round' ? 'on' : ''}">라운드</button><button data-v="total" class="${state.view === 'total' ? 'on' : ''}">누적</button>${s.mode === 'team' ? `<button data-v="team" class="${state.view === 'team' ? 'on' : ''}">팀</button>` : ''}</div></div>
          <div id="roundBox"></div>
          <div class="rank-list" id="rank"></div>
          <div id="missions"></div>
        </div>
        <div class="panel chat" data-pane="chat" style="height:min(78vh,720px)">
          <div class="panel-h"><span>채팅</span><small>${isDemo ? '시연 채팅' : '실시간'}</small></div>
          <div class="chat-log" id="chatLog" aria-live="polite"></div>
          <div class="chat-in"><input id="chatIn" maxlength="200" placeholder="${ended ? '종료된 방송입니다' : (!me() ? (isDemo ? '역할을 선택하면 채팅할 수 있습니다' : '로그인 후 채팅할 수 있습니다') : '메시지 입력 · @닉네임 으로 멘션')}" ${ended ? 'disabled' : ''}><button class="btn violet" id="chatSend" ${ended ? 'disabled' : ''}>전송</button></div>
        </div>
      </div>
    </div></div>`;

  // ---------- 영상 ----------
  if (s.playUrl && !ended) playHls(s.playUrl); else drawStage();
  function playHls(url) {
    const v = $('#vid'), msg = $('#vmsg'); let retry = 0, inst = null;
    const say = t => { if (msg) msg.textContent = t; if (msg) msg.hidden = !t; };
    const start = () => {
      if (!window.Hls) { setTimeout(start, 300); return; }
      if (inst) inst.destroy();
      if (Hls.isSupported()) { inst = new Hls({ lowLatencyMode: false, liveSyncDurationCount: 3, manifestLoadingMaxRetry: 4, levelLoadingMaxRetry: 4, fragLoadingMaxRetry: 4 }); inst.loadSource(url); inst.attachMedia(v); inst.on(Hls.Events.MANIFEST_PARSED, () => { retry = 0; say(''); v.play().catch(() => {}); }); inst.on(Hls.Events.ERROR, (_, d) => { if (!d.fatal) return; retry++; say(`방송 신호를 기다리는 중… (${retry}) 송출이 시작되면 자동으로 재생됩니다`); cleanup.timeout(setTimeout(async () => { if (!v.isConnected) return; if (retry % 3 === 0) { try { const ns = await data.stream(id); if (ns?.playUrl) url = ns.playUrl; } catch (e) {} } start(); }, 5000)); }); }
      else if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url; v.addEventListener('loadedmetadata', () => { say(''); v.play().catch(() => {}); }); v.addEventListener('error', () => { retry++; say(`방송 신호를 기다리는 중… (${retry})`); cleanup.timeout(setTimeout(start, 5000)); }); }
      else say('이 브라우저는 HLS 재생을 지원하지 않습니다');
    };
    start(); cleanup(() => inst && inst.destroy());
    const mb = $('#muteBtn'); if (mb) mb.onclick = () => { v.muted = !v.muted; mb.innerHTML = v.muted ? `${icon.mute}<span class="hide-sm">소리 켜기</span>` : `${icon.volume}<span class="hide-sm">소리 끄기</span>`; v.play().catch(() => {}); };
  }
  function drawStage() {
    const c = $('#stage'); if (!c) return; const W = c.width = portrait ? 540 : 960, H = c.height = portrait ? 960 : 540; const g = c.getContext('2d'); let t = 0, raf = 0;
    const img = new Image(); img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(stageArt({ ...s, id: s.id + 'v' }, { w: W, h: H }));
    const names = s.performers.filter(p => p.active !== false).slice(0, 6);
    const loop = () => { t += 0.016; g.clearRect(0, 0, W, H); if (img.complete) g.drawImage(img, 0, 0, W, H); else { g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, W, H); }
      // 출연자 실루엣(단순 도형) — 샘플 무대
      names.forEach((p, i) => { const x = W * (0.5 + (i - (names.length - 1) / 2) * (portrait ? 0.26 : 0.16)); const y = H * (portrait ? 0.62 : 0.66) + Math.sin(t * 1.6 + i) * 4; g.fillStyle = `hsl(${p.hue ?? hueOf(p.name)} 50% 48% / .9)`; g.beginPath(); g.arc(x, y - 44, 18, 0, 7); g.fill(); g.beginPath(); g.roundRect(x - 26, y - 22, 52, 86, 14); g.fill(); g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '700 13px sans-serif'; g.textAlign = 'center'; g.fillText(p.name, x, y + 84); });
      g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '600 12px sans-serif'; g.textAlign = 'left'; g.fillText(ended ? '종료된 방송 — 결과 화면' : '샘플 무대 (실제 영상 아님)', 14, H - 14);
      if (!prefersReducedMotion() && !ended) raf = requestAnimationFrame(loop); };
    img.onload = loop; loop(); cleanup(() => cancelAnimationFrame(raf));
  }
  $('#fxBtn').onclick = () => { state.fxLow = !state.fxLow; storage.set('livestage-v2-fxlow', state.fxLow); $('#fxBtn').innerHTML = `${icon.sparkle}<span class="hide-sm">${state.fxLow ? '효과 최소' : '효과 켜짐'}</span>`; mountBoard(); toast(state.fxLow ? '효과를 최소화했습니다' : '효과를 켰습니다'); };
  $('#shareBtn').onclick = async () => { const u = location.href; if (navigator.share) { try { await navigator.share({ title: s.title, url: u }); return; } catch (e) {} } const { copyText } = await import('../core.js'); copyText(u); };
  $('#reportBtn').onclick = () => openReport();

  // ---------- 순위판 오버레이 ----------
  let board = null;
  async function mountBoard() { if (board) { board.destroy(); board = null; } try { const m = await import('../excel-board.js'); board = m.mount($('#vwrap'), { data, streamId: id, mode: 'viewer', fx: state.fxLow ? 'low' : 'full', showMissions: false }); cleanup(() => board && board.destroy()); } catch (e) { console.warn('board unavailable', e); } }
  mountBoard();

  // ---------- 순위 · 라운드 · 미션 ----------
  function renderRound() {
    const r = s.round || { no: 0, status: 'idle' }; const box = $('#roundBox'); if (!box) return;
    if (!r.no) { box.innerHTML = `<div class="panel-b" style="padding-top:8px;padding-bottom:0"><div class="note" style="font-size:var(--fs-xs)">라운드가 시작되면 라운드별 집계와 타이머가 여기 표시됩니다.</div></div>`; return; }
    const tl = roundTimeLeft(r); const acc = canAcceptGift(s, r);
    box.innerHTML = `<div class="panel-b" style="padding-bottom:4px"><div class="row between"><div><b>${esc(roundLabel(r))}</b></div><span class="pill ${r.status === 'running' ? (tl && tl.over ? 'bad' : 'gold') : r.status === 'paused' ? 'warn' : ''}" id="rtimer">${timerText(r, tl)}</span></div>${!acc.ok ? `<div class="warn" style="font-size:var(--fs-xs);margin-top:4px">${esc(acc.reason)}</div>` : acc.reason ? `<div class="dim" style="font-size:var(--fs-xs);margin-top:4px">${esc(acc.reason)}</div>` : ''}</div>`;
  }
  const timerText = (r, tl) => r.status === 'paused' ? '일시정지' : r.status === 'ended' ? '종료' : !tl ? '' : tl.over ? '시간 종료' : (tl.countUp ? '진행 ' : '남은 ') + fmt.mmss(tl.countUp ? tl.elapsed : tl.left);
  cleanup.timer(setInterval(() => { const t = $('#rtimer'); if (t && s.round) { const tl = roundTimeLeft(s.round); t.textContent = timerText(s.round, tl); if (tl && tl.over) t.className = 'pill bad'; } }, 1000));
  function renderRank(flashId) {
    const box = $('#rank'); if (!box) return;
    if (state.view === 'team' && s.mode === 'team') { const teams = rankTeams(s.performers, 'roundTotal'); const top = teams[0]?.value || 1; box.innerHTML = teams.map(t => `<div class="perf r${t.rank}"><div class="rk">${t.rank}</div><div class="avatar sm sq" style="--h:${t.team === 'A' ? 268 : 18}">${esc(t.team)}</div><div><div class="nm">${esc((s.teams || {})[t.team] || t.team + '팀')} ${t.rank === 1 && t.value > 0 ? '👑' : ''}</div><div class="amt"><b>${fmt.star(t.value)}</b> · ${t.members.map(m => esc(m.name)).join(', ')}</div></div><div></div><div class="bar"><i style="width:${Math.max(4, t.value / top * 100)}%"></i></div></div>`).join('') || `<div class="empty">출연자가 없습니다</div>`; return; }
    const key = state.view === 'total' ? 'total' : 'roundTotal'; const ranked = rankPerformers(s.performers, key); const top = ranked[0]?.value || 1;
    if (state.prevRank && key === 'roundTotal') state.deltas = rankDeltas(state.prevRank, ranked); if (key === 'roundTotal') state.prevRank = ranked;
    box.innerHTML = ranked.map(p => `<div class="perf r${p.rank} ${p.id === flashId ? 'flash' : ''}" data-pid="${p.id}"><div class="rk">${p.rank}</div>${avatar(p, 'sm')}<div style="min-width:0"><div class="nm"><a href="#/performer/${p.id}">${esc(p.name)}</a> ${p.rank === 1 && p.value > 0 ? '👑' : ''} ${s.mode === 'team' && p.team ? `<span class="tag">${esc((s.teams || {})[p.team] || p.team)}</span>` : ''} ${state.deltas[p.id] > 0 ? `<span class="delta">▲${state.deltas[p.id]}</span>` : state.deltas[p.id] < 0 ? `<span class="delta down">▼${-state.deltas[p.id]}</span>` : ''}</div><div class="amt"><b class="num">${fmt.star(p.value)}</b>${key === 'roundTotal' ? ` · 누적 ${fmt.num(p.total)}` : ''}</div></div><button class="btn sm primary" data-gift="${p.id}" ${ended ? 'disabled' : ''}>선물</button><div class="bar"><i style="width:${Math.max(4, p.share * 100)}%"></i></div></div>`).join('') || `<div class="empty">출연자가 없습니다</div>`;
    $$('[data-gift]', box).forEach(b => b.onclick = () => openGift(b.dataset.gift));
    cleanup.timeout(setTimeout(() => { state.deltas = {}; $$('.delta', box).forEach(d => d.remove()); }, 6000));
  }
  function renderMissions() {
    const box = $('#missions'); if (!box) return; const ms = (s.missions || []).slice().sort((a, b) => a.done - b.done || a.sort - b.sort); if (!ms.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="panel-h" style="border-top:1px solid var(--line)"><span>${icon.target} 선물 미션</span><small>${ms.filter(m => m.done).length}/${ms.length} 달성</small></div><div class="ms-list">${ms.map(m => { const pr = missionProgress(m, s.performers); const who = m.performerId ? (perfsById()[m.performerId] || {}).name : m.team ? ((s.teams || {})[m.team] || m.team + '팀') : '전체'; return `<div class="ms ${m.done ? 'done' : ''}"><div class="t"><b>${esc(m.title)}</b><span class="num ${m.done ? 'ok' : 'muted'}">${m.done ? '달성' : m.kind === 'single' ? `한 번에 ${fmt.num(m.threshold)}` : `${fmt.compact(pr.cur)}/${fmt.compact(m.threshold)}`}</span></div><div class="dim" style="font-size:var(--fs-xs)">${esc(who)} · ${m.kind === 'single' ? '한 번에' : '라운드 누적'}${m.done && m.doneBy ? ` · ${esc(m.doneBy)}` : ''}</div>${m.kind === 'round' && !m.done ? `<div class="progress"><i style="width:${pr.ratio * 100}%"></i></div>` : ''}</div>`; }).join('')}</div>`;
  }
  function renderInfo() {
    const box = $('#infoPane'); if (!box) return;
    box.innerHTML = `<div class="panel" data-pane="info" style="margin-top:12px"><div class="panel-h"><span>${icon.info} 방송 정보</span></div><div class="panel-b stack">
      ${s.desc ? `<p class="muted" style="font-size:var(--fs-sm)">${esc(s.desc)}</p>` : ''}
      <div><div class="eyebrow" style="margin-bottom:4px">방송 규칙</div><div class="rules">${esc(s.rules || '별도 규칙 없음')}<br><span class="dim">· 일시정지 중에는 후원이 접수되지 않습니다 · 라운드 마감 후 후원은 누적에만 반영됩니다</span></div></div>
      <div class="row">${s.performers.filter(p => p.active !== false).map(p => `<a class="fan-badge" href="#/performer/${p.id}">${avatar(p, 'sm')} ${esc(p.name)}</a>`).join('')}</div>
      ${s.moderators?.length ? `<div class="dim" style="font-size:var(--fs-xs)">모더레이터: ${s.moderators.map(esc).join(', ')}</div>` : ''}
    </div></div>`;
  }
  renderRound(); renderRank(); renderMissions(); renderInfo();
  $$('#rankSeg button').forEach(b => b.onclick = () => { state.view = b.dataset.v; storage.set('livestage-v2-rankview', state.view); $$('#rankSeg button').forEach(x => x.classList.toggle('on', x === b)); renderRank(); });
  $$('.lv-mtabs button').forEach(b => b.onclick = () => { $$('.lv-mtabs button').forEach(x => x.classList.toggle('on', x === b)); $$('[data-pane]', el).forEach(p => { if (p.tagName !== 'BUTTON') p.classList.toggle('on', p.dataset.pane === b.dataset.pane); }); });

  // ---------- 채팅 ----------
  const log = $('#chatLog'); const blocked = () => data.blocked();
  function addMsg(m) { if (!log || blocked().includes(m.nick)) return; const mine = me() && (m.userId === me().id || m.nick === me().nick); const mention = me() && m.text && m.text.includes('@' + me().nick); const cls = ['gift', 'round', 'mission'].includes(m.kind) ? 'gift' : m.kind === 'system' ? 'sys' : mine ? 'me' : mention ? 'mention' : (s.moderators || []).includes(m.nick) ? 'mod' : ''; const d = document.createElement('div'); d.className = 'msg ' + cls; d.dataset.nick = m.nick; d.innerHTML = cls === 'sys' ? esc(m.text) : `<span class="u" role="button" tabindex="0">${esc(m.nick)}</span>${esc(m.text)}`; log.appendChild(d); while (log.children.length > 120) log.firstChild.remove(); log.scrollTop = log.scrollHeight; }
  try { (await data.messages(id, 40)).forEach(addMsg); } catch (e) { addMsg({ kind: 'system', text: '채팅을 불러오지 못했습니다: ' + e.message }); }
  if (!ended) addMsg({ kind: 'system', text: `${s.label?.name || ''} 채널 채팅입니다. 서로 존중하는 대화 부탁드립니다.` });
  const sendChat = async () => { const i = $('#chatIn'); const t = i.value.trim(); if (!t) return; if (!me()) { isDemo ? ctx.openRole() : ctx.openAuth(); return; } const b = $('#chatSend'); setLoading(b, true); try { await data.sendMessage(id, t); i.value = ''; } catch (e) { toast(e.message, 'bad'); } finally { setLoading(b, false); i.focus(); } };
  $('#chatSend').onclick = sendChat; $('#chatIn').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  log.addEventListener('click', e => { const u = e.target.closest('.u'); if (!u) return; openNickMenu(u, u.textContent); });
  function openNickMenu(anchor, nick) { $$('.nickmenu').forEach(x => x.remove()); if (nick === me()?.nick) return; const m = document.createElement('div'); m.className = 'nickmenu'; m.innerHTML = `<button data-a="mention">@${esc(nick)} 멘션</button><button data-a="report">신고</button><button data-a="block">차단</button>`; const r = anchor.getBoundingClientRect(); m.style.left = Math.min(r.left, innerWidth - 160) + 'px'; m.style.top = (r.bottom + 4) + 'px'; m.style.position = 'fixed'; document.body.appendChild(m); const close = () => m.remove(); setTimeout(() => document.addEventListener('click', close, { once: true }), 0);
    m.onclick = async e => { const a = e.target.dataset.a; if (a === 'mention') { const i = $('#chatIn'); i.value = `@${nick} ` + i.value; i.focus(); } if (a === 'report') openReport(nick); if (a === 'block') { if (await confirmBox({ title: `${nick} 차단`, text: '이 이용자의 채팅이 내 화면에서 보이지 않습니다. (이 기기에만 적용)', ok: '차단', danger: true })) { await data.block(nick); $$(`.msg[data-nick="${CSS.escape(nick)}"]`, log).forEach(x => x.remove()); toast('차단했습니다'); } } }; }

  // ---------- 알림 ----------
  function alert(text, big) { const a = $('#alerts'); if (!a) return; const d = document.createElement('div'); d.className = 'lv-alert' + (big ? ' big' : ''); d.textContent = text; a.appendChild(d); while (a.children.length > 3) a.firstChild.remove(); cleanup.timeout(setTimeout(() => d.remove(), big ? 6000 : 3500)); }

  // ---------- 실시간 ----------
  cleanup(data.subscribe(id, {
    onPerformers: list => { s.performers = list; renderRank(); renderMissions(); },
    onGift: g => { const p = perfsById()[g.performerId]; alert(`${g.emoji} ${g.nick} 님이 ${p?.name || ''} 에게 ${g.gift} (${fmt.star(g.stars)})`, effectTier(g.stars) !== 'small'); renderRank(g.performerId); },
    onRound: r => { const was = s.round?.status; s.round = r; renderRound(); if (r.status === 'running' && was !== 'running' && (was !== 'paused')) { s.performers.forEach(p => p.roundTotal = 0); renderRank(); } renderMissions(); },
    onMission: m => { if (m._deleted) s.missions = (s.missions || []).filter(x => x.id !== m.id); else { const i = (s.missions || []).findIndex(x => x.id === m.id); if (i >= 0) { const was = s.missions[i].done; s.missions[i] = m; if (m.done && !was) alert(`🎯 미션 달성! ${m.title}`, true); } else s.missions.push(m); } renderMissions(); },
    onMessage: addMsg,
    onStream: ns => { if (ns.status !== s.status) { toast(ns.status === 'stopped' ? '운영자가 방송을 중단했습니다' : '방송이 종료되었습니다', 'warn'); router.go('live/' + id, { replace: true }); } else { Object.assign(s, ns); renderInfo(); } },
  }));
  cleanup(bus.on('wallet', w => { state.wallet = w; }));
  if (isDemo && !ended) cleanup.timer(setInterval(() => { const v = $('#vw'); if (v && s.viewers != null) { s.viewers = Math.max(1, s.viewers + Math.round((Math.random() - .45) * 8)); v.innerHTML = `${icon.eye} ${fmt.compact(s.viewers)} <small style="opacity:.7">시연</small>`; } }, 6000));

  // ---------- 가상 후원 ----------
  $('#giftBtn').onclick = () => openGift();
  window.LiveStageGift = (pid, preset) => openGift(pid, preset); cleanup(() => { delete window.LiveStageGift; });
  async function openGift(preId, preset = {}) {
    if (!me()) { toast(isDemo ? '역할을 먼저 선택하세요' : '로그인이 필요합니다'); isDemo ? ctx.openRole() : ctx.openAuth(); return; }
    const acc = canAcceptGift(s, s.round); if (!acc.ok) { toast(acc.reason, 'warn'); return; }
    let wallet = null; try { wallet = await data.wallet(); } catch (e) {}
    const st = { pid: preId || preset.pid || rankPerformers(s.performers, 'roundTotal')[0]?.id, gid: preset.gid || 'heart', qty: preset.qty || 1 };
    const m = modal({ title: '선물하기', body: `
      <div class="dim" style="font-size:var(--fs-xs)">${isDemo ? '시연용 가상 포인트입니다. 실제 결제·지급이 아닙니다.' : '보유 스타에서 차감됩니다.'}${acc.countsForRound ? '' : ' · ' + (acc.reason || '')}</div>
      <div><div class="eyebrow" style="margin-bottom:6px">받을 출연자</div><div class="perf-pick" id="gPerf">${s.performers.filter(p => p.active !== false).map(p => `<button data-p="${p.id}" class="${p.id === st.pid ? 'on' : ''}">${avatar(p, 'sm')}<span>${esc(p.name)}</span></button>`).join('')}</div></div>
      <div><div class="eyebrow" style="margin-bottom:6px">선물</div><div class="gift-grid" id="gGrid">${GIFTS.map(g => `<button data-g="${g.id}" class="${g.id === st.gid ? 'on' : ''}"><span class="e">${g.emoji}</span><span class="n">${g.name}</span><span class="s num">${fmt.num(g.stars)}</span></button>`).join('')}</div></div>
      <div class="row between"><div class="eyebrow">수량</div><div class="qty"><button id="qm" aria-label="줄이기">${icon.minus}</button><input id="qv" type="number" min="1" max="99" value="${st.qty}" aria-label="수량"><button id="qp" aria-label="늘리기">${icon.plus}</button></div></div>
      <div class="sum" id="gSum"></div>
      <div id="gErr" class="note bad" hidden></div>`, footer: `<button class="btn ghost" data-close>취소</button><button class="btn primary" id="gGo">보내기</button>` });
    const sum = () => { const g = giftById(st.gid), p = perfsById()[st.pid]; const cost = g.stars * st.qty; const left = wallet == null ? null : wallet - cost; $('#gSum').innerHTML = `<div><span>대상</span><b>${esc(p?.name || '-')}</b></div><div><span>선물</span><b>${g.emoji} ${g.name} × ${st.qty}</b></div><div><span>사용 스타</span><b class="tot num">${fmt.star(cost)}</b></div>${wallet != null ? `<div><span>보유 → 남는 잔액</span><b class="num ${left < 0 ? 'bad' : ''}">${fmt.num(wallet)} → ${fmt.num(left)}</b></div>` : ''}`; $('#gGo').disabled = !p; };
    sum();
    $$('#gPerf button').forEach(b => b.onclick = () => { st.pid = b.dataset.p; $$('#gPerf button').forEach(x => x.classList.toggle('on', x === b)); sum(); });
    $$('#gGrid button').forEach(b => b.onclick = () => { st.gid = b.dataset.g; $$('#gGrid button').forEach(x => x.classList.toggle('on', x === b)); sum(); });
    const setQ = n => { st.qty = Math.max(1, Math.min(99, Math.floor(Number(n) || 1))); $('#qv').value = st.qty; sum(); };
    $('#qm').onclick = () => setQ(st.qty - 1); $('#qp').onclick = () => setQ(st.qty + 1); $('#qv').onchange = () => setQ($('#qv').value);
    $('#gGo').onclick = async () => {
      if (state.sending) return; state.sending = true; const b = $('#gGo'); setLoading(b, true); const errEl = $('#gErr'); errEl.hidden = true;
      try { const r = await data.sendGift({ streamId: id, performerId: st.pid, giftId: st.gid, qty: st.qty }); m.close(); toast(`선물 완료 · 거래번호 ${r.txn}${r.countsForRound === false ? ' (누적에만 반영)' : ''}`, 'ok', 4000); if (r.missions?.length) r.missions.forEach(x => toast(`🎯 미션 달성: ${x.title}`, 'ok', 5000)); }
      catch (e) { if (e.code === 'INSUFFICIENT') { m.close(); openCharge({ ...st }, e.message); } else if (e.code === 'AUTH') { m.close(); isDemo ? ctx.openRole() : ctx.openAuth(); } else { errEl.hidden = false; errEl.textContent = e.message; } }
      finally { state.sending = false; setLoading(b, false); }
    };
  }
  function openCharge(back, reason) {
    if (!isDemo) { modal({ title: '스타 충전', body: `<div class="note warn">${esc(reason || '')}</div><p class="muted" style="font-size:var(--fs-sm)">서버 연동 모드의 충전은 토스페이먼츠 테스트 결제 화면에서 진행합니다. 시연 모드에서는 가상 충전을 바로 할 수 있습니다.</p>`, footer: `<button class="btn ghost" data-close>닫기</button>` }); return; }
    const m = modal({ title: '가상 충전', body: `${reason ? `<div class="note warn">${esc(reason)}</div>` : ''}<p class="dim" style="font-size:var(--fs-xs)">시연용 가상 포인트 — 결제창이나 카드 정보 입력이 없습니다.</p><div class="gift-grid" id="pk">${STAR_PACKAGES.map(p => `<button data-pk="${p.id}"><span class="e">⭐</span><span class="n num">${fmt.num(p.stars)}</span><span class="s">${fmt.krw(p.krw)} (가상)</span></button>`).join('')}</div>`, footer: `<button class="btn ghost" data-close>닫기</button>` });
    $$('#pk button').forEach(b => b.onclick = async () => { $$('#pk button').forEach(setLoadingAll => setLoading(setLoadingAll, true)); try { const r = await data.charge(b.dataset.pk); toast(`충전 완료 · 잔액 ${fmt.star(r.balance)} · ${r.txn}`, 'ok'); m.close(); if (back) openGift(back.pid, back); } catch (e) { toast(e.message, 'bad'); $$('#pk button').forEach(x => setLoading(x, false)); } });
  }
  function openReport(target = '') {
    if (!me()) { isDemo ? ctx.openRole() : ctx.openAuth(); return; }
    const m = modal({ title: '신고하기', body: `<form id="rpForm" class="form"><label class="field"><span>대상 (닉네임 또는 방송)</span><input name="target" required maxlength="40" value="${esc(target)}" placeholder="닉네임"></label><label class="field"><span>사유</span><select name="reason">${['채팅 욕설·비하', '스팸·광고', '후원 강요 의심', '불법·유해 콘텐츠', '기타'].map(r => `<option>${r}</option>`).join('')}</select></label><label class="field"><span>상세 (선택)</span><textarea name="detail" maxlength="300" placeholder="상황을 간단히 적어주세요"></textarea></label><p class="dim" style="font-size:var(--fs-xs)">접수된 신고는 운영자가 검토합니다. 허위 신고는 제재될 수 있습니다.</p></form>`, footer: `<button class="btn ghost" data-close>취소</button><button class="btn danger" id="rpGo">신고 접수</button>` });
    $('#rpGo').onclick = async () => { const f = new FormData($('#rpForm')); if (!f.get('target')) { toast('대상을 입력하세요', 'warn'); return; } setLoading($('#rpGo'), true); try { await data.report({ streamId: id, target: f.get('target'), reason: f.get('reason'), detail: f.get('detail') }); m.close(); toast('신고가 접수되었습니다', 'ok'); } catch (e) { toast(e.message, 'bad'); setLoading($('#rpGo'), false); } };
  }

  // ---------- 종료된 방송: 결과 ----------
  if (ended) renderResults();
  async function renderResults() {
    let rounds = []; try { rounds = await data.rounds(id); } catch (e) {}
    const final = rankPerformers(s.performers, 'total');
    const box = document.createElement('div'); box.className = 'panel'; box.style.marginTop = '12px';
    box.innerHTML = `<div class="panel-h"><span>${icon.trophy} 최종 결과</span><small>${s.status === 'stopped' ? '운영자 중단' : '방송 종료'}${s.endedAt ? ' · ' + fmt.dateTime(s.endedAt) : ''}</small></div><div class="panel-b stack">
      <div class="grid stats">${final.slice(0, 3).map(p => `<div class="stat"><div class="k">${p.rank}위${p.rank === 1 ? ' 👑' : ''}</div><div class="v" style="font-size:var(--fs-lg)">${avatar(p, 'sm')} ${esc(p.name)}</div><div class="dim num" style="font-size:var(--fs-sm)">${fmt.star(p.total)}</div></div>`).join('')}</div>
      ${rounds.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>라운드</th><th>제목</th><th>우승</th><th class="r">합계</th></tr></thead><tbody>${rounds.map(r => `<tr><td class="num">${r.no}</td><td>${esc(r.title || '')}</td><td>${r.winnerName ? '👑 ' + esc(r.winnerName) : '-'}</td><td class="r num">${fmt.num(r.total)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="row"><a class="btn" href="#/settle/${id}">${icon.receipt} 정산 명세 (시뮬레이션)</a><a class="btn ghost" href="#/team/${esc(s.labelId)}">방송팀 페이지</a></div></div>`;
    $('#infoPane').before(box);
  }

  // ---------- 예정 방송 ----------
  function renderScheduled() {
    const remind = storage.get('livestage-v2-remind', []); const on = remind.includes(id);
    el.innerHTML = `<div class="page narrow"><div class="card" style="overflow:hidden"><div style="aspect-ratio:16/8;position:relative">${stageArt(s)}<div class="ov-top" style="position:absolute;left:12px;top:12px"><span class="pill dark">${icon.calendar} ${fmt.dateTime(s.startedAt)} · ${fmt.until(s.startedAt)}</span></div></div>
      <div class="panel-b stack" style="padding:18px"><div class="eyebrow">예정 방송</div><h1 style="font-size:var(--fs-xl)">${esc(s.title)}</h1><div class="muted"><a href="#/team/${esc(s.labelId)}"><b>${esc(s.label?.name || '')}</b></a> · 호스트 ${esc(s.hostName)} · ${esc(s.category)}</div>${s.desc ? `<p class="muted">${esc(s.desc)}</p>` : ''}
      <div class="row">${s.performers.map(p => `<a class="fan-badge" href="#/performer/${p.id}">${avatar(p, 'sm')} ${esc(p.name)}</a>`).join('')}</div>
      <div class="row"><button class="btn ${on ? '' : 'primary'}" id="remBtn">${icon.bell} ${on ? '알림 설정됨' : '시작 알림 받기'}</button><a class="btn ghost" href="#/home">다른 방송 보기</a></div>
      <p class="dim" style="font-size:var(--fs-xs)">알림은 이 기기 브라우저에만 저장됩니다 (외부 알림 서비스 없음).</p></div></div></div>`;
    $('#remBtn').onclick = () => { const r = storage.get('livestage-v2-remind', []); const i = r.indexOf(id); i >= 0 ? r.splice(i, 1) : r.push(id); storage.set('livestage-v2-remind', r); toast(i >= 0 ? '알림을 해제했습니다' : '시작 알림을 설정했습니다', 'ok'); renderScheduled(); };
  }
}
