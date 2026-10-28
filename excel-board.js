/* LIVE STAGE — 순위판 오버레이 (v1 호환 셤).
   v2 부터 순위판은 ES 모듈 app/excel-board.js 로 옮겨졌다:
     import { mount } from './app/excel-board.js';  mount(host, { data, streamId, mode:'obs' })
   이 파일은 옛 페이지(legacy/index-v1.html)가 깨지지 않도록 window.ExcelBoard 를 빈 구현으로만 남긴다. */
(function () {
  console.warn('[excel-board.js] v1 전역 ExcelBoard 는 더 이상 순위판을 그리지 않습니다. app/excel-board.js (ES 모듈) 의 mount() 를 사용하세요.');
  const noop = () => {};
  window.ExcelBoard = {
    mount() { console.warn('[excel-board.js] ExcelBoard.mount 는 v2 에서 비활성화되었습니다 — overlay.html 또는 app/excel-board.js 를 사용하세요'); return { destroy: noop, reload: noop, giftFx: noop, banner: noop, test: noop, pause: noop, skip: noop }; },
  };
})();
