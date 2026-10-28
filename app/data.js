/* LIVE STAGE v2 — 데이터 계층.  모든 화면은 이 모듈만 통해 데이터를 읽고 쓴다.
   mode 'demo'  : 브라우저 안 시연 데이터 (localStorage), 가상 포인트, 역할 전환 가능
   mode 'server': Supabase (인증·RLS·RPC). 권한은 서버가 판정. 실패를 성공처럼 숨기지 않음 */
import { CONFIG, bus, storage, uid, sleep } from './core.js';
import { GIFTS, STAR_PACKAGES, giftById, canAcceptGift, missionsAchieved, rankPerformers } from './engine.js';
import { seedDemo, DEMO_ROLES } from './demo-data.js';

export class DataError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }
const notSupported = f => { throw new DataError('NOT_SUPPORTED', `서버 모드에서는 아직 지원하지 않는 기능입니다 (${f}) — 시연 모드에서 체험할 수 있습니다`); };

/* ======================================================================
   시연 백엔드
   ====================================================================== */
function demoBackend() {
  let D = storage.get(CONFIG.storageKey + '-demo');
  if (!D || D.v !== 4) { D = { v: 4, ...seedDemo() }; persist(); }
  // 시간 기반 값(라운드 마감 등)은 새로고침 후에도 자연스럽게 흐르도록 저장 시각 보정 없이 그대로 둠
  let role = storage.get(CONFIG.storageKey + '-role', 'viewer');
  let sim = storage.get(CONFIG.storageKey + '-sim', true);
  let simTimer = null;
  function persist() { storage.set(CONFIG.storageKey + '-demo', D); }
  const me = () => DEMO_ROLES[role] || DEMO_ROLES.viewer;
  const streamOf = id => D.streams.find(s => s.id === id);
  const perfsOf = sid => { const s = streamOf(sid); return s ? s.performerIds.map(pid => D.performers.find(p => p.id === pid)).filter(Boolean) : []; };
  const roundOf = sid => D.rounds[sid] || { no: 0, status: 'idle', pausedMs: 0 };
  const assertManage = sid => { const m = me(); if (m.role === 'admin') return; const s = streamOf(sid); if (m.role !== 'host' || !s || s.labelId !== m.labelId) throw new DataError('FORBIDDEN', '이 방송의 호스트 또는 관리자만 가능합니다'); };
  const assertAdmin = () => { if (me().role !== 'admin') throw new DataError('FORBIDDEN', '관리자만 가능합니다'); };
  const log = (action, target, detail = '') => { D.audit.unshift({ id: uid('a'), at: Date.now(), actor: me().nick, action, target, detail }); D.audit = D.audit.slice(0, 200); };
  const sysMsg = (sid, text, kind = 'system') => { const m = { id: uid('m'), streamId: sid, nick: '시스템', text, kind, at: Date.now(), userId: null }; D.messages = D.messages || []; D.messages.push(m); bus.emit('message:' + sid, m); return m; };
  function fullStream(s) { if (!s) return null; const performers = perfsOf(s.id).map(p => ({ ...p, total: D.gifts.filter(g => g.streamId === s.id && g.performerId === p.id && !g.refunded).reduce((a, g) => a + g.stars, 0), roundTotal: D.rounds[s.id] && D.rounds[s.id].no ? p.roundTotal : 0 })); return { ...s, performers, round: { ...roundOf(s.id) }, missions: D.missions.filter(m => m.streamId === s.id).map(m => ({ ...m })), label: D.labels.find(l => l.id === s.labelId) }; }

  // 가상 시청자 활동(시연): 닉네임에 '시연·' 표시, 끌 수 있음
  function startSim() { stopSim(); if (!sim) return; simTimer = setInterval(() => { const live = D.streams.filter(s => s.status === 'live'); if (!live.length) return; const s = live[Math.floor(Math.random() * live.length)]; const [n, t] = D.chatPool[Math.floor(Math.random() * D.chatPool.length)]; const m = { id: uid('m'), streamId: s.id, nick: '시연·' + n, text: t, kind: 'chat', at: Date.now(), userId: 'sim' }; D.messages = D.messages || []; D.messages.push(m); if (D.messages.length > 400) D.messages = D.messages.slice(-300); bus.emit('message:' + s.id, m); }, 3500); }
  function stopSim() { clearInterval(simTimer); simTimer = null; }
  startSim();

  return {
    kind: 'demo',
    me: () => ({ ...me() }),
    async login() { throw new DataError('DEMO', '시연 모드에서는 로그인 대신 역할 전환을 사용합니다'); },
    async logout() { role = 'viewer'; storage.set(CONFIG.storageKey + '-role', role); bus.emit('auth'); },
    async setRole(r) { role = DEMO_ROLES[r] ? r : 'viewer'; storage.set(CONFIG.storageKey + '-role', role); bus.emit('auth'); },
    get sim() { return sim; }, setSim(on) { sim = !!on; storage.set(CONFIG.storageKey + '-sim', sim); startSim(); },
    async labels() { return D.labels.map(l => ({ ...l, streams: D.streams.filter(s => s.labelId === l.id).length })); },
    async label(id) { const l = D.labels.find(x => x.id === id); return l ? { ...l, performers: D.performers.filter(p => p.labelId === id), streams: D.streams.filter(s => s.labelId === id).map(fullStream) } : null; },
    async streams(f = {}) { return D.streams.filter(s => (!f.status || s.status === f.status) && (!f.labelId || s.labelId === f.labelId)).map(fullStream); },
    async stream(id) { return fullStream(streamOf(id)); },
    async performer(id) { const p = D.performers.find(x => x.id === id); if (!p) return null; const gifts = D.gifts.filter(g => g.performerId === id && !g.refunded); return { ...p, gifts, label: D.labels.find(l => l.id === p.labelId), streams: D.streams.filter(s => s.performerIds.includes(id)).map(fullStream), rounds: D.roundHistory.filter(r => r.results.some(x => x[0] === id)) }; },
    async rounds(sid) { return D.roundHistory.filter(r => r.streamId === sid).sort((a, b) => b.no - a.no); },
    async gifts(f = {}) { let g = D.gifts.filter(x => (!f.streamId || x.streamId === f.streamId) && (!f.performerId || x.performerId === f.performerId) && (!f.q || (x.nick + x.txn + x.gift).toLowerCase().includes(f.q.toLowerCase()))); g = g.sort((a, b) => b.createdAt - a.createdAt); return g.slice(0, f.limit || 500).map(x => ({ ...x, performerName: (D.performers.find(p => p.id === x.performerId) || {}).name, labelId: (streamOf(x.streamId) || {}).labelId })); },
    async myGifts() { return D.myGifts.slice().reverse(); },
    async messages(sid, limit = 40) { return (D.messages || []).filter(m => m.streamId === sid).slice(-limit); },
    async wallet() { return D.wallet; },
    async charge(pkgId) { const p = STAR_PACKAGES.find(x => x.id === pkgId); if (!p) throw new DataError('BAD', '상품 없음'); await sleep(500); D.wallet += p.stars; log('가상 충전', me().nick, `${p.stars} 스타 (시연)`); persist(); bus.emit('wallet', D.wallet); return { balance: D.wallet, txn: 'DEMO-C' + String(D.txnSeq++).padStart(5, '0') }; },
    async sendGift({ streamId, performerId, giftId, qty = 1 }) {
      const s = streamOf(streamId), g = giftById(giftId), p = D.performers.find(x => x.id === performerId);
      if (!s || !g || !p) throw new DataError('BAD', '잘못된 요청');
      qty = Math.max(1, Math.min(99, Math.floor(qty)));
      const acc = canAcceptGift(s, roundOf(streamId)); if (!acc.ok) throw new DataError('CLOSED', acc.reason);
      const stars = g.stars * qty;
      if (D.wallet < stars) throw new DataError('INSUFFICIENT', `스타가 부족합니다 (보유 ${D.wallet.toLocaleString()}, 필요 ${stars.toLocaleString()})`);
      await sleep(350);
      D.wallet -= stars;
      const gift = { id: uid('g'), streamId, performerId, performerName: p.name, nick: me().nick, giftId, gift: g.name, emoji: g.emoji, qty, stars, createdAt: Date.now(), inRound: acc.countsForRound, refunded: false, txn: 'DEMO-' + String(D.txnSeq++).padStart(5, '0') };
      D.gifts.push(gift); D.myGifts.push(gift);
      p.total += stars; if (acc.countsForRound) p.roundTotal += stars;
      const perfs = perfsOf(streamId);
      const done = missionsAchieved(D.missions.filter(m => m.streamId === streamId), perfs, { performerId, stars, countsForRound: acc.countsForRound });
      done.forEach(m => { m.done = true; m.doneAt = Date.now(); m.doneBy = me().nick; });
      persist();
      bus.emit('wallet', D.wallet); bus.emit('gift:' + streamId, gift); bus.emit('performers:' + streamId, perfs.map(x => ({ ...x })));
      sysMsg(streamId, `${g.emoji} ${me().nick} 님이 ${p.name} 에게 ${g.name}${qty > 1 ? ' ×' + qty : ''} (${stars.toLocaleString()} 스타)`, 'gift');
      done.forEach(m => { bus.emit('mission:' + streamId, { ...m }); sysMsg(streamId, `🎯 미션 달성! ${m.title} (${me().nick} 님)`, 'mission'); });
      return { ok: true, txn: gift.txn, balance: D.wallet, gift, missions: done.map(m => ({ ...m })), countsForRound: acc.countsForRound };
    },
    async sendMessage(sid, text) { text = String(text || '').trim().slice(0, 200); if (!text) return; const m = { id: uid('m'), streamId: sid, nick: me().nick, text, kind: 'chat', at: Date.now(), userId: me().id }; D.messages = D.messages || []; D.messages.push(m); persist(); bus.emit('message:' + sid, m); return m; },
    async report(r) { const rep = { id: uid('r'), ...r, reporter: me().nick, at: Date.now(), status: 'open' }; D.reports.unshift(rep); persist(); bus.emit('reports'); return rep; },
    async block(nick) { D.blocked = D.blocked || []; if (!D.blocked.includes(nick)) D.blocked.push(nick); persist(); return D.blocked; },
    blocked: () => D.blocked || [],
    async follow(kind, id, on) { const k = kind === 'label' ? 'labels' : 'performers'; const set = new Set(D.follows[k]); on ? set.add(id) : set.delete(id); D.follows[k] = [...set]; persist(); bus.emit('follows'); return D.follows; },
    follows: () => D.follows,
    // ---- 스튜디오 ----
    async createStream(f) { const m = me(); if (!['host', 'admin'].includes(m.role)) throw new DataError('FORBIDDEN', '호스트 또는 관리자만 방송을 만들 수 있습니다'); const id = 'd' + uid().slice(0, 6); const s = { id, title: f.title || '새 방송', labelId: f.labelId || m.labelId || 'presence', hostName: m.nick, category: f.category || '토크', hue: f.hue ?? 268, status: f.status || 'scheduled', mode: f.mode || 'individual', startedAt: f.startedAt || Date.now(), viewers: 0, performerIds: [], rules: f.rules || '', moderators: [], teams: f.teams || { A: 'A팀', B: 'B팀' }, memo: '', desc: f.desc || '' }; D.streams.unshift(s); D.rounds[id] = { no: 0, status: 'idle', pausedMs: 0 }; (f.performers || []).forEach((n, i) => { const p = { id: uid('p-'), name: n, emoji: '🎤', hue: (i * 67 + 200) % 360, team: f.mode === 'team' ? (i % 2 ? 'B' : 'A') : null, labelId: s.labelId, active: true, total: 0, roundTotal: 0, sort: i }; D.performers.push(p); s.performerIds.push(p.id); }); persist(); return fullStream(s); },
    async cloneStream(fromId) { const src = streamOf(fromId); if (!src) throw new DataError('BAD'); assertManage(fromId); const n = await this.createStream({ ...src, title: src.title + ' (복제)', status: 'scheduled', startedAt: Date.now() + 86400000, performers: [] }); const s = streamOf(n.id); s.performerIds = src.performerIds.slice(); s.rules = src.rules; s.memo = src.memo; s.teams = { ...(src.teams || {}) }; D.missions.filter(m => m.streamId === fromId).forEach(m => D.missions.push({ ...m, id: uid('m'), streamId: s.id, done: false, doneAt: null, doneBy: null })); persist(); return fullStream(s); },
    async updateStream(id, f) { assertManage(id); const s = streamOf(id); if (!s) throw new DataError('BAD'); const was = s.status; Object.assign(s, f); if (f.status === 'live' && was !== 'live') { s.startedAt = Date.now(); } if (f.status === 'ended' && was !== 'ended') { s.endedAt = Date.now(); if (roundOf(id).status === 'running' || roundOf(id).status === 'paused') await this.endRound(id); } persist(); bus.emit('stream:' + id, fullStream(s)); return fullStream(s); },
    async savePerformer(sid, p) { assertManage(sid); const s = streamOf(sid); let x = p.id && D.performers.find(y => y.id === p.id); if (!x) { x = { id: uid('p-'), name: '', emoji: '🎤', hue: Math.floor(Math.random() * 360), team: null, labelId: s.labelId, active: true, total: 0, roundTotal: 0, sort: s.performerIds.length }; D.performers.push(x); s.performerIds.push(x.id); } ['name', 'emoji', 'team', 'active', 'hue', 'bio'].forEach(k => { if (p[k] !== undefined) x[k] = p[k]; }); persist(); bus.emit('performers:' + sid, perfsOf(sid).map(y => ({ ...y }))); return { ...x }; },
    async reorderPerformers(sid, ids) { assertManage(sid); const s = streamOf(sid); s.performerIds = ids.filter(id => s.performerIds.includes(id)); s.performerIds.forEach((id, i) => { const p = D.performers.find(x => x.id === id); if (p) p.sort = i; }); persist(); bus.emit('performers:' + sid, perfsOf(sid).map(y => ({ ...y }))); },
    async startRound(sid, { title = '', minutes = 0 } = {}) { assertManage(sid); const s = streamOf(sid); if (s.status !== 'live') throw new DataError('BAD', '방송이 진행 중일 때만 라운드를 시작할 수 있습니다'); const cur = roundOf(sid); if (['running', 'paused'].includes(cur.status)) await this.endRound(sid); const no = (roundOf(sid).no || 0) + 1; const now = Date.now(); D.rounds[sid] = { no, title, status: 'running', startedAt: now, endsAt: minutes > 0 ? now + minutes * 60000 : null, pausedAt: null, pausedMs: 0 }; perfsOf(sid).forEach(p => p.roundTotal = 0); D.gifts.forEach(g => { if (g.streamId === sid) g.inRound = false; }); D.missions.filter(m => m.streamId === sid && m.kind === 'round').forEach(m => { m.done = false; m.doneAt = null; m.doneBy = null; }); D.roundHistory.push({ id: uid('rh'), streamId: sid, no, title, startedAt: now, endedAt: null, winnerId: null, winnerName: null, total: 0, results: [] }); log('라운드 시작', s.title, `라운드 ${no}${title ? ' ' + title : ''}`); persist(); bus.emit('round:' + sid, { ...D.rounds[sid] }); bus.emit('performers:' + sid, perfsOf(sid).map(y => ({ ...y }))); sysMsg(sid, `🏁 라운드 ${no} 시작${title ? ' — ' + title : ''}`, 'round'); return D.rounds[sid]; },
    async pauseRound(sid) { assertManage(sid); const r = roundOf(sid); if (r.status !== 'running') throw new DataError('BAD', '진행 중인 라운드가 없습니다'); r.status = 'paused'; r.pausedAt = Date.now(); persist(); bus.emit('round:' + sid, { ...r }); sysMsg(sid, '⏸ 라운드 일시정지 — 재개까지 후원이 잠시 멈춥니다', 'round'); return r; },
    async resumeRound(sid) { assertManage(sid); const r = roundOf(sid); if (r.status !== 'paused') throw new DataError('BAD', '일시정지 상태가 아닙니다'); r.pausedMs = (r.pausedMs || 0) + (Date.now() - r.pausedAt); if (r.endsAt) r.endsAt = r.endsAt + (Date.now() - r.pausedAt); r.pausedAt = null; r.status = 'running'; persist(); bus.emit('round:' + sid, { ...r }); sysMsg(sid, '▶ 라운드 재개', 'round'); return r; },
    async endRound(sid) { assertManage(sid); const r = roundOf(sid); if (!['running', 'paused'].includes(r.status)) return r; const perfs = perfsOf(sid); const ranked = rankPerformers(perfs, 'roundTotal'); const w = ranked[0]; r.status = 'ended'; r.endsAt = Date.now(); const h = D.roundHistory.slice().reverse().find(x => x.streamId === sid && x.no === r.no); if (h) { h.endedAt = Date.now(); h.winnerId = w && w.value > 0 ? w.id : null; h.winnerName = w && w.value > 0 ? w.name : null; h.total = ranked.reduce((a, p) => a + p.value, 0); h.results = ranked.map(p => [p.id, p.value]); } log('라운드 종료', streamOf(sid).title, `라운드 ${r.no}`); persist(); bus.emit('round:' + sid, { ...r }); if (w && w.value > 0) sysMsg(sid, `🏁 라운드 ${r.no} 종료 — 우승 👑 ${w.emoji} ${w.name} (${w.value.toLocaleString()} 스타)`, 'round'); return r; },
    async addMission(sid, m) { assertManage(sid); const x = { id: uid('m'), streamId: sid, performerId: m.performerId || null, team: m.team || null, title: String(m.title || '').trim().slice(0, 80), kind: m.kind === 'round' ? 'round' : 'single', threshold: Math.max(1, Number(m.threshold) || 1), done: false, sort: D.missions.filter(y => y.streamId === sid).length + 1 }; if (!x.title) throw new DataError('BAD', '미션 내용을 입력하세요'); D.missions.push(x); persist(); bus.emit('mission:' + sid, { ...x }); return x; },
    async removeMission(id) { const m = D.missions.find(x => x.id === id); if (!m) return; assertManage(m.streamId); D.missions = D.missions.filter(x => x.id !== id); persist(); bus.emit('mission:' + m.streamId, { ...m, _deleted: true }); },
    async resetMission(id) { const m = D.missions.find(x => x.id === id); if (!m) return; assertManage(m.streamId); m.done = false; m.doneAt = null; m.doneBy = null; persist(); bus.emit('mission:' + m.streamId, { ...m }); },
    // ---- 관리자 ----
    async reports() { assertAdmin(); return D.reports.map(r => ({ ...r, stream: streamOf(r.streamId) })); },
    async resolveReport(id, action) { assertAdmin(); const r = D.reports.find(x => x.id === id); if (!r) return; r.status = action === 'dismiss' ? 'dismissed' : 'resolved'; r.resolvedAt = Date.now(); r.action = { dismiss: '기각', resolve: '조치 완료', suspend: '대상 3일 정지', block: '대상 영구 차단' }[action] || action; if (action === 'suspend' || action === 'block') await this.sanction(r.target, action === 'block' ? 'blocked' : 'suspended'); log('신고 처리', r.target, `${r.reason} → ${r.action}`); persist(); bus.emit('reports'); return r; },
    async users() { assertAdmin(); return D.users.map(u => ({ ...u })); },
    async sanction(nick, status, days = 3) { assertAdmin(); let u = D.users.find(x => x.nick === nick); if (!u) { u = { id: uid('u'), nick, role: 'viewer', status: 'active', joinedAt: Date.now() }; D.users.push(u); } u.status = status; u.until = status === 'suspended' ? Date.now() + days * 86400000 : null; log({ active: '제재 해제', suspended: `${days}일 정지`, blocked: '영구 차단' }[status], nick); persist(); bus.emit('users'); return { ...u }; },
    async stopStream(id, reason = '') { assertAdmin(); const s = streamOf(id); if (!s) return; s.status = 'stopped'; s.stoppedReason = reason; if (['running', 'paused'].includes(roundOf(id).status)) { const r = roundOf(id); r.status = 'ended'; } log('방송 강제 중단', s.title, reason); persist(); bus.emit('stream:' + id, fullStream(s)); sysMsg(id, '⛔ 운영자가 방송을 중단했습니다' + (reason ? ' — ' + reason : ''), 'system'); return fullStream(s); },
    async setLabelStatus(id, status) { assertAdmin(); const l = D.labels.find(x => x.id === id); if (l) { l.status = status; log('레이블 ' + ({ active: '승인', suspended: '정지', pending: '대기' }[status] || status), l.name); persist(); } },
    async audit() { assertAdmin(); return D.audit.slice(); },
    async refundGift(id, reason) { assertAdmin(); const g = D.gifts.find(x => x.id === id); if (!g || g.refunded) return; g.refunded = true; g.refundReason = reason || '운영자 환불'; const p = D.performers.find(x => x.id === g.performerId); if (p) { p.total = Math.max(0, p.total - g.stars); if (g.inRound) p.roundTotal = Math.max(0, p.roundTotal - g.stars); } if (g.nick === me().nick || g.nick === '나(시연)') D.wallet += g.stars; log('후원 환불', g.txn, `${g.stars} 스타 · ${g.refundReason}`); persist(); bus.emit('performers:' + g.streamId, perfsOf(g.streamId).map(y => ({ ...y }))); bus.emit('wallet', D.wallet); },
    // ---- 실시간 ----
    subscribe(sid, h) { const offs = []; const on = (ev, fn) => fn && offs.push(bus.on(ev, fn)); on('performers:' + sid, h.onPerformers); on('gift:' + sid, h.onGift); on('round:' + sid, h.onRound); on('mission:' + sid, h.onMission); on('message:' + sid, h.onMessage); on('stream:' + sid, h.onStream); return () => offs.forEach(f => f()); },
    async reset() { stopSim(); storage.del(CONFIG.storageKey + '-demo'); D = { v: 4, ...seedDemo() }; persist(); role = 'viewer'; storage.set(CONFIG.storageKey + '-role', role); startSim(); bus.emit('auth'); bus.emit('wallet', D.wallet); bus.emit('reset'); },
    destroy() { stopSim(); },
  };
}

