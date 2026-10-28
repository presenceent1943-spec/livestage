# LIVE STAGE — 실제 송출 패키지

폴더 구성
- `livestage.html` — 시제품 화면 (PC·폰 브라우저로 그냥 더블클릭해서 열면 됩니다)
- `server/` — 송출 서버(MediaMTX) 설정. VPS에 올립니다.

## 0. 준비물 (비용은 추정)
- VPS 1대: 서울 리전, 2vCPU / 2GB RAM / 트래픽 2TB 이상 — 월 약 1~2만 원 (Vultr Seoul, AWS Lightsail Seoul, Oracle Cloud Seoul 등)
- PC: OBS Studio (무료)   /   폰: Larix Broadcaster (iOS·Android 무료)
- 동시 시청자 수십~수백 명까지는 이 구성으로 충분합니다. 수천 명 이상은 CDN이 필요합니다 (아래 "한계" 참고).

## 1. VPS 만들기
1. Ubuntu 22.04 (또는 24.04) 로 서버 생성, 서울 리전 선택
2. 방화벽(보안 그룹)에서 **TCP 1935, 8888, 8889** 와 **UDP 8189** 인바운드 허용 (SSH 22 는 기본)
3. 서버 공인 IP 메모

## 2. 서버에 설치 (터미널에서 순서대로)
```bash
# SSH 접속
ssh root@서버IP

# Docker 설치
curl -fsSL https://get.docker.com | sh

# 패키지 올리기: 내 PC에서 (새 터미널)
scp -r ./server root@서버IP:/opt/livestage

# 다시 서버에서
cd /opt/livestage
cp .env.example .env
nano .env        # PUBLISH_PASS 를 길고 어려운 비밀번호로, SERVER_PUBLIC_IP 를 공인 IP로 수정 → Ctrl+O, Enter, Ctrl+X
docker compose up -d
docker compose logs -f   # "listener opened on :1935 (RTMP)" 등이 보이면 성공. Ctrl+C 로 빠져나옴
```

## 3. 방송 켜기
### PC — OBS
- 설정 → 방송 → 서비스 **사용자 지정**
- 서버: `rtmp://서버IP:1935/`
- 스트림 키: `live?user=presence&pass=비밀번호`
- 출력: 720p 30fps, 2500~3500 kbps, 키프레임 간격 1~2초
- **방송 시작**

### 폰 — Larix Broadcaster
- Connections → + → URL `rtmp://서버IP:1935/live`
- Login: presence / Password: 비밀번호 (Authorization: RTMP)
- 720p 30fps 2000~3000 kbps
- 빨간 버튼으로 송출 시작

## 4. 보기
- 가장 빠른 확인: 브라우저에서 `http://서버IP:8889/live/` (MediaMTX 내장 저지연 플레이어)
- 시제품 화면: `livestage.html` 열기 → 데모 역할 **호스트** → **📡 방송 켜기** 탭 → 서버 IP 입력 → "저장하고 이 방송에 연결" → **라이브** 탭에서 영상 확인
- 폰에서도 `livestage.html` 을 열면 (카카오톡/메일로 파일을 보내 열어도 됨) 같은 영상이 나옵니다.

## 5. 채널을 여러 개 쓰려면
- 경로(path)만 바꾸면 됩니다: OBS 스트림 키 `miyu?user=...` → 시청 `http://서버IP:8888/miyu/index.m3u8`
- `mediamtx.yml` 의 `all_others` 설정 덕분에 경로를 미리 등록하지 않아도 됩니다.

## 6. 한계와 다음 단계
- **HTTPS 없음**: 지금은 http 로 동작. 실제 서비스 도메인 + Caddy/Let's Encrypt 로 https 화 필요. (폰 **브라우저에서 바로 카메라로 송출**하는 WHIP 기능도 https 가 있어야 켜집니다 — 그래서 1차는 Larix 앱 사용)
- **시청자 인증 없음**: 누구나 주소만 알면 볼 수 있음. 유료·회원제로 가면 read 권한에 토큰 인증 추가
- **동시 시청 규모**: 단일 서버 HLS 는 서버 대역폭이 한계 (3Mbps × 시청자 수). 1,000명이면 약 3Gbps → 반드시 CDN(Cloudflare Stream, Mux, AWS IVS, 또는 MediaMTX 앞에 Cloudflare) 필요
- **녹화·VOD**: `record: yes` 옵션으로 서버 녹화 가능 (디스크 용량 주의)

## 7. 문제 해결
| 증상 | 확인 |
|---|---|
| OBS "서버에 연결 실패" | 방화벽 1935 TCP, 서버에서 `docker compose logs -f` 에 인증 실패 메시지 여부, 스트림 키의 `?user=&pass=` 오타 |
| 플레이어 검은 화면 | 송출이 실제로 켜져 있는지, 8888 포트 방화벽, 주소 끝이 `/index.m3u8` 인지 |
| 지연이 10초 이상 | OBS 키프레임 간격을 1초로, 또는 8889 WebRTC 플레이어 사용 |
| 끊김 | 비트레이트를 2000 kbps 로 낮추기, 서버 트래픽 한도 확인 |
