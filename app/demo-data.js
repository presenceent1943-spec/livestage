/* LIVE STAGE v2 — 시연 데이터 (결정적 시드) + 썸네일 그래픽.  모든 수치는 시연용 가상값. */
import { GIFTS } from './engine.js';

/* 결정적 난수 — 같은 시드면 항상 같은 데이터 */
export function rng(seed = 7) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const H = 3600000, M = 60000;
export const DEMO_VIEWER = { id: 'demo-me', nick: '나(시연)', role: 'viewer' };
export const DEMO_ROLES = { viewer: { id: 'demo-me', nick: '나(시연)', role: 'viewer' }, host: { id: 'demo-host', nick: '미유', role: 'host', labelId: 'presence' }, admin: { id: 'demo-admin', nick: '운영자', role: 'admin' } };

export function seedDemo(now = Date.now()) {
  const r = rng(20261028);
  const labels = [
    { id: 'presence', name: 'PRESENCE', owner: '김현서', bio: '엑셀 방송 전문 레이블. 노래·토크 합동 무대를 매주 금요일에 엽니다.', joinedAt: now - 120 * 24 * H, status: 'active', hue: 268, followers: 1240 },
    { id: 'moonlight', name: '문라이트', owner: '박서연', bio: '야식 토크와 ASMR로 하루를 마무리하는 레이블.', joinedAt: now - 40 * 24 * H, status: 'active', hue: 40, followers: 380 },
    { id: 'neon', name: '네온 크루', owner: '이도윤', bio: '댄스 커버·챌린지 중심의 신생 크루.', joinedAt: now - 3 * 24 * H, status: 'pending', hue: 330, followers: 52 },
  ];
  const mkP = (id, name, emoji, hue, team, labelId, bio) => ({ id, name, emoji, hue, team, labelId, active: true, bio, total: 0, roundTotal: 0, sort: 0 });
  const performers = [
    mkP('p-miyu', '미유', '🌙', 268, 'A', 'presence', '발라드 담당. 고음에서 분위기 바꾸는 타입.'),
    mkP('p-rina', '리나', '🌸', 330, 'A', 'presence', '댄스·랩. 무대 장악력으로 유명.'),
    mkP('p-woogi', '우기', '🔥', 18, 'B', 'presence', '토크 메인. 웃기면서 노래도 잘함.'),
    mkP('p-jimi', '지미', '🐱', 200, 'B', 'presence', '막내. 팬 서비스 담당.'),
    mkP('p-haneul', '하늘', '🍜', 40, null, 'moonlight', '야식 토크 호스트.'),
    mkP('p-byeol', '별이', '✨', 55, null, 'moonlight', '하늘의 단짝.'),
    mkP('p-doyun', '도윤', '💃', 330, null, 'neon', '네온 크루 리더.'),
    mkP('p-soyoung', '소영', '🎭', 300, null, 'neon', '첫 무대.'),
  ];
  performers.forEach((p, i) => p.sort = i);
  const streams = [
    { id: 'd1', title: '금요일 밤 합동 라이브 — 노래 대결 2라운드', labelId: 'presence', hostName: '미유', category: '합동방송', hue: 268, status: 'live', mode: 'team', startedAt: now - 2 * H, viewers: 1842, performerIds: ['p-miyu', 'p-rina', 'p-woogi', 'p-jimi'], rules: '라운드마다 집계가 0부터 시작합니다. 라운드 1위 출연자가 다음 라운드 곡 선택권을 가집니다. 동점이면 먼저 도달한 쪽이 상위.', moderators: ['우장군'], teams: { A: '달빛팀', B: '불꽃팀' }, memo: '19:00 오프닝 → 라운드1 발라드 → 라운드2 댄스 → 결과 발표', desc: '매주 금요일 PRESENCE 합동 무대. 4명의 출연자가 두 팀으로 나뉘어 노래 대결을 펼칩니다.' },
    { id: 'd2', title: '퇴근하고 같이 먹는 야식 토크', labelId: 'moonlight', hostName: '하늘', category: '먹방', hue: 40, status: 'live', mode: 'individual', startedAt: now - 1 * H, viewers: 623, performerIds: ['p-haneul', 'p-byeol'], rules: '개인전. 누적 집계.', moderators: [], memo: '', desc: '오늘 메뉴는 떡볶이와 순대. 편하게 들어와서 같이 드세요.' },
    { id: 'd3', title: '첫 방송이에요 — 댄스 커버 연습', labelId: 'neon', hostName: '도윤', category: '댄스', hue: 330, status: 'live', mode: 'individual', startedAt: now - 20 * M, viewers: 87, performerIds: ['p-doyun', 'p-soyoung'], rules: '개인전.', moderators: [], memo: '', desc: '네온 크루의 첫 라이브. 따뜻한 응원 부탁드려요.', isNew: true },
    { id: 'd4', title: '토요일 낮 — 팬 신청곡 라이브', labelId: 'presence', hostName: '리나', category: '노래', hue: 330, status: 'scheduled', mode: 'individual', startedAt: now + 26 * H, viewers: 0, performerIds: ['p-rina', 'p-jimi'], rules: '개인전.', moderators: [], memo: '', desc: '채팅으로 신청곡 받아서 바로 부릅니다.' },
    { id: 'd5', title: '새벽 ASMR — 빗소리와 속삭임', labelId: 'moonlight', hostName: '별이', category: 'ASMR', hue: 200, status: 'scheduled', mode: 'individual', startedAt: now + 50 * H, viewers: 0, performerIds: ['p-byeol'], rules: '', moderators: [], memo: '', desc: '' },
    { id: 'd6', title: '지난주 합동 라이브 — 노래 대결 1주차', labelId: 'presence', hostName: '미유', category: '합동방송', hue: 268, status: 'ended', mode: 'team', startedAt: now - 7 * 24 * H, endedAt: now - 7 * 24 * H + 3 * H, viewers: 0, performerIds: ['p-miyu', 'p-rina', 'p-woogi', 'p-jimi'], rules: '', moderators: ['우장군'], teams: { A: '달빛팀', B: '불꽃팀' }, memo: '', desc: '' },
  ];
  // 라운드 상태: d1 은 라운드 2 진행 중(12분 남음)
  const rounds = {
    d1: { no: 2, title: '댄스 곡 대결', status: 'running', startedAt: now - 18 * M, endsAt: now + 12 * M, pausedAt: null, pausedMs: 0 },
    d6: { no: 3, title: '최종 라운드', status: 'ended', startedAt: now - 7 * 24 * H + 2 * H, endsAt: now - 7 * 24 * H + 2.5 * H, pausedMs: 0 },
  };
  const roundHistory = [
    { id: 'rh1', streamId: 'd1', no: 1, title: '발라드 대결', startedAt: now - 110 * M, endedAt: now - 70 * M, winnerId: 'p-rina', winnerName: '리나', total: 9850, results: [['p-rina', 4300], ['p-miyu', 3900], ['p-woogi', 1100], ['p-jimi', 550]] },
    { id: 'rh1b', streamId: 'd1', no: 2, title: '댄스 곡 대결', startedAt: now - 18 * M, endedAt: null, winnerId: null, winnerName: null, total: 0, results: [] },
    { id: 'rh2', streamId: 'd6', no: 1, title: '오프닝', startedAt: now - 7 * 24 * H, endedAt: now - 7 * 24 * H + 40 * M, winnerId: 'p-miyu', winnerName: '미유', total: 6200, results: [['p-miyu', 3100], ['p-rina', 2000], ['p-woogi', 700], ['p-jimi', 400]] },
    { id: 'rh3', streamId: 'd6', no: 2, title: '듀엣', startedAt: now - 7 * 24 * H + 45 * M, endedAt: now - 7 * 24 * H + 95 * M, winnerId: 'p-woogi', winnerName: '우기', total: 8100, results: [['p-woogi', 3800], ['p-miyu', 2300], ['p-jimi', 1200], ['p-rina', 800]] },
    { id: 'rh4', streamId: 'd6', no: 3, title: '최종 라운드', startedAt: now - 7 * 24 * H + 2 * H, endedAt: now - 7 * 24 * H + 2.5 * H, winnerId: 'p-miyu', winnerName: '미유', total: 12400, results: [['p-miyu', 6100], ['p-rina', 3300], ['p-woogi', 2000], ['p-jimi', 1000]] },
  ];
  const missions = [
    { id: 'm1', streamId: 'd1', performerId: null, team: null, title: '전원 즉석 댄스', kind: 'round', threshold: 8000, done: false, sort: 1 },
    { id: 'm2', streamId: 'd1', performerId: 'p-jimi', team: null, title: '지미 애교 3종', kind: 'single', threshold: 300, done: false, sort: 2 },
    { id: 'm3', streamId: 'd1', performerId: null, team: 'B', title: '불꽃팀 고음 배틀', kind: 'round', threshold: 3000, done: false, sort: 3 },
    { id: 'm4', streamId: 'd1', performerId: 'p-miyu', team: null, title: '미유 팬 신청곡', kind: 'single', threshold: 1000, done: true, doneAt: now - 80 * M, doneBy: '시연·goldstar', sort: 0 },
  ];
  // 후원 원장 (결정적): 방송별 출연자 누적 + d1 라운드2 집계
  const fans = ['별빛', '밤하늘', '루나팬', 'goldstar', '응원단장', 'mimi', '호랑이', 'toto', '달빛소녀'];
  const gifts = []; let gid = 1;
  const push = (streamId, performerId, stars, at, nick, inRound = false) => { const g = GIFTS.slice().reverse().find(x => x.stars <= stars) || GIFTS[0]; const qty = Math.max(1, Math.round(stars / g.stars)); gifts.push({ id: 'g' + (gid++), streamId, performerId, nick: '시연·' + nick, giftId: g.id, gift: g.name, emoji: g.emoji, qty, stars: g.stars * qty, createdAt: at, inRound, refunded: false, txn: 'DEMO-' + String(gid).padStart(5, '0') }); };
  const targets = { d1: { 'p-miyu': 14300, 'p-rina': 12100, 'p-woogi': 7600, 'p-jimi': 3900 }, d2: { 'p-haneul': 5200, 'p-byeol': 3100 }, d3: { 'p-doyun': 300, 'p-soyoung': 150 }, d6: { 'p-miyu': 11500, 'p-rina': 6100, 'p-woogi': 6500, 'p-jimi': 2600 } };
  Object.entries(targets).forEach(([sid, m]) => { const s = streams.find(x => x.id === sid); Object.entries(m).forEach(([pid, total]) => { let left = total, t = s.startedAt; while (left > 0) { const pick = [10, 10, 50, 50, 300, 1000][Math.floor(r() * 6)]; const st = Math.min(left, pick); left -= st; t += 40000 + r() * 300000; push(sid, pid, st, t, fans[Math.floor(r() * fans.length)]); } }); });
  // d1 라운드 2 진행분 (18분 내)
  const r2 = { 'p-miyu': 2100, 'p-rina': 2650, 'p-woogi': 1300, 'p-jimi': 450 };
  Object.entries(r2).forEach(([pid, total]) => { let left = total, t = now - 17 * M; while (left > 0) { const pick = [10, 50, 50, 300][Math.floor(r() * 4)]; const st = Math.min(left, pick); left -= st; t += 20000 + r() * 90000; push('d1', pid, st, t, fans[Math.floor(r() * fans.length)], true); } });
  gifts.sort((a, b) => a.createdAt - b.createdAt);
  // 누적 반영
  performers.forEach(p => { p.total = gifts.filter(g => g.performerId === p.id && !g.refunded).reduce((a, g) => a + g.stars, 0); p.roundTotal = gifts.filter(g => g.performerId === p.id && g.streamId === 'd1' && g.inRound).reduce((a, g) => a + g.stars, 0); });
  // 환불 샘플 1건 (d6)
  const rf = gifts.find(g => g.streamId === 'd6' && g.stars >= 300); if (rf) { rf.refunded = true; rf.refundReason = '중복 결제 환불'; }

  const chatPool = [
    ['별빛', '오늘 목소리 미쳤다 ㅠㅠ'], ['goldstar', '리나 분량 좀 더 주세요!!'], ['밤하늘', 'ㅋㅋㅋㅋㅋ 우기 표정'], ['mimi', '지금 들어왔는데 뭐하는 중?'], ['응원단장', '미유 1등 가즈아'], ['호랑이', '노래 신청 되나요'], ['루나팬', '왕관 간다 ㄱㄷ'], ['toto', '처음 와봤는데 재밌다'], ['별빛', '다음 라운드 언제 시작?'], ['mimi', '하트 보냈어요 💛'], ['달빛소녀', '지미 사랑해 🐱'], ['goldstar', '순위 역전 가능?'],
  ];
  const users = [
    { id: 'u1', nick: '별빛', role: 'viewer', status: 'active', joinedAt: now - 30 * 24 * H },
    { id: 'u2', nick: 'goldstar', role: 'viewer', status: 'active', joinedAt: now - 60 * 24 * H },
    { id: 'u3', nick: '욕쟁이123', role: 'viewer', status: 'suspended', until: now + 3 * 24 * H, joinedAt: now - 5 * 24 * H },
    { id: 'u4', nick: 'spam_bot', role: 'viewer', status: 'blocked', joinedAt: now - 2 * 24 * H },
    { id: 'u5', nick: '우장군', role: 'moderator', status: 'active', joinedAt: now - 100 * 24 * H },
    { id: 'u6', nick: '미유', role: 'host', status: 'active', labelId: 'presence', joinedAt: now - 110 * 24 * H },
    { id: 'u7', nick: '하늘', role: 'host', status: 'active', labelId: 'moonlight', joinedAt: now - 40 * 24 * H },
  ];
  const reports = [
    { id: 'r1', streamId: 'd2', reporter: '별빛', target: '욕쟁이123', reason: '채팅 욕설·비하', detail: '출연자에게 반복적으로 외모 비하 발언', at: now - 30 * M, status: 'open' },
    { id: 'r2', streamId: 'd1', reporter: '익명', target: 'spam_bot', reason: '스팸·광고', detail: '외부 링크 도배', at: now - 2 * H, status: 'resolved', resolvedAt: now - 100 * M, action: '영구 차단' },
    { id: 'r3', streamId: 'd3', reporter: '응원단장', target: '도윤', reason: '후원 강요 의심', detail: '후원 안 하면 방송 못 끝낸다는 발언', at: now - 10 * M, status: 'open' },
  ];
  const audit = [
    { id: 'a1', at: now - 100 * M, actor: '운영자', action: '이용자 영구 차단', target: 'spam_bot', detail: '신고 r2 처리' },
    { id: 'a2', at: now - 3 * 24 * H, actor: '운영자', action: '레이블 승인', target: '문라이트', detail: '' },
  ];
  const myGifts = [];   // 내(시연 시청자) 후원 기록 — 시연 중 쌓임
  return { labels, performers, streams, rounds, roundHistory, missions, gifts, chatPool, users, reports, audit, follows: { labels: ['presence'], performers: ['p-miyu'] }, wallet: 5000, myGifts, txnSeq: 1, seededAt: now };
}