/* ======================================================================
   Supabase 백엔드 (기존 스키마 v1~v7 + v8)
   ====================================================================== */
function serverBackend() {
  if (!window.supabase) throw new DataError('NO_SDK', 'Supabase SDK 를 불러오지 못했습니다');
  const sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
  let ME = null, WALLET = null, SETTINGS = {}, PUBLISH_PASS = '';
  const err = e => { if (!e) return; throw new DataError(e.code || 'SERVER', e.message || String(e)); };
  const mapStream = (r, perfs, missions) => ({ id: r.id, title: r.title, labelId: r.label_id || 'presence', hostName: r.host_nick, ownerId: r.owner_id, category: r.category || '토크', hue: r.hue ?? 268, emoji: r.emoji, status: r.status, playUrl: r.play_url || '', mode: r.mode || 'individual', startedAt: +new Date(r.started_at || r.created_at), endedAt: r.ended_at ? +new Date(r.ended_at) : null, viewers: null, rules: r.rules || '', memo: r.memo || '', desc: r.description || '', teams: r.teams || { A: 'A팀', B: 'B팀' }, moderators: [],
    performers: (perfs || []).filter(p => p.stream_id === r.id && p.sort >= 0).map(mapPerf), round: { no: r.round_no || 0, title: r.round_title || '', status: r.round_status || 'idle', startedAt: r.round_started_at, endsAt: r.round_ends_at, pausedAt: r.round_paused_at || null, pausedMs: Number(r.round_paused_ms || 0) }, missions: (missions || []).filter(m => m.stream_id === r.id).map(mapMission), performerIds: (perfs || []).filter(p => p.stream_id === r.id && p.sort >= 0).map(p => p.id) });
  const mapPerf = p => ({ id: p.id, name: p.name, emoji: p.emoji, hue: p.hue ?? undefined, team: p.team || null, active: p.active !== false && p.sort >= 0, total: Number(p.total || 0), roundTotal: Number(p.round_total || 0), sort: p.sort, streamId: p.stream_id, bio: p.bio || '' });
  const mapMission = m => ({ id: m.id, streamId: m.stream_id, performerId: m.performer_id, team: m.team || null, title: m.title, kind: m.kind, threshold: m.threshold, done: m.done, doneAt: m.done_at, doneBy: m.done_by, sort: m.sort });
  const mapGift = g => ({ id: g.id, streamId: g.stream_id, performerId: g.performer_id, nick: g.nick, gift: g.gift, emoji: g.emoji, stars: g.stars, qty: 1, createdAt: +new Date(g.created_at), txn: 'G' + String(g.id).padStart(6, '0'), refunded: false });
  const mapMsg = m => ({ id: m.id, streamId: m.stream_id, nick: m.nick, text: m.text, kind: m.kind, at: +new Date(m.created_at), userId: m.user_id });
  async function loadMe() { const { data: { session } } = await sb.auth.getSession(); if (!session?.user) { ME = null; WALLET = null; return null; } const { data } = await sb.from('profiles').select('id,nick,role,status').eq('id', session.user.id).maybeSingle(); ME = data ? { ...data, email: session.user.email } : { id: session.user.id, nick: session.user.email.split('@')[0], role: 'viewer', status: 'active', email: session.user.email }; const { data: w } = await sb.from('wallets').select('balance').eq('user_id', ME.id).maybeSingle(); WALLET = w ? Number(w.balance) : 0; if (['host', 'admin'].includes(ME.role)) { try { const { data: pp } = await sb.rpc('get_publish_pass'); PUBLISH_PASS = pp || ''; } catch (e) { PUBLISH_PASS = ''; } } return ME; }
  sb.auth.onAuthStateChange(() => { loadMe().then(() => bus.emit('auth')); });
  const api = {
    kind: 'server', sb,
    ready: (async () => { await loadMe(); const { data } = await sb.from('settings').select('*'); SETTINGS = Object.fromEntries((data || []).map(r => [r.key, r.value])); })(),
    settings: () => SETTINGS, publishPass: () => PUBLISH_PASS,
    me: () => ME ? { ...ME } : null,
    async login(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); err(error); await loadMe(); bus.emit('auth'); return ME; },
    async signup(email, password, nick) { const { error } = await sb.auth.signUp({ email, password, options: { data: { nick } } }); err(error); await loadMe(); bus.emit('auth'); return ME; },
    async logout() { await sb.auth.signOut(); ME = null; WALLET = null; bus.emit('auth'); },
    async setRole() { throw new DataError('FORBIDDEN', '서버 모드에서는 역할을 바꿀 수 없습니다 — 권한은 서버가 판정합니다'); },
    sim: false, setSim() {},
    async labels() { const { data, error } = await sb.from('labels').select('*'); err(error); return (data || []).map(l => ({ id: l.id, name: l.name, status: l.status, joinedAt: +new Date(l.created_at), owner: '', hue: 268, followers: null })); },
    async label(id) { const ls = await api.labels(); const l = ls.find(x => x.id === id); if (!l) return null; const streams = await api.streams({ labelId: id }); return { ...l, streams, performers: streams.flatMap(s => s.performers) }; },
    async streams(f = {}) { let q = sb.from('streams').select('*').order('started_at', { ascending: false }); if (f.status) q = q.eq('status', f.status); if (f.labelId) q = q.eq('label_id', f.labelId); const [{ data: st, error }, { data: pf }, { data: ms }] = await Promise.all([q, sb.from('performers').select('*').order('sort'), sb.from('missions').select('*').order('sort')]); err(error); return (st || []).map(r => mapStream(r, pf, ms)); },
    async stream(id) { const [{ data: r, error }, { data: pf }, { data: ms }] = await Promise.all([sb.from('streams').select('*').eq('id', id).maybeSingle(), sb.from('performers').select('*').eq('stream_id', id).order('sort'), sb.from('missions').select('*').eq('stream_id', id).order('sort')]); err(error); return r ? mapStream(r, pf, ms) : null; },
    async performer(id) { const { data: p, error } = await sb.from('performers').select('*').eq('id', id).maybeSingle(); err(error); if (!p) return null; const { data: g } = await sb.from('gifts').select('*').eq('performer_id', id).order('created_at', { ascending: false }).limit(300); const s = await api.stream(p.stream_id); return { ...mapPerf(p), gifts: (g || []).map(mapGift), streams: s ? [s] : [], label: null, rounds: [] }; },
    async rounds(sid) { const { data, error } = await sb.from('rounds').select('*').eq('stream_id', sid).order('round_no', { ascending: false }); err(error); return (data || []).map(r => ({ id: r.id, streamId: sid, no: r.round_no, title: r.title, startedAt: +new Date(r.started_at), endedAt: r.ended_at ? +new Date(r.ended_at) : null, winnerId: r.winner_id, winnerName: r.winner_name, total: Number(r.total || 0), results: (r.results || []).map(x => [x.id, Number(x.stars)]) })); },
    async gifts(f = {}) { let q = sb.from('gifts').select('*').order('created_at', { ascending: false }).limit(f.limit || 500); if (f.streamId) q = q.eq('stream_id', f.streamId); if (f.performerId) q = q.eq('performer_id', f.performerId); if (f.q) q = q.ilike('nick', '%' + f.q + '%'); const { data, error } = await q; err(error); const { data: pf } = await sb.from('performers').select('id,name,stream_id'); const { data: st } = await sb.from('streams').select('id,label_id'); return (data || []).map(g => ({ ...mapGift(g), performerName: (pf || []).find(p => p.id === g.performer_id)?.name, labelId: (st || []).find(s => s.id === g.stream_id)?.label_id || 'presence' })); },
    async myGifts() { if (!ME) return []; const { data } = await sb.from('gifts').select('*').eq('user_id', ME.id).order('created_at', { ascending: false }).limit(200); return (data || []).map(mapGift); },
    async messages(sid, limit = 40) { const { data } = await sb.from('messages').select('*').eq('stream_id', sid).order('created_at', { ascending: false }).limit(limit); return (data || []).reverse().map(mapMsg); },
    async wallet() { if (!ME) return null; const { data } = await sb.from('wallets').select('balance').eq('user_id', ME.id).maybeSingle(); WALLET = data ? Number(data.balance) : 0; return WALLET; },
    async charge() { throw new DataError('NOT_SUPPORTED', '서버 모드의 충전은 토스페이먼츠 테스트 결제(기존 화면)로만 진행합니다. 시연 모드에서는 가상 충전을 사용하세요'); },
    async sendGift({ streamId, performerId, giftId, qty = 1 }) { if (!ME) throw new DataError('AUTH', '로그인이 필요합니다'); const g = giftById(giftId); qty = Math.max(1, Math.min(99, Math.floor(qty))); const { error } = await sb.rpc('send_gift', { p_stream: streamId, p_performer: performerId, p_gift: g.name + (qty > 1 ? ' ×' + qty : ''), p_emoji: g.emoji, p_stars: g.stars * qty }); if (error) { if (String(error.message).startsWith('INSUFFICIENT:')) throw new DataError('INSUFFICIENT', error.message.slice(13)); err(error); } await api.wallet(); bus.emit('wallet', WALLET); return { ok: true, txn: '서버 기록', balance: WALLET, countsForRound: true, missions: [] }; },
    async sendMessage(sid, text) { if (!ME) throw new DataError('AUTH', '로그인이 필요합니다'); const { error } = await sb.rpc('send_message', { p_stream: sid, p_text: text }); err(error); },
    async report(r) { if (!ME) throw new DataError('AUTH', '로그인이 필요합니다'); const { error } = await sb.rpc('create_report', { p_stream: r.streamId, p_target: r.target, p_reason: r.reason, p_detail: r.detail || '' }); if (error) notSupported('신고 접수 (v8 migration 필요)'); },
    async block(nick) { const k = CONFIG.storageKey + '-blocked'; const b = storage.get(k, []); if (!b.includes(nick)) b.push(nick); storage.set(k, b); return b; },
    blocked: () => storage.get(CONFIG.storageKey + '-blocked', []),
    async follow(kind, id, on) { const k = CONFIG.storageKey + '-follows'; const f = storage.get(k, { labels: [], performers: [] }); const key = kind === 'label' ? 'labels' : 'performers'; const set = new Set(f[key]); on ? set.add(id) : set.delete(id); f[key] = [...set]; storage.set(k, f); bus.emit('follows'); return f; },
    follows: () => storage.get(CONFIG.storageKey + '-follows', { labels: [], performers: [] }),
    async createStream(f) { const { data, error } = await sb.rpc('create_stream', { p_title: f.title, p_category: f.category, p_emoji: '🎤', p_hue: f.hue ?? 268, p_performers: f.performers || [], p_label: f.labelId || 'presence' }); err(error); return api.stream(data); },
    async cloneStream() { notSupported('방송 복제'); },
    async updateStream(id, f) { const s = await api.stream(id); const { error } = await sb.rpc('set_stream', { p_stream: id, p_play_url: f.playUrl ?? s.playUrl ?? '', p_title: f.title ?? s.title, p_status: f.status ?? s.status }); err(error); if (f.rules !== undefined || f.mode !== undefined || f.memo !== undefined || f.teams !== undefined) { const { error: e2 } = await sb.rpc('set_stream_meta', { p_stream: id, p_mode: f.mode ?? s.mode, p_rules: f.rules ?? s.rules, p_memo: f.memo ?? s.memo, p_teams: f.teams ?? s.teams }); if (e2) notSupported('방송 규칙/팀 저장 (v8 migration 필요)'); } return api.stream(id); },
    async savePerformer(sid, p) { if (p.id) { const { error } = await sb.rpc('update_performer', { p_performer: p.id, p_name: p.name, p_emoji: p.emoji, p_team: p.team ?? null, p_active: p.active !== false }); if (error) notSupported('출연자 수정 (v8 migration 필요)'); } else { const { error } = await sb.rpc('add_performer', { p_stream: sid, p_name: p.name, p_emoji: p.emoji || '🎤' }); err(error); } },
    async reorderPerformers(sid, ids) { const { error } = await sb.rpc('reorder_performers', { p_stream: sid, p_ids: ids }); if (error) notSupported('출연자 정렬 (v8 migration 필요)'); },
    async startRound(sid, { title = '', minutes = 0 } = {}) { const { error } = await sb.rpc('start_round', { p_stream: sid, p_title: title, p_minutes: minutes }); err(error); },
    async pauseRound(sid) { const { error } = await sb.rpc('pause_round', { p_stream: sid }); if (error) notSupported('라운드 일시정지 (v8 migration 필요)'); },
    async resumeRound(sid) { const { error } = await sb.rpc('resume_round', { p_stream: sid }); if (error) notSupported('라운드 재개 (v8 migration 필요)'); },
    async endRound(sid) { const { error } = await sb.rpc('end_round', { p_stream: sid }); err(error); },
    async addMission(sid, m) { const { error } = await sb.rpc('add_mission', { p_stream: sid, p_performer: m.performerId || null, p_title: m.title, p_kind: m.kind, p_threshold: Number(m.threshold) }); err(error); },
    async removeMission(id) { const { error } = await sb.rpc('remove_mission', { p_mission: id }); err(error); },
    async resetMission(id) { const { error } = await sb.rpc('reset_mission', { p_mission: id }); err(error); },
    async reports() { const { data, error } = await sb.from('reports').select('*').order('created_at', { ascending: false }); if (error) notSupported('신고 목록 (v8 migration 필요)'); return (data || []).map(r => ({ id: r.id, streamId: r.stream_id, reporter: r.reporter_nick, target: r.target_nick, reason: r.reason, detail: r.detail, at: +new Date(r.created_at), status: r.status, action: r.action })); },
    async resolveReport(id, action) { const { error } = await sb.rpc('resolve_report', { p_report: id, p_action: action }); if (error) notSupported('신고 처리 (v8 migration 필요)'); },
    async users() { const { data, error } = await sb.from('profiles').select('id,nick,role,status,created_at'); err(error); return (data || []).map(u => ({ id: u.id, nick: u.nick, role: u.role, status: u.status, joinedAt: +new Date(u.created_at) })); },
    async sanction(nick, status) { const { error } = await sb.rpc('admin_set_user_status', { p_nick: nick, p_status: status }); if (error) notSupported('이용자 제재 (v8 migration 필요)'); },
    async stopStream(id, reason) { const s = await api.stream(id); const { error } = await sb.rpc('set_stream', { p_stream: id, p_play_url: s.playUrl || '', p_title: s.title, p_status: 'stopped' }); err(error); },
    async setLabelStatus() { notSupported('레이블 상태 변경'); },
    async audit() { const { data, error } = await sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200); if (error) notSupported('감사 기록 (v8 migration 필요)'); return (data || []).map(a => ({ id: a.id, at: +new Date(a.created_at), actor: a.actor_nick, action: a.action, target: a.target, detail: a.detail })); },
    async refundGift() { notSupported('환불 처리'); },
    subscribe(sid, h) {
      const ch = sb.channel('v2-' + sid + '-' + uid());
      if (h.onPerformers) ch.on('postgres_changes', { event: '*', schema: 'public', table: 'performers', filter: 'stream_id=eq.' + sid }, async () => { const s = await api.stream(sid); h.onPerformers(s.performers); });
      if (h.onGift) ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gifts', filter: 'stream_id=eq.' + sid }, ({ new: g }) => h.onGift(mapGift(g)));
      if (h.onRound || h.onStream) ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'streams', filter: 'id=eq.' + sid }, async () => { const s = await api.stream(sid); h.onRound && h.onRound(s.round); h.onStream && h.onStream(s); });
      if (h.onMission) ch.on('postgres_changes', { event: '*', schema: 'public', table: 'missions', filter: 'stream_id=eq.' + sid }, ({ eventType, new: m, old }) => h.onMission(eventType === 'DELETE' ? { id: old.id, _deleted: true } : mapMission(m)));
      if (h.onMessage) ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'stream_id=eq.' + sid }, ({ new: m }) => h.onMessage(mapMsg(m)));
      ch.subscribe(status => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') bus.emit('conn', { ok: false }); if (status === 'SUBSCRIBED') bus.emit('conn', { ok: true }); });
      return () => sb.removeChannel(ch);
    },
    async reset() { throw new DataError('FORBIDDEN', '서버 데이터는 초기화하지 않습니다'); },
    destroy() {},
  };
  return api;
}

