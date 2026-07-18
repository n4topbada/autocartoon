# WONY AutoCartoon

캐릭터 레퍼런스로 웹툰 장면, 제스처, 배경, 음성, 숏폼과 Veo 영상을 만들고 프로젝트 단위로 편집하는 국내 전용 Next.js 제작 서비스입니다. 사용자는 AI API 키를 입력하지 않으며 플랫폼 소유 GCP Vertex AI와 서버 크레딧을 사용합니다.

- 운영: `https://wonybananabot-272254743773.asia-northeast3.run.app`
- GitHub: `https://github.com/n4topbada/autocartoon`
- Prototype operations: [docs/prototype-observability.md](./docs/prototype-observability.md)
- Cloud SQL scaling runbook: [docs/cloud-sql-scaling-runbook.md](./docs/cloud-sql-scaling-runbook.md)
- Auth and security baseline: [docs/auth-and-security-baseline.md](./docs/auth-and-security-baseline.md)
- 레퍼런스 기능 비교: [docs/toonagent-reverse-engineering.md](./docs/toonagent-reverse-engineering.md)
- 고급 캔버스 상세 비교: [docs/advanced-canvas-parity.md](./docs/advanced-canvas-parity.md)
- 운영 인수인계: [docs/project-handoff.md](./docs/project-handoff.md)
- 코드 감사 기록: [docs/code-audit-2026-07-18.md](./docs/code-audit-2026-07-18.md)
- 운영 기능 E2E 결과: [docs/production-e2e-2026-07-18.md](./docs/production-e2e-2026-07-18.md)
- 카카오 알림톡 도입 절차: [docs/kakao-alimtalk-setup.md](./docs/kakao-alimtalk-setup.md)
- Instagram 보류 범위: [docs/instagram-setup.md](./docs/instagram-setup.md)
- GCS 브라우저 직접 업로드 CORS: [scripts/gcs-cors.json](./scripts/gcs-cors.json)

## 주요 기능

- 중복 바로가기 없는 제작 대시보드, 온보딩, 최근 작업·프로젝트 복구
- 5개 핵심 메뉴: 캐릭터, 배경/장면, 통합 스튜디오, 숏폼, 내 작업
- 구조화 캐릭터 생성·페르소나 설계·1인/2인 제스처, 방향별 레퍼런스, 대표·기본 캐릭터, 보이스 최대 3개
- 최대 4명 장면, 저밀도 배경 3단계와 과거 결과 재사용, 저장 배경의 장면 선택 즉시 반영
- Cloud Tasks 영속 작업, 진행률, 완료 알림, 재시도, 실패 자동 환불
- 통합 보관함, 원본·WebP 썸네일, 타입 필터, 페이지 이동, 저장 용량
- 프로젝트·컷·표지·자산·대사·AI 기획·영상 플랜
- PDF, DOCX, ZIP, Markdown, TXT, CSV, HTML, 이미지 OCR, 공개 URL 기획 자료 가져오기
- 다중 페이지, 레이어·그룹·클리핑·가이드·정렬·필터·말풍선·도형·5종 그리기·OCR 캔버스
- AI 자동·사각형·자유 마스크 편집, 바깥 픽셀 강제 보존, 버전 비교·복원
- 현재 컷 PNG, 전체 컷 ZIP, 자동 저장
- Veo 3.1 Fast와 캐릭터별 Google TTS, ffmpeg.wasm 기반 세로 MP4
- 공개 닉네임, 최신/인기 게시판, 이미지·링크, 댓글, 좋아요, 신고
- 기존 이메일 로그인, 카카오·Google 신규 가입, OAuth 계정 초기 비밀번호 설정, 임시 비밀번호, 기기 세션 최대 2대
- 게시판 옆 WonyBot과 우측 끝 계정 아이콘, `내 작업` 안의 작업 보관함·내 캐릭터·My Content
- 이용약관, 개인정보처리방침, 크레딧·환불정책 초안과 공통 접근 링크
- 관리자 사용자·크레딧·신고·지식 관리

## 크레딧

새 계정에는 30크레딧을 한 번 지급합니다. 유상 기본 크레딧은 1개당 12원이며, 실제 외부 비용이 드는 AI·OCR·TTS·영상과 유료 캐릭터 구매에만 사용합니다. 서버가 상품과 차감량을 결정하고 같은 작업은 한 번만 차감하며 실패하면 같은 원장 참조로 자동 환불합니다.