/* ---------- 썸네일: 자체 제작 SVG 무대 그래픽 (외부 이미지 없음) ---------- */
export function stageArt(stream, { w = 640, h = 400 } = {}) {
  const hue = stream.hue ?? 268, r = rng((stream.id || 'x').split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  const beams = Array.from({ length: 4 }, (_, i) => { const x = w * (0.15 + 0.7 * r()); const col = `hsl(${(hue + i * 25) % 360} 70% 60% / ${0.18 + r() * 0.12})`; return `<polygon points="${x},0 ${x - 60 - r() * 120},${h} ${x + 60 + r() * 120},${h}" fill="${col}"/>`; }).join('');
  const dots = Array.from({ length: 18 }, () => `<circle cx="${(r() * w).toFixed(0)}" cy="${(h * 0.45 + r() * h * 0.5).toFixed(0)}" r="${(1 + r() * 2.5).toFixed(1)}" fill="hsl(${hue} 80% 85% / ${(0.3 + r() * 0.5).toFixed(2)})"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
    <defs><linearGradient id="g${stream.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 45% 14%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 40% 7%)"/></linearGradient>
    <radialGradient id="s${stream.id}" cx=".5" cy="1.05" r=".8"><stop offset="0" stop-color="hsl(${hue} 70% 55% / .55)"/><stop offset="1" stop-color="transparent"/></radialGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g${stream.id})"/>${beams}<rect width="${w}" height="${h}" fill="url(#s${stream.id})"/>
    <rect x="0" y="${h * 0.82}" width="${w}" height="${h * 0.18}" fill="hsl(${hue} 30% 9%)"/><rect x="${w * 0.1}" y="${h * 0.8}" width="${w * 0.8}" height="4" rx="2" fill="hsl(${hue} 60% 70% / .5)"/>${dots}</svg>`;
}
export const stageArtDataUri = s => 'data:image/svg+xml;utf8,' + encodeURIComponent(stageArt(s));