/* ======================================================================
   모드 선택 + 공개 API
   ====================================================================== */
let backend = null;
export const data = {
  mode: 'demo', status: { ok: true, msg: '' },
  async init() {
    const q = new URLSearchParams(location.hash.split('?')[1] || location.search);
    let mode = q.get('mode') || storage.get(CONFIG.modeKey, 'demo');
    if (mode === 'server') { try { backend = serverBackend(); await Promise.race([backend.ready, sleep(8000).then(() => { throw new DataError('TIMEOUT', '서버 응답이 없습니다'); })]); data.status = { ok: true, msg: '' }; } catch (e) { console.warn('server mode failed', e); data.status = { ok: false, msg: e.message || String(e) }; backend = null; mode = 'demo'; data.serverError = e.message || String(e); } }
    if (!backend) backend = demoBackend();
    data.mode = backend.kind; storage.set(CONFIG.modeKey, data.mode); bus.emit('mode', data.mode);
    return data.mode;
  },
  async setMode(m) { if (m === data.mode) return; if (backend) backend.destroy(); backend = null; storage.set(CONFIG.modeKey, m); await data.init(); bus.emit('auth'); },
  get backend() { return backend; },
};
// 백엔드 메서드를 그대로 노출
['me', 'login', 'signup', 'logout', 'setRole', 'setSim', 'labels', 'label', 'streams', 'stream', 'performer', 'rounds', 'gifts', 'myGifts', 'messages', 'wallet', 'charge', 'sendGift', 'sendMessage', 'report', 'block', 'blocked', 'follow', 'follows', 'createStream', 'cloneStream', 'updateStream', 'savePerformer', 'reorderPerformers', 'startRound', 'pauseRound', 'resumeRound', 'endRound', 'addMission', 'removeMission', 'resetMission', 'reports', 'resolveReport', 'users', 'sanction', 'stopStream', 'setLabelStatus', 'audit', 'refundGift', 'subscribe', 'reset', 'settings', 'publishPass']
  .forEach(k => { data[k] = (...a) => { if (!backend) throw new DataError('NOT_READY', '데이터가 아직 준비되지 않았습니다'); const f = backend[k]; if (typeof f !== 'function') return backend[k]; return f.apply(backend, a); }; });
Object.defineProperty(data, 'sim', { get: () => backend ? backend.sim : false });
export { GIFTS, STAR_PACKAGES };
