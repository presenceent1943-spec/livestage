/* LIVE STAGE v2 — 순수 계산: 순위 · 라운드 · 미션 · 효과 등급 · 정산 · 팬 배지  (DOM/네트워크 없음) */
import { CONFIG } from './core.js';

/* 선물 카탈로그 */
export const GIFTS = [
  { id: 'heart', name: '하트', emoji: '💛', stars: 10 },
  { id: 'rose', name: '장미', emoji: '🌹', stars: 50 },
  { id: 'champ', name: '샴페인', emoji: '🍾', stars: 300 },
  { id: 'crown', name: '왕관', emoji: '👑', stars: 1000 },
  { id: 'meteor', name: '유성우', emoji: '🌠', stars: 5000 },
];
export const giftById = id => GIFTS.find(g => g.id === id);
export const STAR_PACKAGES = [
  { id: 'p1', stars: 1000, krw: 11000 }, { id: 'p2', stars: 3000, krw: 33000 }, { id: 'p3', stars: 10000, krw: 110000 }, { id: 'p4', stars: 30000, krw: 330000 },
];

/* 효과 등급: small(<100) · mid(100~999) · big(1000~4999) · huge(5000+) */
export const effectTier = stars => stars >= 5000 ? 'huge' : stars >= 1000 ? 'big' : stars >= 100 ? 'mid' : 'small';

/* ---------- 순위 ---------- */
/** performers: [{id,name,team,total,roundTotal,active,sort}] ; key: 'roundTotal' | 'total' */
export function rankPerformers(performers, key = 'roundTotal') {
  const list = (performers || []).filter(p => p.active !== false);
  const sorted = [...list].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0) || (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name)));
  const top = Number(sorted[0]?.[key]) || 0;
  let rank = 0, prev = null;
  return sorted.map((p, i) => { const v = Number(p[key]) || 0; if (v !== prev) { rank = i + 1; prev = v; } return { ...p, rank, value: v, share: top ? v / top : 0, tie: sorted.filter(x => (Number(x[key]) || 0) === v).length > 1 && v > 0 }; });
}
export function rankTeams(performers, key = 'roundTotal') {
  const m = new Map();
  (performers || []).filter(p => p.active !== false).forEach(p => { const t = p.team || '팀 없음'; const e = m.get(t) || { team: t, value: 0, members: [] }; e.value += Number(p[key]) || 0; e.members.push(p); m.set(t, e); });
  const list = [...m.values()].sort((a, b) => b.value - a.value || a.team.localeCompare(b.team));
  const top = list[0]?.value || 0; let rank = 0, prev = null;
  return list.map((t, i) => { if (t.value !== prev) { rank = i + 1; prev = t.value; } return { ...t, rank, share: top ? t.value / top : 0 }; });
}
/** 이전 순위 대비 변동 (+올라감 / -내려감) */
export function rankDeltas(prevRanked, nextRanked) {
  const prev = new Map((prevRanked || []).map(p => [p.id, p.rank]));
  return Object.fromEntries(nextRanked.map(p => [p.id, prev.has(p.id) ? prev.get(p.id) - p.rank : 0]));
}
export const sumBy = (arr, key) => (arr || []).reduce((a, x) => a + (Number(x[key]) || 0), 0);

/* ---------- 라운드 ---------- */
/** round: {no,title,status:'idle'|'running'|'paused'|'ended', startedAt, endsAt, pausedAt, pausedMs} */
export function roundTimeLeft(round, now = Date.now()) {
  if (!round || !['running', 'paused'].includes(round.status)) return null;
  const pausedMs = Number(round.pausedMs || 0) + (round.status === 'paused' && round.pausedAt ? now - +new Date(round.pausedAt) : 0);
  if (!round.endsAt) return { elapsed: now - +new Date(round.startedAt) - pausedMs, left: null, over: false, countUp: true };
  const left = +new Date(round.endsAt) + pausedMs - now;
  return { elapsed: now - +new Date(round.startedAt) - pausedMs, left: Math.max(0, left), over: left <= 0, countUp: false };
}
/** 후원 접수 가능 여부 — 서버 모드에서도 같은 규칙을 DB 함수가 적용 */
export function canAcceptGift(stream, round, now = Date.now()) {
  if (!stream || stream.status !== 'live') return { ok: false, reason: '진행 중인 방송이 아닙니다' };
  if (round && round.status === 'paused') return { ok: false, reason: '라운드가 일시정지 중입니다 — 재개 후 후원할 수 있습니다' };
  const t = roundTimeLeft(round, now);
  if (t && t.over) return { ok: true, countsForRound: false, reason: '라운드 마감 후 후원은 누적에만 반영됩니다' };
  return { ok: true, countsForRound: !!(round && round.status === 'running') };
}
export function roundLabel(round) {
  if (!round || !round.no) return '후원 순위';
  return `라운드 ${round.no}${round.title ? ' · ' + round.title : ''}${round.status === 'ended' ? ' · 종료' : round.status === 'paused' ? ' · 일시정지' : ''}`;
}

