/* LIVE STAGE v2 — 공통 코어: 유틸 · 라우터 · 상태 · UI(토스트/모달/확인) · 아이콘 · 아바타 */

export const CONFIG = {
  name: 'LIVE STAGE',
  org: 'PRESENCE Entertainment',
  supabaseUrl: 'https://zomssaylcebzirpvprgq.supabase.co',
  supabaseKey: 'sb_publishable_DNuVzh6ufm5w3vDidiJCdw_Aeux-DQ8',   // publishable(공개) 키만. secret/service_role 은 절대 브라우저에 넣지 않음
  currency: '스타',
  krwPerStar: 10,
  split: { platform: 25, label: 25, performer: 50 },   // 정산 비율(시연 기준). 실서비스 전 계약으로 확정
  orientation: 'portrait',
  storageKey: 'livestage-v2',
  modeKey: 'livestage-v2-mode',
};

/* ---------- 유틸 ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = (p = '') => p + Math.random().toString(36).slice(2, 10);
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const fmt = {
  num: n => Number(n || 0).toLocaleString('ko-KR'),
  star: n => Number(n || 0).toLocaleString('ko-KR') + ' ' + CONFIG.currency,
  krw: n => '₩' + Math.round(Number(n || 0)).toLocaleString('ko-KR'),
  pct: n => (Math.round(Number(n || 0) * 10) / 10) + '%',
  time: t => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
  date: t => new Date(t).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }),
  dateTime: t => new Date(t).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  rel: t => { const d = Date.now() - +new Date(t); const m = Math.round(d / 60000); if (Math.abs(m) < 1) return '방금'; if (m < 60) return m + '분 전'; const h = Math.round(m / 60); if (h < 24) return h + '시간 전'; return Math.round(h / 24) + '일 전'; },
  until: t => { const d = +new Date(t) - Date.now(); if (d <= 0) return '곧 시작'; const m = Math.round(d / 60000); if (m < 60) return m + '분 후'; const h = Math.floor(m / 60); if (h < 24) return h + '시간 ' + (m % 60 ? (m % 60) + '분 ' : '') + '후'; return Math.round(h / 24) + '일 후'; },
  mmss: ms => { const t = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); },
  compact: n => { n = Number(n || 0); if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억'; if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '만'; return n.toLocaleString('ko-KR'); },
};
export const hueOf = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const initials = name => { const s = String(name || '?').trim(); return /[가-힣]/.test(s) ? s.slice(0, 1) : s.slice(0, 2).toUpperCase(); };
export const avatar = (p, cls = '') => `<span class="avatar ${cls}" style="--h:${p.hue ?? hueOf(p.name)}" aria-hidden="true">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : esc(p.emoji && !p.useInitials ? p.emoji : initials(p.name))}</span>`;
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'; return s; };   // CSV 수식 주입 방지
export const downloadText = (name, text, type = 'text/csv') => { const b = new Blob(['﻿' + text], { type: type + ';charset=utf-8' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); };
export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');
export const storage = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};

/* ---------- 아이콘 (inline SVG, stroke) ---------- */
const P = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const icon = {
  home: P('<path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/>'),
  live: P('<circle cx="12" cy="12" r="3"/><path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7"/>'),
  studio: P('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  admin: P('<path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>'),
  user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  users: P('<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><circle cx="17" cy="9" r="3"/><path d="M16 20h6a6 6 0 0 0-4-5.7"/>'),
  search: P('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  gift: P('<path d="M20 12v9H4v-9"/><path d="M2 7h20v5H2z"/><path d="M12 7v14"/><path d="M12 7c-2.5 0-4.5-1.5-4.5-3s1-2 2-2c2 0 2.5 3 2.5 5zm0 0c2.5 0 4.5-1.5 4.5-3s-1-2-2-2c-2 0-2.5 3-2.5 5z"/>'),
  star: P('<path d="M12 3l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.4 6.3 20.5l1.2-6.4L2.8 9.7l6.4-.8z"/>'),
  heart: P('<path d="M12 21s-7-4.6-9.3-9.2C1.1 8.3 3.2 4.5 6.9 4.5c2 0 3.4 1 5.1 3 1.7-2 3.1-3 5.1-3 3.7 0 5.8 3.8 4.2 7.3C19 16.4 12 21 12 21z"/>'),
  crown: P('<path d="M3 18h18l1-11-5.5 4L12 4l-4.5 7L2 7z"/><path d="M4 21h16"/>'),
  flag: P('<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>'),
  block: P('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'),
  share: P('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>'),
  volume: P('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  mute: P('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M22 9l-6 6M16 9l6 6"/>'),
  play: P('<path d="M6 4l14 8-14 8z"/>'),
  pause: P('<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>'),
  stop: P('<rect x="5" y="5" width="14" height="14" rx="2"/>'),
  timer: P('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'),
  target: P('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  check: P('<path d="M5 12l5 5L20 7"/>'),
  x: P('<path d="M6 6l12 12M18 6L6 18"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  minus: P('<path d="M5 12h14"/>'),
  chevron: P('<path d="M9 6l6 6-6 6"/>'),
  chevronDown: P('<path d="M6 9l6 6 6-6"/>'),
  back: P('<path d="M15 6l-6 6 6 6"/>'),
  more: P('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
  copy: P('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  external: P('<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
  download: P('<path d="M12 3v12M6 11l6 6 6-6"/><path d="M4 21h16"/>'),
  refresh: P('<path d="M20 11a8 8 0 0 0-14.5-4M4 13a8 8 0 0 0 14.5 4"/><path d="M20 4v7h-7M4 20v-7h7"/>'),
  settings: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  eye: P('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  calendar: P('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  wallet: P('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1"/>'),
  receipt: P('<path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  trophy: P('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a2 2 0 0 0 0 4h3M16 6h3a2 2 0 0 1 0 4h-3"/><path d="M12 13v4M8 21h8M10 17h4v4"/>'),
  info: P('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  alert: P('<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/>'),
  mic: P('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>'),
  camera: P('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  sparkle: P('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>'),
  layers: P('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5M3 17l9 5 9-5"/>'),
  logout: P('<path d="M10 17l5-5-5-5M15 12H3"/><path d="M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>'),
  bell: P('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'),
  film: P('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>'),
  bolt: P('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  team: P('<rect x="3" y="7" width="8" height="10" rx="2"/><rect x="13" y="7" width="8" height="10" rx="2"/>'),
};

/* ---------- 라우터  (#/path/segments?query) ---------- */
const listeners = new Set();
export const router = {
  parse(hash = location.hash) {
    let h = hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    const seg = path.split('/').filter(Boolean);
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    return { name: seg[0] || 'home', seg, q, path };
  },
  go(path, { replace = false } = {}) { const h = '#/' + String(path).replace(/^#?\/?/, ''); if (replace) history.replaceState(null, '', h); else location.hash = h; if (replace) router.emit(); },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit() { const r = router.parse(); listeners.forEach(fn => fn(r)); },
  href(path) { return '#/' + String(path).replace(/^#?\/?/, ''); },
};
window.addEventListener('hashchange', () => router.emit());

/* ---------- 간단한 상태 저장소 ---------- */
export function createStore(initial) {
  let state = initial; const subs = new Set();
  return {
    get: () => state,
    set(patch) { state = typeof patch === 'function' ? patch(state) : { ...state, ...patch }; subs.forEach(fn => fn(state)); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

/* ---------- 이벤트 버스 ---------- */
export const bus = { _m: new Map(), on(ev, fn) { if (!this._m.has(ev)) this._m.set(ev, new Set()); this._m.get(ev).add(fn); return () => this._m.get(ev)?.delete(fn); }, emit(ev, d) { this._m.get(ev)?.forEach(fn => { try { fn(d); } catch (e) { console.error(e); } }); } };

/* ---------- UI: 토스트 · 모달 · 확인 ---------- */
export function toast(msg, kind = '', ms = 2800) {
  let root = $('#toastRoot'); if (!root) { root = document.createElement('div'); root.id = 'toastRoot'; root.className = 'toast-root'; root.setAttribute('aria-live', 'polite'); document.body.appendChild(root); }
  const d = document.createElement('div'); d.className = 'toast ' + kind; d.innerHTML = `<span>${esc(msg)}</span><button class="x" aria-label="닫기">${icon.x}</button>`;
  d.querySelector('.x').onclick = () => d.remove(); root.appendChild(d);
  while (root.children.length > 3) root.firstChild.remove();
  setTimeout(() => { if (d.isConnected) { d.style.opacity = '0'; d.style.transition = 'opacity .25s'; setTimeout(() => d.remove(), 260); } }, ms);
  return d;
}
let lastFocus = null;
export function modal({ title, body, footer = '', wide = false, onClose, closable = true }) {
  closeModal();
  lastFocus = document.activeElement;
  const root = $('#modalRoot') || (() => { const r = document.createElement('div'); r.id = 'modalRoot'; document.body.appendChild(r); return r; })();
  root.innerHTML = `<div class="modal-bg" role="dialog" aria-modal="true" aria-labelledby="mTitle"><div class="modal ${wide ? 'wide' : ''}">
    <div class="modal-h"><h3 id="mTitle">${title}</h3>${closable ? `<button class="btn icon ghost" data-close aria-label="닫기">${icon.x}</button>` : ''}</div>
    <div class="modal-b">${body}</div>${footer ? `<div class="modal-f">${footer}</div>` : ''}</div></div>`;
  const bg = root.firstElementChild;
  const close = () => { if (!root.firstElementChild) return; root.innerHTML = ''; document.removeEventListener('keydown', onKey); onClose && onClose(); lastFocus && lastFocus.focus && lastFocus.focus(); };
  const onKey = e => { if (e.key === 'Escape' && closable) close(); if (e.key === 'Tab') { const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', bg).filter(x => !x.disabled); if (!f.length) return; const i = f.indexOf(document.activeElement); if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } } };
  document.addEventListener('keydown', onKey);
  bg.addEventListener('click', e => { if (e.target === bg && closable) close(); });
  $$('[data-close]', bg).forEach(b => b.onclick = close);
  const first = $('input, select, textarea, button:not([data-close])', $('.modal-b', bg)) || $('[data-close]', bg); first && first.focus();
  return { close, el: bg };
}
export function closeModal() { const r = $('#modalRoot'); if (r) r.innerHTML = ''; }
export function confirmBox({ title, text, ok = '확인', danger = false }) {
  return new Promise(res => {
    let v = false;
    const m = modal({ title, body: `<p class="muted">${text}</p>`, footer: `<button class="btn ghost" data-close>취소</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cfOk">${esc(ok)}</button>`, onClose: () => res(v) });
    $('#cfOk').onclick = () => { v = true; m.close(); };
  });
}
export function promptBox({ title, label, value = '', placeholder = '', ok = '확인' }) {
  return new Promise(res => {
    let v = null;
    const m = modal({ title, body: `<label class="field"><span>${esc(label)}</span><input id="pbIn" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`, footer: `<button class="btn ghost" data-close>취소</button><button class="btn primary" id="pbOk">${esc(ok)}</button>`, onClose: () => res(v) });
    const go = () => { v = $('#pbIn').value.trim(); m.close(); };
    $('#pbOk').onclick = go; $('#pbIn').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}
export const setLoading = (btn, on) => { if (!btn) return; btn.classList.toggle('loading', !!on); btn.disabled = !!on; };
export async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('복사했습니다', 'ok'); return true; } catch (e) { toast('복사에 실패했습니다 — 직접 선택해 복사하세요', 'warn'); return false; } }

/* ---------- 화면 생명주기: cleanup 등록 ---------- */
export function makeCleanup() {
  const fns = [];
  const c = fn => { if (typeof fn === 'function') fns.push(fn); return fn; };
  c.timer = (id) => { fns.push(() => clearInterval(id)); return id; };
  c.timeout = (id) => { fns.push(() => clearTimeout(id)); return id; };
  c.run = () => { while (fns.length) { try { fns.pop()(); } catch (e) { console.error(e); } } };
  return c;
}
