# LIVE STAGE

여러 출연자가 함께하는 라이브 방송 플랫폼 — 시제품 (PRESENCE Entertainment)

## 구성
| 경로 | 내용 |
|---|---|
| `index.html` | 앱 본체 (홈 · 라이브 · 스튜디오 · 관리자). PWA — 폰 홈 화면에 추가 가능 |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | PWA 설정 |
| `server/` | 송출 서버(MediaMTX) Docker 설정 — VPS용 |
| `docs/SERVER-VPS.md` | VPS에 서버 올리는 순서 |
| `docs/SERVER-PC.txt` | 내 PC를 서버로 쓰는 순서 (카드·계정 불필요) |

## 배포
`main` 브랜치에 올리면 Cloudflare Pages가 자동 배포합니다. 빌드 명령 없음, 출력 디렉터리 `/`.

## 현재 단계
- 가상 선물·순위·신고·관리자: 브라우저 안에서 동작 (localStorage)
- 실제 영상: 스튜디오 → 방송 설정 → 재생 주소(HLS)에 MediaMTX / Cloudflare Stream 주소 입력
- 로그인·채팅·결제·정산: 샘플 (다음 단계에서 Supabase / PG 연결)

## 비밀 값
API 키·비밀번호는 코드에 넣지 않습니다. 서버는 `server/.env`(git 제외), 앱은 추후 Cloudflare Pages 환경변수로 관리합니다.
