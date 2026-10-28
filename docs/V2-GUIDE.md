# LIVE STAGE v2 — 화면 모듈 작성 규약 (내부용)

## 구조
```
index.html            셸 (header / #app / bottom-nav / modal / toast) — 수정 금지
app/tokens.css        디자인 토큰 + 공통 컴포넌트 클래스 (여기 있는 클래스만 사용)
app/core.js           $, $$, esc, fmt, icon, avatar, router, bus, toast, modal, confirmBox, promptBox, setLoading, copyText, makeCleanup, csvCell, downloadText, storage, CONFIG
app/engine.js         GIFTS, STAR_PACKAGES, giftById, effectTier, rankPerformers, rankTeams, rankDeltas, roundTimeLeft, canAcceptGift, roundLabel, missionProgress, settle, fanStats, FAN_BADGES, sumBy
app/data.js           data.* (아래 API). 화면은 Supabase 를 직접 만지지 않는다
app/demo-data.js      stageArt(stream) / stageArtDataUri(stream)  — 썸네일 SVG
app/views/<name>.js   화면 모듈
excel-board.js        순위판 오버레이 (뷰어·OBS 공용, 전역 window.ExcelBoard)
```

## 화면 모듈 계약
```js
export default async function render(ctx) { ... }
// ctx = { el, route:{name,seg,q}, cleanup, data, openAuth(), openRole(), renderHeader() }
```
- `el` 에 `innerHTML` 로 그린다. 전체 화면 다시 그리기를 피하고, 실시간 변경은 해당 요소만 갱신한다.
- 타이머·구독·이벤트 리스너는 반드시 `cleanup(fn)` / `cleanup.timer(setInterval(...))` 로 등록 → 라우트 변경 시 자동 정리.
- 라우트: `#/home`, `#/live/:streamId`, `#/studio/:streamId?/:tab?`, `#/settle/:streamId?`, `#/admin/:tab?`, `#/team/:labelId`, `#/performer/:id`, `#/me`
- 링크는 `<a href="#/live/d1">` 처럼 해시 링크. 프로그램 이동은 `router.go('live/d1')`.
- 모든 사용자 입력은 `esc()` 로 출력. 숫자는 `fmt.num / fmt.star / fmt.krw`, `class="num"`.
- 에러: `data.*` 는 `DataError{code,message}` 를 던진다. 화면은 `toast(e.message,'bad')` 로 보여주고 성공처럼 표시하지 않는다. `code==='INSUFFICIENT'` → 가상 충전 유도, `'AUTH'` → `ctx.openAuth()` (서버) / `ctx.openRole()` (시연), `'NOT_SUPPORTED'` → 안내 후 버튼 비활성.
- 시연 모드 표시: `data.mode === 'demo'`. 시연 데이터임을 작은 `pill` 로 표시하되 콘텐츠를 가리지 않는다.
- 모션: `prefersReducedMotion()` 이 true 면 효과 축소.

## data API (모드 공통)
읽기: `me()`, `labels()`, `label(id)`, `streams({status?,labelId?})`, `stream(id)`, `performer(id)`, `rounds(streamId)`, `gifts({streamId?,performerId?,q?,limit?})`, `myGifts()`, `messages(streamId,limit)`, `wallet()`, `blocked()`, `follows()`
쓰기: `sendGift({streamId,performerId,giftId,qty})→{txn,balance,gift,missions,countsForRound}`, `charge(pkgId)`, `sendMessage(streamId,text)`, `report({streamId,target,reason,detail})`, `block(nick)`, `follow('label'|'performer', id, on)`
스튜디오: `createStream(f)`, `cloneStream(id)`, `updateStream(id,{title,status,mode,rules,memo,teams,category,desc})`, `savePerformer(streamId,{id?,name,emoji,team,active,bio})`, `reorderPerformers(streamId, ids)`, `startRound(id,{title,minutes})`, `pauseRound(id)`, `resumeRound(id)`, `endRound(id)`, `addMission(id,{performerId,team,title,kind,threshold})`, `removeMission(mid)`, `resetMission(mid)`
관리자: `reports()`, `resolveReport(id, 'resolve'|'dismiss'|'suspend'|'block')`, `users()`, `sanction(nick,'active'|'suspended'|'blocked')`, `stopStream(id,reason)`, `setLabelStatus(id,status)`, `audit()`, `refundGift(id,reason)`
실시간: `data.subscribe(streamId, { onPerformers(list), onGift(g), onRound(r), onMission(m), onMessage(m), onStream(s) }) → unsub`
기타: `data.mode`, `data.status`, `data.sim`, `setSim(on)`, `setRole(r)`(시연), `reset()`(시연), `bus.on('wallet'|'auth'|'follows'|'reports'|'users'|'reset', fn)`

## 데이터 모양
stream: `{id,title,labelId,hostName,category,hue,status:'live'|'scheduled'|'ended'|'stopped',mode:'individual'|'team',startedAt,endedAt,viewers,performerIds,performers:[performer],round,missions,rules,memo,desc,teams:{A:'달빛팀',B:'불꽃팀'},moderators,label,playUrl?}`
performer: `{id,name,emoji,hue,team,labelId,active,total,roundTotal,sort,bio}`
round: `{no,title,status:'idle'|'running'|'paused'|'ended',startedAt,endsAt,pausedAt,pausedMs}`
mission: `{id,streamId,performerId|null,team|null,title,kind:'single'|'round',threshold,done,doneAt,doneBy,sort}`
gift: `{id,streamId,performerId,performerName,nick,giftId,gift,emoji,qty,stars,createdAt,inRound,refunded,txn,labelId}`
message: `{id,streamId,nick,text,kind:'chat'|'gift'|'system'|'round'|'mission',at,userId}`

## 디자인 규칙 (tokens.css)
- 레이아웃: `.page` (기본 1320px) / `.page.narrow` / `.grid.cards|.two|.stats` / `.row` / `.stack` / `.sec`(제목줄)
- 카드: `.card.pad`, `.panel > .panel-h + .panel-b`, `.stat > .k + .v`, `.note(.gold|.warn|.bad)`, `.empty > .ic + b + span`
- 버튼: `.btn` + `.primary|.violet|.danger|.ghost|.outline` + `.sm|.lg|.icon|.block`; 로딩은 `setLoading(btn,true)`
- 배지: `.pill` + `.live|.gold|.violet|.ok|.warn|.bad|.dark`, `.tag`
- 아바타: `avatar(p,'sm|lg|xl')` (core.js) — 사진 없으면 이니셜/이모지 + 색상
- 폼: `label.field > span + input`, `.form .two`, `.search`, `.chips > .chip.on`, `.seg > button.on`
- 탭: `.tabs > button.on`, 대시보드 `.dash > .side-nav + section`
- 표: `.tbl-wrap > table.tbl` (`td.r` 우측정렬, `td.actions`)
- 방송 카드: `.scard(.hero) > .thumb(.art + .top + .bot) + .t + .m`
- 라이브: `.live-layout(.portrait) > div(.video-wrap) + .panel(순위) + .panel.chat(.chat-log + .chat-in)`, 순위 `.rank-list > .perf.r1`
- 색: 골드는 1위·주요 CTA·강조 숫자에만. 바이올렛은 보조(내 채팅·미션). 빨강은 LIVE·위험.
- 이모지 남용 금지. 아이콘은 `icon.*` SVG.
