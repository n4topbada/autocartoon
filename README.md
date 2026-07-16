# AutoCartoon

캐릭터 참조를 바탕으로 웹툰 장면, 제스처, 배경, Veo 영상을 만들고 프로젝트 단위로 편집하는 Next.js 제작 서비스입니다.

사용자는 Gemini나 Google Cloud API 키를 입력하지 않습니다. 운영 서버가 플랫폼 소유 Vertex AI 프로젝트를 사용하며, Vercel에서는 OIDC Workload Identity Federation으로 Google Cloud에 키 없이 인증합니다.

## 주요 기능

- 최대 4명 캐릭터를 함께 사용하는 장면 및 제스처 생성
- 캐릭터 정면, 좌측, 우측, 후면 참조 등록과 실제 생성 입력 반영
- 텍스트, 스케치, 편집, 변환 모드
- 저밀도 배경 정리, 일러스트 변환, 앵글 생성
- 프로젝트, 컷, 대사, 자산, 생성 결과를 한 화면에서 다루는 통합 스튜디오
- 컷별 9:16, 16:9, 1:1, 4:5 캔버스 규격
- 레이어, 크롭, 배경 제거, 말풍선 편집과 컷 결과 재저장
- 고해상도 캔버스 결과의 브라우저 직접 Blob 업로드와 공유 자산 참조 보호
- Veo 3.1 Fast 기반 4초, 6초, 8초 영상과 720p, 1080p 출력
- 영속 생성 작업, 실제 단계별 진행률, 새로고침 후 복구, 재시도
- idempotency key 기반 중복 생성 방지와 작업별 크레딧 원장 및 자동 환불
- 원본과 512px WebP 썸네일 분리 저장
- 생성 히스토리, 즐겨찾기, 태그, 콘텐츠, 게시판, Instagram 연동 코드
- 관리자용 캐릭터 페르소나 설계 채팅과 동적 설정 패널
- 이메일 임시 비밀번호와 계정 설정 내 비밀번호 변경

## 생성 구조

```text
브라우저
  -> 생성 작업 등록
  -> GenerationJob + CreditLedger
  -> Vercel Workflow
  -> Vertex AI Gemini / Veo
  -> Vercel Blob 원본 + 썸네일
  -> ProjectAsset + ProjectCut + GenerationArtifact
  -> 3초 폴링, 완료 알림, 화면 자동 갱신
```

이미지와 영상 생성은 HTTP 요청이 끝날 때까지 브라우저가 기다리는 구조가 아닙니다. 작업을 먼저 DB에 기록한 뒤 Workflow가 실행하므로 페이지를 이동하거나 새로고침해도 진행 상태와 결과를 복구할 수 있습니다.

## 기술 스택

- Next.js 15, React 19, TypeScript
- Prisma 6, PostgreSQL
- Vercel Blob, Vercel Workflow, Vercel OIDC
- Google Vertex AI, Gemini Image, Veo 3.1
- iron-session HttpOnly 쿠키 인증
- Resend 이메일
- Sharp 썸네일 처리

## 로컬 실행