| 작업 | 비용 |
| --- | ---: |
| AI 채팅, OCR, TTS | 1 |
| 캐릭터 디렉터, AI 기획, 영상 플랜 | 2 |
| 1K 이미지 1장 | 10 |
| 2K 이미지 1장 | 20 |
| Veo 기본 영상 | 60 |
| 6초 / 8초 | +20 / +40 |
| 1080p / 오디오 | +40 / +10 |

| 상품 | 기본 | 보너스 | 보너스율 | 총 적립 | 금액 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 라이트 | 100 | 0 | 0% | 100 | 1,200원 |
| 스타터 | 500 | 100 | 20% | 600 | 6,000원 |
| 크리에이터 | 2,000 | 500 | 25% | 2,500 | 24,000원 |
| 스튜디오 | 8,000 | 3,000 | 37.5% | 11,000 | 96,000원 |

카카오페이 라우트와 원장은 구현돼 있지만 **운영 결제가 되지 않는 것이 현재 정상**입니다. 가맹점 심사, 운영 CID, 사업자 정보·정책 문안·정산 기준과 실제 원가를 최종 확정하기 전에는 활성화하지 않습니다.

## 구성

```text
Browser
  -> Cloud Run / Next.js Route Handlers
  -> Cloud SQL PostgreSQL / Prisma
  -> GenerationJob / GenerationArtifact / CreditLedger
  -> Cloud Tasks
  -> Vertex AI Gemini / Veo / Google Cloud TTS
  -> private GCS + owner-aware media gateway
```

- Next.js 15, React 19, TypeScript, CSS Modules
- Prisma 6, PostgreSQL 16, Cloud SQL
- Cloud Run, Cloud Tasks, private Cloud Storage
- Vertex AI Gemini/Veo, Google Cloud TTS
- iron-session HttpOnly 쿠키, bcrypt, DB 기기 세션
- Resend 이메일, Kakao OAuth 2.0

## 로컬 실행

```powershell
npm install
npx prisma generate
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. 로컬에서 GCP를 호출하려면 Application Default Credentials를 준비합니다.

```powershell
gcloud auth application-default login
```

주요 환경 변수:

```env
DATABASE_URL=
PRISMA_CONNECTION_LIMIT=5
PRISMA_POOL_TIMEOUT=30
SESSION_SECRET=
APP_ORIGIN=http://localhost:3000
RESEND_API_KEY=
PASSWORD_EMAIL_FROM=

PLATFORM_AI_PROVIDER=vertex
GOOGLE_CLOUD_PROJECT=wonybananabot
GOOGLE_CLOUD_LOCATION=global
GOOGLE_CLOUD_VIDEO_LOCATION=us-central1
VERTEX_TEXT_MODEL=gemini-3.1-flash-lite
VERTEX_IMAGE_MODEL=gemini-3.1-flash-image
VERTEX_VIDEO_MODEL=veo-3.1-fast-generate-001
VERTEX_VIDEO_OUTPUT_GCS_URI=gs://BUCKET/autocartoon/veo

GCS_BUCKET=
CLOUD_RUN_BASE_URL=
CLOUD_TASKS_LOCATION=asia-northeast3
CLOUD_TASKS_QUEUE=wony-jobs
TASKS_AUTH_TOKEN=

KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
SOLAPI_API_KEY=
SOLAPI_API_SECRET=
SOLAPI_PFID=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
KAKAOPAY_SECRET_KEY=
KAKAOPAY_CID=TC0ONETIME
```

전체 예시는 [`.env.example`](./.env.example)에 있습니다. 비밀 값과 서비스 계정 JSON을 Git에 커밋하지 않습니다. Cloud Run에서는 런타임 서비스 계정과 Secret Manager를 사용합니다.

## 카카오 로그인

카카오 로그인은 계정 식별 기능이며 카카오페이 승인을 대신하지 않습니다. 현재 등록할 콜백:

```text
http://localhost:3000/api/auth/kakao/callback
https://wonybananabot-272254743773.asia-northeast3.run.app/api/auth/kakao/callback
```

자체 도메인을 연결하면 새 도메인의 콜백을 Kakao Developers에 추가하고 `APP_ORIGIN`을 변경합니다. 안정화 기간에는 기존 Cloud Run 콜백을 함께 유지합니다.

카카오가 이메일을 제공하지 않으면 내부 전용 계정이 생깁니다. 기존 이메일 계정으로 로그인한 뒤 설정의 **카카오 연결**을 사용합니다. 실사용 데이터가 있는 두 계정은 자동 병합하지 않습니다.

## 카카오 알림톡

카카오 로그인과 알림톡은 별도 서비스입니다. 알림톡은 사업자 비즈니스 채널, 공식 딜러사의 발신프로필, 승인 템플릿과 건당 발송 비용이 필요합니다. 현재 SOLAPI 어댑터의 HMAC 인증과 운영자 지원 문의 알림 골격만 준비돼 있으며, 사용자 생성 완료 알림은 휴대전화번호 수집·인증·철회 기능을 넣기 전까지 활성화하지 않습니다.

사업자가 해야 할 등록 절차, 권장 템플릿과 현재 코드 경계는 [카카오 알림톡 도입 준비](./docs/kakao-alimtalk-setup.md)에 기록했습니다.

## 정책 페이지

- `/terms`: 서비스 이용약관
- `/privacy`: 개인정보처리방침
- `/refund`: 크레딧 및 환불정책

세 페이지는 로그인하지 않아도 열립니다. 현재 문안은 운영 전 초안이며, 결제 개시 전 대표자, 사업자등록번호, 주소, 개인정보 보호책임자, 실제 처리 위탁·국외 이전 계약과 환불 산식을 최종 확정해야 합니다.

## Google 로그인과 신규 가입

새 계정은 카카오 또는 Google OAuth로만 생성합니다. 기존 이메일·비밀번호 계정은 그대로 로그인 및 비밀번호 재설정을 사용할 수 있습니다. 새 OAuth 계정은 동일한 외부 IP에서 평생 최대 2개까지 만들 수 있으며, DB에는 IP 원문이 아니라 서버 비밀값으로 만든 HMAC만 저장합니다.

운영 Google OAuth 2.0 **Web application** 클라이언트에는 다음 리디렉션 URI가 등록돼 있습니다.

    http://localhost:3000/api/auth/google/callback
    https://wonybananabot-272254743773.asia-northeast3.run.app/api/auth/google/callback

Client ID와 Client Secret은 Secret Manager의 `google-oauth-client-id`, `google-oauth-client-secret`에 저장하고 Cloud Run의 `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` 환경 변수에서 참조합니다. 리비전 `wonybananabot-00033-9c5`에서 실제 Google 로그인과 기존 계정 세션 생성을 확인했습니다. 자체 도메인을 붙이면 새 콜백을 먼저 추가한 뒤 `APP_ORIGIN`을 바꿉니다.

## 데이터베이스와 배포

```powershell
npx prisma migrate deploy
$env:BUILD_TARGET='cloudrun'
$runtimeEnv='APP_ORIGIN=https://wonybananabot-272254743773.asia-northeast3.run.app,PRISMA_CONNECTION_LIMIT=5,PRISMA_POOL_TIMEOUT=30'
npm run build
gcloud run deploy wonybananabot --source . --project=wonybananabot --region=asia-northeast3 --update-env-vars $runtimeEnv --quiet
```

운영 마이그레이션은 로컬 DB URL이 아니라 Cloud SQL 소켓이 붙은 Cloud Run Job에서 실행합니다.

    .\scripts\run-cloud-sql-migrations.ps1

운영 리소스와 배포 후 점검은 [docs/project-handoff.md](./docs/project-handoff.md)를 따릅니다.

## 검증

```powershell
npm test
npm run lint
npx tsc --noEmit
npx prisma validate
npx --yes knip --reporter compact
npm run build
npm audit --omit=dev
```

테스트는 프롬프트 제약, 캐릭터 참조, 작업 응답, 마스크 밖 픽셀 보존, 회전 좌표·선택, 프로젝트 정규화, 크레딧 상품·비용, 공개 정책 경로, OAuth 계정 관리, 저장 경로·업로드 정책과 카카오 계정 연결 안전 조건을 확인합니다.

운영 기능 E2E는 테스트 전용 계정을 별도로 준비한 뒤 환경 변수로만 자격 증명을 전달합니다. 실제 Gemini, Vertex AI, Veo, TTS, Cloud Tasks, Cloud SQL, GCS와 크레딧 원장을 호출하므로 명시적으로 비용 테스트를 수행할 때만 실행합니다.

```powershell
$env:E2E_BASE_URL='https://wonybananabot-272254743773.asia-northeast3.run.app'
$env:E2E_EMAIL='...'
$env:E2E_PASSWORD='...'
$env:E2E_SECONDARY_EMAIL='...'
$env:E2E_SECONDARY_PASSWORD='...'
$env:E2E_ALLOW_PAID='true'
node scripts/production-e2e.mjs
```
