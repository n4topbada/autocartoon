# AutoCartoon (WonyBananaBot) — Architecture

캐릭터 레퍼런스 기반으로 웹툰 장면·제스처·배경·음성·Veo 영상을 만들고 프로젝트(컷) 단위로
편집하는 Next.js 제작 서비스. 사용자는 AI API 키를 넣지 않으며, 플랫폼 소유 Vertex AI와
서버 결제 크레딧을 사용한다.

> 이 문서는 2026-07-17 코드 감사 기준으로 갱신했다. 세부 기능·격차·레퍼런스 대비 분석은
> [`docs/toonagent-reverse-engineering.md`](./docs/toonagent-reverse-engineering.md)를 참고한다.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, CSS Modules
- **Backend**: Next.js Route Handlers (서버리스)
- **DB**: PostgreSQL + Prisma 6
- **Storage**: Vercel Blob (원본 + WebP 썸네일 분리)
- **비동기 작업**: Vercel Workflow (durable job), 클라이언트 폴링 복구
- **AI**: 플랫폼 소유 Google Vertex AI — Gemini 3.1 Flash Image, Veo 3.1 Fast, Google Cloud TTS(Chirp 3 HD)
- **인증**: iron-session HttpOnly 쿠키, bcrypt, 기기 세션(최대 2대)
- **로그인/결제**: Kakao OAuth 2.0, KakaoPay 단건 결제
- **이메일**: Resend (가입 인증·임시 비밀번호)
- **클라우드 접근**: Vercel OIDC + GCP Workload Identity Federation (장기 키 미배포)

---

## Database Schema (29 Models)

### 캐릭터/마켓
- **CharacterGroup** — 캐릭터 그룹(유니버스)
- **CharacterPreset** — 프리셋(이름, 대표 이미지, price, isPublic, persona, voiceConfig, isDefault)
- **PresetImage** — 프리셋 참조 이미지(`view`: front/left/right/back/reference, order)
- **PurchasedPreset** — 구매 기록(userId+presetId unique)

### 생성/작업
- **GenerationRequest** / **GeneratedImage** — 레거시 및 갤러리 이미지
- **SavedBackground** — 저장된 배경
- **GenerationJob** — durable 작업(status/stage/progress, idempotencyKey, creditSource/Units, runId)
- **GenerationArtifact** — 작업 산출물(이미지/영상)

### 크레딧/결제
- **CreditLedger** — 지급·구매·차감·환불 원장(referenceKey unique, `@@unique([jobId, action])`)
- **CreditPayment** — KakaoPay 주문(TID, 상태, 금액)

### 스튜디오(제작 워크스페이스)
- **CreativeProject** — 프로젝트(비율/캔버스 크기, coverCutId)
- **ProjectCut** — 컷(order `@@unique([projectId, order])`, prompt, dialogue, dialoguePlan, scene, canvas, imageUrl/videoUrl)
- **ProjectAsset** — 프로젝트 자산
- **SavedProjectBrief** — 저장된 기획서

### 커뮤니티/기타
- **BoardPost / BoardComment / BoardLike** — 게시판
- **Content / ContentSlot** — 콘텐츠 슬롯(스토리보드)
- **ImageTag / ImageTagLink** — 개인 태그
- **PromptPreset** — 저장된 프롬프트
- **ChatKnowledge / HelpRequest** — 챗봇 RAG, 사람 호출
- **InstagramAccount / InstagramPost** — 인스타그램 연동
- **User / UserSession** — 사용자, 기기 세션

---

## API Routes (약 80개 route.ts)

주요 그룹:

- **auth**: login, register, verify, me, logout, forgot-password, change-password, account,
  sessions, kakao, kakao/callback
- **generate / jobs**: `POST /api/generate`(이미지·배경·제스처·캐릭터 durable 작업),
  `GET/POST /api/jobs`, `GET/POST /api/jobs/[id]`(재시도) — 202 + 폴링 계약, 리퍼 환불
- **studio**: projects·cuts·assets·briefs CRUD, ocr, video-plan, projects/from-brief
- **presets / groups / marketplace**: 프리셋·그룹·이미지·대표·썸네일·구매·from-generated
- **credits / payments**: `GET /api/credits`, kakao ready/approve/cancel/fail
- **history / archive / images / contents / tags**: 갤러리·보관함·즐겨찾기·슬롯·태그
- **board**: 글·댓글·좋아요·핀
- **character-designer / chat / help / tts / shorts**
- **instagram**: auth·callback·publish·insights·posts·disconnect
- **admin**: users, knowledge

미들웨어(`src/middleware.ts`)가 `/api/*`를 인증 게이트하고, 개별 핸들러가 소유권을 다시 확인한다.

---

## 핵심 서브시스템

### 1. Durable 생성 작업
`POST /api/generate`는 `GenerationJob`을 `queued`로 만들고 `reserveJobCredit`로 크레딧을 차감한 뒤
Vercel Workflow를 시작하고 202를 반환한다. 클라이언트는 `GET /api/jobs/[id]`를 폴링한다.
`queued → running(stage별 progress) → storing → succeeded/failed`로 상태가 저장되고, 실패 시
`failGenerationJob`이 원장 반대 분개로 환불한다. 폴링 라우트의 리퍼가 시간 초과(이미지 10분/영상 45분)
작업을 실패+환불 처리한다.

### 2. 크레딧 원장
서버가 상품과 차감량을 결정한다. 동일 작업은 `referenceKey`/`job:{id}:charge`로 한 번만 차감되고,
실패는 `:refund`, 다중 count 부분 실패는 `:partial-refund`로 되돌린다. KakaoPay 결제는
`ready → approve → 서버 검증 → 적립`이며, 캡처 후 검증 실패는 `failed`가 아니라 `needs_review`로 보존한다.

### 3. 스튜디오
프로젝트/컷/자산 CRUD, 자동 저장, PNG/ZIP 내보내기, 컷 순서(2단계 +1000 시프트로 유니크 충돌 방지),
객체 캔버스(`CanvasEditor`) 연결, 영상 대사 플랜과 Veo 시작.

### 4. 캔버스 편집기 (`CanvasEditor`, ~2,700줄)
레이어(추가/삭제/순서/잠금), 이동·스케일·회전, 크롭, 배경 제거(flood fill), 말풍선(5종), 텍스트,
도형, 패널 레이아웃, OCR, AI 다시 그리기. 30단계 undo + redo(Ctrl+Z/Shift+Z/Ctrl+Y), 텍스트 입력 중
단축키 무시. 비율 6종: 1:1(1080²), 4:5(1080×1350), 3:4(960×1280), 8:11(800×1100),
9:16(1080×1920), 16:9(1920×1080). 고해상도는 브라우저 직접 Blob 업로드 후 `/api/images/save`.

---

## 레퍼런스(ToonAgent) 대비 의도적 분기

- 사용자 BYOK 대신 플랫폼 소유 Vertex AI
- 구독/저장량 과금 대신 내부 크레딧 + KakaoPay 단건 결제
- localStorage JWT 대신 iron-session HttpOnly 쿠키
- 음성 복제·서버 영상 렌더러·마케팅/CX 플랫폼 모듈은 공급자·범위 확정 전까지 미구현

---

## 검증

```bash
npm test        # 프롬프트 제약, 크레딧/보너스, 비용 계산, 작업 응답 정규화
npx tsc --noEmit
npx eslint .
npm run build
```

*마지막 업데이트: 2026-07-17*
*© 2026 wonyframe.inc*
