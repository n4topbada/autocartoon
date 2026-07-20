# WONY AutoCartoon Architecture

최종 갱신: 2026-07-18 KST

캐릭터 레퍼런스를 바탕으로 장면·제스처·배경·음성·숏폼·Veo 영상을 만들고 프로젝트와 컷 단위로 편집하는 GCP 기반 Next.js 서비스다. 사용자는 AI API 키를 넣지 않는다.

## Runtime

```text
Client
  -> Cloud Run (Next.js 15 App Router)
      -> Cloud SQL PostgreSQL 16 / Prisma 6
      -> Cloud Tasks (image/video workers)
      -> Vertex AI Gemini / Veo
      -> Google Cloud Text-to-Speech
      -> private GCS
      -> Resend / Kakao OAuth / KakaoPay test integration
```

- Region: Cloud Run, Cloud SQL, Cloud Tasks, GCS는 `asia-northeast3`
- Vertex text/image: `global`
- Veo: `us-central1`
- Authentication: iron-session HttpOnly 쿠키 + `UserSession` 최대 2대
- Storage: `u/{userId}/...` 소유자 경로, `/api/media/{key}` 권한 게이트웨이, 짧은 V4 signed URL
- Local fallback: Cloud Tasks가 없으면 inline job, GCS가 없으면 `public/uploads`

## Data Model

Prisma 모델 33개:

- 인증: `User`, `UserSession`
- 캐릭터: `CharacterGroup`, `CharacterPreset`, `PresetImage`, `PurchasedPreset`
- 생성: `GenerationRequest`, `GeneratedImage`, `SavedBackground`, `GenerationJob`, `GenerationArtifact`
- 과금: `CreditLedger`, `CreditPayment`
- 제작: `CreativeProject`, `SavedProjectBrief`, `ProjectCut`, `CanvasVersion`, `ProjectAsset`
- 커뮤니티: `BoardPost`, `BoardComment`, `BoardLike`, `Report`
- 콘텐츠: `Content`, `ContentSlot`, `PromptPreset`, `ImageTag`, `ImageTagLink`
- 운영: `Announcement`, `AnnouncementRead`, `ChatKnowledge`, `HelpRequest`
- 외부 연동: `InstagramAccount`, `InstagramPost`

API Route Handler는 99개다. `src/middleware.ts`가 인증을 먼저 검사하고 각 라우트가 다시 객체 소유권이나 관리자 역할을 확인한다. 로그인·인증 확인·정책 페이지는 공개이며, 공개 미디어와 Cloud Tasks 핸들러는 각자의 소유권/공유 토큰 검증을 수행한다.

## Durable Generation

1. 클라이언트가 `POST /api/generate`와 idempotency key를 보낸다.
2. 서버가 입력·소유권을 검사하고 `GenerationJob`을 `queued`로 만든다.
3. `CreditLedger`에 서버 계산 비용을 한 번 차감한다.
4. Cloud Tasks가 이미지 또는 영상 핸들러를 호출한다.
5. 상태는 `queued -> running -> storing -> succeeded/failed`와 progress로 저장된다.
6. 결과 원본과 썸네일을 GCS에 저장하고 `GenerationArtifact`에 연결한다.
7. 실패·시간 초과·부분 실패는 동일 reference key의 반대 분개로 환불한다.
8. UI는 폴링과 알림에서 작업을 복구하며 페이지를 떠나도 작업은 계속된다.

Veo는 시작 태스크와 지연 폴 태스크를 분리한다. 로컬에서는 같은 상태/원장 코드를 재사용해 inline으로 실행한다.

운영 `wony-jobs` 큐는 동시 10건, 초당 5건으로 제한하며 최대 5회, 10~300초 지수 백오프로 재시도한다. 외부 AI 장애 때 기본값 수준의 대량 재시도로 비용과 Cloud SQL 부하가 폭증하지 않게 유지한다.

## Credits

- 상품과 작업 비용은 `src/lib/credit-products.ts`가 단일 기준이다.
- 원장은 `referenceKey` unique와 `[jobId, action]` unique로 중복 차감을 막는다.
- 직접 AI 호출은 `withCreditCharge`, 장기 생성은 `reserveJobCredit`를 사용한다.
- 실패 환불은 원래 charge를 조회한 뒤 멱등으로 생성한다.
- KakaoPay 승인 후 크레딧 적립은 DB 트랜잭션으로 처리하고 응답 유실은 주문 조회로 복구한다.
- 운영 결제는 현재 비활성 상태가 정상이다.