/* ---------- 미션 ---------- */
/** mission: {id, performerId|null, team|null, title, kind:'single'|'round', threshold, done} */
export function missionProgress(m, performers) {
  if (m.kind !== 'round') return { cur: 0, max: m.threshold, ratio: m.done ? 1 : 0 };
  let cur = 0;
  if (m.performerId) cur = Number((performers.find(p => p.id === m.performerId) || {}).roundTotal || 0);
  else if (m.team) cur = sumBy(performers.filter(p => p.team === m.team), 'roundTotal');
  else cur = sumBy(performers, 'roundTotal');
  return { cur, max: m.threshold, ratio: Math.min(1, cur / m.threshold) };
}
/** 선물 하나가 들어온 뒤 달성되는 미션 목록 (서버의 send_gift 와 동일 규칙) */
export function missionsAchieved(missions, performers, gift) {
  const p = performers.find(x => x.id === gift.performerId);
  return (missions || []).filter(m => !m.done && (!m.performerId || m.performerId === gift.performerId) && (!m.team || (p && p.team === m.team)))
    .filter(m => m.kind === 'single' ? gift.stars >= m.threshold : gift.countsForRound && missionProgress(m, performers).cur >= m.threshold);
}

/* ---------- 정산 (시연) ---------- */
/** gifts: [{id, streamId, performerId, performerName, labelId, nick, stars, createdAt, refunded?}]
 *  split: {platform, label, performer} (%), feePct: PG 수수료(결제액 기준, 시연 가정) */
export function settle(gifts, { split = CONFIG.split, krwPerStar = CONFIG.krwPerStar, feePct = 3.3, performers = [], streams = [] } = {}) {
  const valid = gifts.filter(g => !g.refunded), refunded = gifts.filter(g => g.refunded);
  const grossStars = sumBy(valid, 'stars'), gross = grossStars * krwPerStar;
  const refundKrw = sumBy(refunded, 'stars') * krwPerStar;
  const fee = Math.round(gross * feePct / 100);
  const net = gross - fee;
  const platform = Math.round(net * split.platform / 100), label = Math.round(net * split.label / 100);
  const performerPool = net - platform - label;   // 반올림 차액은 출연자 풀로
  const byPerf = new Map();
  valid.forEach(g => { const e = byPerf.get(g.performerId) || { performerId: g.performerId, name: g.performerName, labelId: g.labelId, streamId: g.streamId, stars: 0, count: 0 }; e.stars += g.stars; e.count++; byPerf.set(g.performerId, e); });
  let acc = 0; const rows = [...byPerf.values()].sort((a, b) => b.stars - a.stars).map((e, i, arr) => {
    const gk = e.stars * krwPerStar; const share = grossStars ? e.stars / grossStars : 0;
    let pay = Math.round(performerPool * share); if (i === arr.length - 1) pay = performerPool - acc; acc += pay;
    const tax = Math.round(pay * 0.033);   // 원천세 3.3% (프리랜서 가정, 시연)
    return { ...e, grossKrw: gk, share, payout: pay, withholding: tax, net: pay - tax, status: 'scheduled' };
  });
  const byLabel = new Map();
  rows.forEach(r => { const e = byLabel.get(r.labelId) || { labelId: r.labelId, stars: 0, performers: 0 }; e.stars += r.stars; e.performers++; byLabel.set(r.labelId, e); });
  const labelRows = [...byLabel.values()].map(e => ({ ...e, share: grossStars ? e.stars / grossStars : 0, payout: Math.round(label * (grossStars ? e.stars / grossStars : 0)) }));
  return { grossStars, gross, refundKrw, refundedCount: refunded.length, feePct, fee, net, platform, label, performerPool, split, krwPerStar, performers: rows, labels: labelRows, count: valid.length };
}

/* ---------- 팬 배지 (응원 기록 기반) ---------- */
export const FAN_BADGES = [
  { id: 'first', name: '첫 응원', emoji: '🌱', test: s => s.count >= 1 },
  { id: 'regular', name: '단골', emoji: '☕', test: s => s.count >= 10 },
  { id: 'gold', name: '골드 서포터', emoji: '🥇', test: s => s.stars >= 10000 },
  { id: 'crown', name: '왕관 보낸 팬', emoji: '👑', test: s => s.maxSingle >= 1000 },
  { id: 'meteor', name: '유성우', emoji: '🌠', test: s => s.maxSingle >= 5000 },
  { id: 'multi', name: '여러 무대 응원', emoji: '🎪', test: s => s.streams >= 3 },
];
export function fanStats(gifts) {
  const s = { count: gifts.length, stars: sumBy(gifts, 'stars'), maxSingle: Math.max(0, ...gifts.map(g => g.stars)), streams: new Set(gifts.map(g => g.streamId)).size };
  return { ...s, badges: FAN_BADGES.map(b => ({ ...b, earned: b.test(s) })) };
}
