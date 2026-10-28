/* LIVE STAGE — 엑셀 판 (출연자별 후원 집계·순위·라운드·미션·선물 이펙트)
   뷰어(index.html 라이브 탭)와 OBS 오버레이(overlay.html)가 같이 씀.
   사용:  const b = ExcelBoard.mount(el, { sb, streamId, mode: 'viewer'|'obs', scale: 1 });  b.destroy();  */
(function () {
  const CSS = `
.xb{position:absolute;left:10px;top:44px;width:min(46%,250px);font-family:"Noto Sans KR",-apple-system,system-ui,sans-serif;font-size:12px;line-height:1.3;color:#f1efe8;pointer-events:none;z-index:5;--xs:1}
.xb *{box-sizing:border-box}
.xb.obs{left:24px;top:24px;width:420px;font-size:17px}
.xb .xb-card{background:rgba(10,10,14,.72);border:1px solid rgba(217,180,90,.35);border-radius:10px;overflow:hidden;backdrop-filter:blur(6px)}
.xb .xb-h{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 9px;background:linear-gradient(90deg,rgba(217,180,90,.28),rgba(139,108,246,.18));border-bottom:1px solid rgba(217,180,90,.3);font-weight:800;letter-spacing:.02em}
.xb .xb-h .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.xb .xb-h .tm{font-variant-numeric:tabular-nums;color:#f0d48a;font-weight:900;flex:none}
.xb .xb-h .tm.over{color:#e5484d;animation:xbblink 1s steps(2) infinite}
.xb .xb-rows{position:relative;padding:4px 0}
.xb .xb-row{display:grid;grid-template-columns:18px 20px minmax(0,1fr) auto;align-items:center;gap:5px;padding:3px 9px;transition:transform .55s cubic-bezier(.2,.8,.2,1);position:relative}
.xb .xb-row .rk{font-weight:900;color:#f0d48a;text-align:center;font-size:.95em}
.xb .xb-row.r1 .rk{color:#ffd54a}
.xb .xb-row .em{font-size:1.15em;text-align:center}
.xb .xb-row .nm{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xb .xb-row .nm small{color:#ffd54a;margin-left:3px}
.xb .xb-row .st{font-variant-numeric:tabular-nums;font-weight:900;color:#f0d48a}
.xb .xb-row .bar{grid-column:3/5;height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;margin-top:1px}
.xb .xb-row .bar i{display:block;height:100%;background:linear-gradient(90deg,#d9b45a,#f0d48a);transition:width .6s}
.xb .xb-row.r1 .bar i{background:linear-gradient(90deg,#ffb300,#ffe066)}
.xb .xb-row.flash{animation:xbflash .9s ease-out}
.xb .xb-f{display:flex;justify-content:space-between;padding:4px 9px;border-top:1px solid rgba(255,255,255,.08);color:#a9a7a0;font-size:.9em}
.xb .xb-f b{color:#f1efe8;font-variant-numeric:tabular-nums}
.xb .xb-m{margin-top:6px;display:grid;gap:4px}
.xb .xb-mi{background:rgba(10,10,14,.7);border:1px solid rgba(139,108,246,.4);border-radius:8px;padding:4px 8px;display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;font-size:.92em}
.xb .xb-mi.done{border-color:rgba(62,207,142,.6);opacity:.85}
.xb .xb-mi .mt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xb .xb-mi .mp{color:#c9b8ff;font-variant-numeric:tabular-nums;font-weight:700;flex:none}
.xb .xb-mi.done .mp{color:#3ecf8e}
.xb .xb-mi .mb{grid-column:1/3;height:2px;background:rgba(255,255,255,.1);border-radius:1px;overflow:hidden}
.xb .xb-mi .mb i{display:block;height:100%;background:#8b6cf6;transition:width .5s}
.xb-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:6}
.xb-fx .fl{position:absolute;bottom:18%;font-size:28px;animation:xbfloat 2.4s ease-out forwards;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))}
.xb-fx .burst{position:absolute;left:50%;top:45%;font-size:44px;animation:xbburst 1.6s ease-out forwards;filter:drop-shadow(0 2px 8px rgba(0,0,0,.7))}
.xb-fx .big{position:absolute;inset:0;display:grid;place-items:center;text-align:center;background:radial-gradient(ellipse at center,rgba(217,180,90,.35),rgba(0,0,0,.55) 70%);animation:xbbig 5s ease-out forwards}
.xb-fx .big .e{font-size:96px;animation:xbpulse 1s ease-in-out infinite alternate;filter:drop-shadow(0 0 24px rgba(255,214,74,.9))}
.xb-fx .big .t{font-size:26px;font-weight:900;color:#ffe066;text-shadow:0 2px 12px rgba(0,0,0,.8);margin-top:6px}
.xb-fx .big .s{font-size:15px;color:#f1efe8;text-shadow:0 1px 6px rgba(0,0,0,.8)}
.xb-fx .rain{position:absolute;top:-40px;font-size:30px;animation:xbrain linear forwards}
.xb-fx .banner{position:absolute;left:50%;top:14%;transform:translateX(-50%);background:rgba(10,10,14,.85);border:2px solid #ffd54a;border-radius:14px;padding:12px 20px;text-align:center;animation:xbbanner 6s ease forwards;min-width:60%}
.xb-fx .banner .e{font-size:40px}.xb-fx .banner .t{font-size:18px;font-weight:900;color:#ffe066}.xb-fx .banner .s{font-size:13px;color:#f1efe8}
.xb-fx .banner.mission{border-color:#8b6cf6}.xb-fx .banner.mission .t{color:#c9b8ff}
.xb.obs ~ .xb-fx .fl{font-size:44px}.xb.obs ~ .xb-fx .burst{font-size:72px}.xb.obs ~ .xb-fx .big .e{font-size:150px}.xb.obs ~ .xb-fx .big .t{font-size:40px}.xb.obs ~ .xb-fx .big .s{font-size:22px}.xb.obs ~ .xb-fx .banner .t{font-size:30px}.xb.obs ~ .xb-fx .banner .s{font-size:20px}.xb.obs ~ .xb-fx .banner .e{font-size:64px}
@keyframes xbflash{0%{background:rgba(255,214,74,.55)}100%{background:transparent}}
@keyframes xbblink{50%{opacity:.3}}
@keyframes xbfloat{0%{transform:translateY(0) scale(.8);opacity:0}15%{opacity:1}100%{transform:translateY(-160px) scale(1.2);opacity:0}}
@keyframes xbburst{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}25%{transform:translate(-50%,-50%) scale(1.3);opacity:1}100%{transform:translate(-50%,-50%) scale(1) translateY(-40px);opacity:0}}
@keyframes xbbig{0%{opacity:0}8%{opacity:1}85%{opacity:1}100%{opacity:0}}
@keyframes xbpulse{from{transform:scale(1)}to{transform:scale(1.15)}}
@keyframes xbrain{to{transform:translateY(120vh) rotate(360deg)}}
@keyframes xbbanner{0%{opacity:0;transform:translateX(-50%) translateY(-20px)}10%{opacity:1;transform:translateX(-50%) translateY(0)}85%{opacity:1}100%{opacity:0}}
`;
  function injectCss() { if (document.getElementById('xb-css')) return; const st = document.createElement('style'); st.id = 'xb-css'; st.textContent = CSS; document.head.appendChild(st); }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = n => Number(n || 0).toLocaleString('ko-KR');

  function mount(host, opts) {
    injectCss();
    const { sb, streamId, mode = 'viewer' } = opts;
    const root = document.createElement('div'); root.className = 'xb' + (mode === 'obs' ? ' obs' : '');
    const fx = document.createElement('div'); fx.className = 'xb-fx';
    host.appendChild(root); host.appendChild(fx);
    const st = { stream: null, performers: [], missions: [], channel: null, timer: null, prevPos: {}, lastRoundStatus: null, lastRoundNo: null, dead: false };

    async function load() {
      const [{ data: s }, { data: p }, { data: m }] = await Promise.all([
        sb.from('streams').select('id,round_no,round_title,round_started_at,round_ends_at,round_status').eq('id', streamId).maybeSingle(),
        sb.from('performers').select('id,name,emoji,total,round_total,sort').eq('stream_id', streamId).order('sort'),
        sb.from('missions').select('*').eq('stream_id', streamId).order('sort'),
      ]);
      st.stream = s || {}; st.performers = (p || []).filter(x => x.sort >= 0); st.missions = m || [];
      st.lastRoundStatus = st.stream.round_status; st.lastRoundNo = st.stream.round_no;
      render();
    }
    function totalKey() { return st.stream && st.stream.round_no > 0 ? 'round_total' : 'total'; }
    function sorted() { const k = totalKey(); return [...st.performers].sort((a, b) => Number(b[k]) - Number(a[k]) || a.sort - b.sort); }
    function timeLeft() {
      const s = st.stream; if (!s || s.round_status !== 'running') return null;
      if (!s.round_ends_at) { const el = Math.max(0, Date.now() - new Date(s.round_started_at)); return { text: fmt(el), over: false, up: true }; }
      const left = new Date(s.round_ends_at) - Date.now(); return { text: fmt(Math.max(0, left)), over: left <= 0 };
    }
    const fmt = ms => { const t = Math.floor(ms / 1000); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };

    function render() {
      const s = st.stream || {}; const list = sorted(); const k = totalKey();
      const top = Number(list[0]?.[k]) || 1; const sum = list.reduce((a, p) => a + Number(p[k] || 0), 0);
      const tl = timeLeft();
      const head = s.round_no > 0 ? `라운드 ${s.round_no}${s.round_title ? ' · ' + esc(s.round_title) : ''}${s.round_status === 'ended' ? ' · 종료' : ''}` : '후원 순위';
      // FLIP: 이전 위치 기억
      const before = {}; root.querySelectorAll('.xb-row').forEach(r => before[r.dataset.id] = r.getBoundingClientRect().top);
      root.innerHTML = `<div class="xb-card">
        <div class="xb-h"><span class="t">📊 ${head}</span>${tl ? `<span class="tm ${tl.over ? 'over' : ''}">${tl.over ? '시간 종료' : (tl.up ? '⏱ ' : '⏳ ') + tl.text}</span>` : ''}</div>
        <div class="xb-rows">${list.map((p, i) => `<div class="xb-row r${i + 1}" data-id="${p.id}"><span class="rk">${i + 1}</span><span class="em">${esc(p.emoji)}</span><span class="nm">${esc(p.name)}${i === 0 && Number(p[k]) > 0 ? '<small>👑</small>' : ''}</span><span class="st">${num(p[k])}</span><span class="bar"><i style="width:${Math.max(3, Number(p[k]) / top * 100)}%"></i></span></div>`).join('') || '<div class="xb-row"><span></span><span></span><span class="nm" style="color:#a9a7a0">출연자 없음</span></div>'}</div>
        <div class="xb-f"><span>합계</span><b>${num(sum)} 스타</b></div></div>
        ${st.missions.length ? `<div class="xb-m">${st.missions.map(m => { const pr = progress(m); return `<div class="xb-mi ${m.done ? 'done' : ''}" data-id="${m.id}"><span class="mt">${m.done ? '✅' : '🎯'} ${esc(m.title)}${m.performer_id ? ' · ' + esc((st.performers.find(p => p.id === m.performer_id) || {}).name || '') : ''}</span><span class="mp">${m.done ? '달성' : (m.kind === 'single' ? '한 번에 ' + num(m.threshold) : num(pr.cur) + '/' + num(m.threshold))}</span>${m.kind === 'round' && !m.done ? `<span class="mb"><i style="width:${Math.min(100, pr.cur / m.threshold * 100)}%"></i></span>` : ''}</div>`; }).join('')}</div>` : ''}`;
      // FLIP 애니메이션
      root.querySelectorAll('.xb-row').forEach(r => { const b = before[r.dataset.id]; if (b == null) return; const d = b - r.getBoundingClientRect().top; if (!d) return; r.style.transition = 'none'; r.style.transform = `translateY(${d}px)`; requestAnimationFrame(() => { r.style.transition = ''; r.style.transform = ''; }); });
    }
    function progress(m) {
      if (m.kind !== 'round') return { cur: 0 };
      if (m.performer_id) return { cur: Number((st.performers.find(p => p.id === m.performer_id) || {}).round_total || 0) };
      return { cur: st.performers.reduce((a, p) => a + Number(p.round_total || 0), 0) };
    }
    function flash(pid) { const r = root.querySelector(`.xb-row[data-id="${pid}"]`); if (r) { r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); } }

    // ---- 이펙트 ----
    function giftFx(g) {
      const p = st.performers.find(x => x.id === g.performer_id) || {};
      const stars = Number(g.stars);
      if (stars >= 1000) { // 대형: 전체 연출 + 이모지 비
        const d = document.createElement('div'); d.className = 'big';
        d.innerHTML = `<div><div class="e">${esc(g.emoji)}</div><div class="t">${esc(g.nick)} 님의 ${esc(g.gift)} ${num(stars)} 스타!</div><div class="s">→ ${esc(p.emoji || '')} ${esc(p.name || '')}</div></div>`;
        fx.appendChild(d); setTimeout(() => d.remove(), 5000);
        const n = stars >= 5000 ? 40 : 18;
        for (let i = 0; i < n; i++) { const r = document.createElement('div'); r.className = 'rain'; r.textContent = g.emoji; r.style.left = Math.random() * 100 + '%'; r.style.animationDuration = (2.2 + Math.random() * 2) + 's'; r.style.animationDelay = (Math.random() * 1.8) + 's'; r.style.fontSize = (22 + Math.random() * 26) + 'px'; fx.appendChild(r); setTimeout(() => r.remove(), 5000); }
      } else if (stars >= 100) { // 중간: 중앙 버스트
        const d = document.createElement('div'); d.className = 'burst'; d.textContent = g.emoji; fx.appendChild(d); setTimeout(() => d.remove(), 1700);
        for (let i = 0; i < 6; i++) floatEmoji(g.emoji);
      } else { for (let i = 0; i < 2; i++) floatEmoji(g.emoji); }
      flash(g.performer_id);
    }
    function floatEmoji(e) { const d = document.createElement('div'); d.className = 'fl'; d.textContent = e; d.style.left = (15 + Math.random() * 70) + '%'; d.style.animationDelay = (Math.random() * .6) + 's'; fx.appendChild(d); setTimeout(() => d.remove(), 3200); }
    function banner(cls, e, t, s) { const d = document.createElement('div'); d.className = 'banner ' + cls; d.innerHTML = `<div class="e">${e}</div><div class="t">${t}</div><div class="s">${s || ''}</div>`; fx.appendChild(d); setTimeout(() => d.remove(), 6000); }

    // ---- 실시간 ----
    st.channel = sb.channel('xb-' + streamId + '-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'performers', filter: 'stream_id=eq.' + streamId }, ({ new: p }) => {
        const lp = st.performers.find(x => x.id === p.id); if (lp) Object.assign(lp, p); else if (p.sort >= 0) st.performers.push(p);
        st.performers = st.performers.filter(x => x.sort >= 0); render();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'performers', filter: 'stream_id=eq.' + streamId }, ({ new: p }) => { if (p.sort >= 0) st.performers.push(p); render(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gifts', filter: 'stream_id=eq.' + streamId }, ({ new: g }) => giftFx(g))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'streams', filter: 'id=eq.' + streamId }, ({ new: s }) => {
        const prevStatus = st.lastRoundStatus, prevNo = st.lastRoundNo; st.stream = Object.assign(st.stream || {}, s);
        if (s.round_status === 'running' && (prevStatus !== 'running' || prevNo !== s.round_no)) { st.performers.forEach(p => p.round_total = 0); banner('', '🏁', `라운드 ${s.round_no} 시작!`, s.round_title || ''); }
        if (s.round_status === 'ended' && prevStatus === 'running') { const w = sorted()[0]; if (w && Number(w.round_total) > 0) banner('', '👑', `라운드 ${s.round_no} 우승 — ${esc(w.emoji)} ${esc(w.name)}`, `${num(w.round_total)} 스타`); }
        st.lastRoundStatus = s.round_status; st.lastRoundNo = s.round_no; render();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions', filter: 'stream_id=eq.' + streamId }, ({ eventType, new: m, old }) => {
        if (eventType === 'DELETE') st.missions = st.missions.filter(x => x.id !== old.id);
        else { const i = st.missions.findIndex(x => x.id === m.id); const was = i >= 0 ? st.missions[i].done : false; if (i >= 0) st.missions[i] = m; else st.missions.push(m); if (m.done && !was) banner('mission', '🎯', '미션 달성!', esc(m.title) + (m.done_by ? ' — ' + esc(m.done_by) + ' 님' : '')); }
        st.missions.sort((a, b) => a.sort - b.sort); render();
      })
      .subscribe();
    st.timer = setInterval(() => { const h = root.querySelector('.xb-h .tm'); const tl = timeLeft(); if (!tl && !h) return; if (!tl || !h) { render(); return; } h.textContent = tl.over ? '시간 종료' : (tl.up ? '⏱ ' : '⏳ ') + tl.text; h.classList.toggle('over', !!tl.over); }, 1000);
    load();
    return { destroy() { st.dead = true; clearInterval(st.timer); if (st.channel) sb.removeChannel(st.channel); root.remove(); fx.remove(); }, reload: load, giftFx, banner };
  }
  window.ExcelBoard = { mount };
})();