## Storage

- `src/lib/storage.ts`가 GCS와 로컬 저장을 추상화한다.
- 원본은 비공개이며 DB에는 공개 URL 대신 미디어 게이트웨이 참조를 저장한다.
- 게이트웨이는 DB 참조, 사용자 소유권, 공개 프리셋 여부를 확인한 뒤 짧은 signed URL로 이동시킨다.
- 브라우저 대용량 업로드는 소유자 경로·MIME·최대 크기를 제한한 signed POST policy를 사용하고 서버에서 존재·크기·소유권을 재검증한다.
- 로컬 폴백도 같은 사용자 경로·허용 폴더·MIME/확장자·용량 정책을 적용하고 모든 파일 경로가 `public` 루트 안에 있는지 확인한다.
- 이미지 저장은 512px WebP 썸네일을 함께 만든다.

## Studio And Canvas

- `CreativeProject` 아래 최대 30개 컷과 프로젝트 자산을 둔다.
- 컷 순서 변경은 unique 충돌을 피하도록 임시 큰 오프셋을 거친다.
- 기획서는 직접 작성하거나 PDF/DOCX/ZIP/Markdown/TXT/CSV/HTML, 이미지 OCR, 공개 URL에서 최대 20,000자를 추출한다. URL은 DNS로 확인한 공개 IP에 연결을 고정하고 리다이렉트마다 사설망 여부를 다시 검사한다.
- `CanvasEditor`는 직접 Canvas 2D 문서 모델을 사용한다.
- 레이어 이동·크기·회전·잠금·그룹·정렬·분배·가이드, 텍스트·말풍선·도형·브러시·지우개·크롭·배경 제거를 지원한다.
- OCR과 영역 AI 다시 그리기는 합성 이미지를 서버 AI 호출에 전달한다.
- 컷 canvas JSON은 자동 저장되고 현재 PNG와 프로젝트 ZIP을 내보낸다.

## Video

- 서버 Veo: 텍스트/이미지 기반 4·6·8초, 9:16/16:9, 720p/1080p, 오디오 옵션.
- 숏폼 빌더: 프로젝트 또는 직접 업로드 컷, 컷별 다중 대사, 화자/보이스, Google TTS.
- 최종 세로 MP4는 브라우저 `ffmpeg.wasm`에서 생성한다. 대형 프로젝트의 메모리 한계가 커지면 Cloud Run Job 기반 렌더러로 이동한다.

## Authentication And Account Linking

- 이메일 소유권은 가입 인증 또는 유효 임시 비밀번호 수신으로 확인한다.
- 카카오 OAuth는 HttpOnly SameSite state 쿠키를 검증한다.
- 카카오 이메일이 없을 때 내부 placeholder 계정을 만든다.
- 설정의 link intent는 기존 로그인 세션을 요구하고, 사용자 데이터가 없는 placeholder만 비활성화해 기존 이메일 계정으로 연결한다.
- 콘텐츠·결제 데이터가 있는 계정은 자동 병합하지 않는다.
- OAuth 로그인 방식을 세션에 기록한다. 소셜 로그인으로 본인 확인한 계정은 알 수 없는 임의 해시를 요구하지 않고 초기 이메일 로그인 비밀번호를 설정할 수 있으며, 설정 직후 일반 비밀번호 세션으로 전환한다.

## Security And Quality Gates

- 비밀번호 bcrypt, 평문 복구 금지
- 객체별 소유권과 관리자 역할 검사
- 입력 MIME·크기·프롬프트 길이 제한
- ZIP 압축 해제 크기·파일 수 제한
- 비공개 GCS, signed upload/read, Cloud Tasks 공유 토큰
- 전역 `nosniff`, frame deny, referrer·브라우저 권한 정책
- `npm audit --omit=dev`, `npm test`, ESLint, TypeScript, Prisma validate, production build

기능 동등성·남은 외부 결정은 [docs/toonagent-reverse-engineering.md](./docs/toonagent-reverse-engineering.md), 운영 절차는 [docs/project-handoff.md](./docs/project-handoff.md)를 따른다.