```bash
npm install
npx prisma generate
npx vercel env pull .env.local --environment=production
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. `scripts/dev.mjs`가 프로젝트의 `.env`와 `.env.local`을 오래된 전역 환경 변수보다 우선 적용합니다.

Vertex AI를 로컬에서 호출하려면 Google Cloud Application Default Credentials를 준비합니다.

```bash
gcloud auth application-default login
```

## 환경 변수

전체 예시는 [`.env.example`](./.env.example)에 있습니다.

필수 애플리케이션 설정:

```env
DATABASE_URL=
SESSION_SECRET=
BLOB_READ_WRITE_TOKEN=
RESEND_API_KEY=
PASSWORD_EMAIL_FROM=
NEXT_PUBLIC_APP_URL=
```

권장 운영 AI 설정:

```env
PLATFORM_AI_PROVIDER=vertex
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_LOCATION=global
GOOGLE_CLOUD_VIDEO_LOCATION=us-central1
VERTEX_TEXT_MODEL=gemini-3.1-flash-lite-preview
VERTEX_IMAGE_MODEL=gemini-3.1-flash-image-preview
VERTEX_VIDEO_MODEL=veo-3.1-fast-generate-001
VERTEX_VIDEO_OUTPUT_GCS_URI=gs://BUCKET/autocartoon/veo
```

Vercel OIDC와 Google Workload Identity Federation:

```env
GCP_PROJECT_NUMBER=
GCP_SERVICE_ACCOUNT_EMAIL=
GCP_WORKLOAD_IDENTITY_POOL_ID=
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=
```

서비스 계정 JSON은 로컬 또는 비상용 대안으로만 지원합니다. 운영은 장기 비밀키가 없는 OIDC 방식을 권장합니다. `GEMINI_API_KEY`와 `GEMINI_API_KEY_FALLBACK`은 Vertex를 쓰지 않는 서버 측 호환 모드용이며 사용자에게 노출하지 않습니다.

## Google Cloud 권한

Vercel이 가장하는 서비스 계정에는 다음 최소 권한이 필요합니다.

- 프로젝트: `roles/aiplatform.user`
- Veo 출력 버킷: `roles/storage.objectAdmin`
- 서비스 계정 impersonation: 배포 환경별 OIDC principal에 `roles/iam.workloadIdentityUser`

OIDC provider 조건은 Vercel 팀, 프로젝트, `development`/`preview`/`production` 환경으로 제한하는 것을 권장합니다.

## DB 반영

운영 및 공유 DB에는 migration을 사용합니다.

```bash
npx prisma migrate deploy
```

현재 스튜디오 migration은 다음 데이터를 추가합니다.

- `GenerationJob`, `GenerationArtifact`, `CreditLedger`
- `CreativeProject`, `ProjectCut`, `ProjectAsset`
- 캐릭터 persona, voiceConfig, 4면 이미지 view

## 검증

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

테스트는 4면 참조 선택, 다중 캐릭터 대표 이미지 제한, 저밀도 배경 프롬프트, 영속 작업 응답 계약을 확인합니다. 프로덕션 빌드에서는 이미지와 영상 Workflow 2개 및 8개 step이 함께 컴파일됩니다.

## 계정 복구

로그인 화면의 `비밀번호를 잊으셨나요?`에서 가입 이메일로 30분 동안 유효한 영문·숫자 12자리 임시 비밀번호를 발급합니다. 임시 비밀번호로 로그인하면 설정 화면이 열리고, 새 비밀번호를 저장하면 임시 비밀번호가 즉시 폐기됩니다.

실사용자 발송 전에는 Resend에서 발신 도메인을 인증하고 `PASSWORD_EMAIL_FROM`을 인증 주소로 바꿔야 합니다. `onboarding@resend.dev`는 Resend 계정 소유자 대상 테스트 발신자입니다.

## 캐릭터 폴더 등록

권한을 확보한 PNG, JPG, WebP, GIF 이미지를 폴더에서 프리셋으로 등록할 수 있습니다.

```bash
npm run import:character -- --name="캐릭터 이름" --alias="character-alias" --folder="assets/character" --email="admin@example.com"
```

공개 마켓에 노출하려면 `--public`을 추가합니다.

## 운영 메모

- Veo와 Gemini 비용은 사용자 API 키가 아니라 플랫폼 Google Cloud 프로젝트에 청구됩니다.
- Veo는 영상 길이와 해상도에 따라 비용과 대기 시간이 커지므로 내부 크레딧과 작업 원장을 유지합니다.
- Vercel Blob 또는 GCS가 정지되면 결과 저장이 실패하며 작업 크레딧은 자동 환불됩니다.
- 기존 원본의 썸네일은 `npm run backfill:thumbnails`로 채울 수 있습니다.
- 레퍼런스의 실제 보이스 공급자와 음성 복제 계약은 공개 화면에서 확정하지 못했습니다. 현재는 브라우저 음성 미리듣기와 Veo 자체 오디오를 제공하며, 서버 TTS 및 내레이션 합성은 별도 공급자와 라이선스 결정 후 연결할 영역입니다.

상세한 레퍼런스 분석과 기능 차이는 [`docs/toonagent-reverse-engineering.md`](./docs/toonagent-reverse-engineering.md)에 기록돼 있습니다.
