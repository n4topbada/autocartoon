# WONY AutoCartoon

캐릭터 레퍼런스를 바탕으로 웹툰 장면, 제스처, 배경, 음성, Veo 영상을 만들고 프로젝트 단위로 편집하는 Next.js 제작 서비스입니다. 사용자가 AI API 키를 넣지 않으며, 플랫폼 소유 Vertex AI 계정과 서버 결제 크레딧을 사용합니다.

## 주요 기능

- 최대 4명 캐릭터를 함께 사용하는 이미지 생성과 편집
- 정면·좌측·우측·후면 레퍼런스와 대표 이미지 관리
- 저밀도 배경, 제스처, 오리지널 캐릭터 생성
- 컷, 대사, 캔버스, 자산, 이미지·영상 작업을 묶은 제작 스튜디오
- Gemini 기반 캐릭터 디렉터, 기획서 변환, 영상 대사 플랜, OCR
- Google Cloud TTS 음성 미리듣기와 Veo 3.1 Fast 영상 생성
- 비동기 Workflow, 진행률, 완료 알림, 재시도, 실패 자동 환불
- 원본과 WebP 썸네일 분리 저장
- 이메일 로그인, 카카오 로그인, 임시 비밀번호와 비밀번호 변경
- 카카오페이 크레딧 충전, 사용·충전·환불 원장

## 크레딧 정책

새 계정에는 30크레딧을 한 번 지급합니다. 페이지 열기, 프로젝트 저장, 업로드 같은 일반 동작은 무료이며 실제 외부 비용이 발생하는 AI·OCR·TTS·영상 호출과 캐릭터 마켓 구매에만 크레딧을 사용합니다.

| 작업 | 크레딧 |
| --- | ---: |
| AI 채팅, OCR, TTS 미리듣기 | 1 |
| 캐릭터 설계, AI 기획안, 영상 플랜 | 2 |
| 1K 이미지 1장 | 10 |
| 2K 이미지 1장 | 20 |
| Veo 영상 기본 | 60 |
| 6초 / 8초 | +20 / +40 |
| 1080p / 오디오 | +40 / +10 |

서버가 상품과 차감량을 결정하므로 클라이언트가 금액을 바꿀 수 없습니다. 동일 작업은 `referenceKey`와 작업별 고유 키로 한 번만 차감됩니다. 모델 호출 또는 결과 저장이 실패하면 같은 원장 참조로 자동 환불합니다.

현재 충전 상품은 다음과 같습니다.

| 상품 | 크레딧 | 금액 |
| --- | ---: | ---: |
| 스타터 | 120 | 4,900원 |
| 크리에이터 | 360 | 12,900원 |
| 스튜디오 | 1,200 | 39,000원 |

가격은 운영 전 [Vertex AI 공식 가격표](https://cloud.google.com/vertex-ai/generative-ai/pricing), 원화 환율, 카카오페이 수수료, 저장·전송 비용을 다시 대조해야 합니다. 가격과 크레딧 수량은 `src/lib/credit-products.ts` 한 곳에서 관리합니다.

## 카카오 로그인

카카오 로그인은 서비스 계정 식별 기능입니다. 카카오페이 결제 승인을 대신하지 않습니다. 이메일 제공 동의를 받은 검증 이메일이 기존 계정과 같으면 해당 계정에 카카오 ID를 연결하고, 이메일을 제공하지 않으면 카카오 전용 내부 계정을 만듭니다.

1. [Kakao Developers](https://developers.kakao.com/)에서 애플리케이션을 만듭니다.
2. 웹 플랫폼 도메인에 로컬 및 운영 주소를 등록합니다.
3. 카카오 로그인을 활성화하고 아래 Redirect URI를 등록합니다.
4. REST API 키와 클라이언트 시크릿을 Vercel 환경 변수에 넣습니다.

```text
http://localhost:3000/api/auth/kakao/callback
https://wonybananabot.vercel.app/api/auth/kakao/callback
```

```env
KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
```

OAuth 요청은 HttpOnly SameSite 쿠키의 일회용 `state`를 검증합니다. 신규 REST API 키의 클라이언트 시크릿 사용을 전제로 구현되어 있습니다.

## 카카오페이

카카오 로그인만으로 결제할 수는 없습니다. 카카오페이는 별도 온라인 가맹점 신청, 심사, CID와 시크릿 키가 필요하며 사용자는 카카오톡 또는 결제 화면에서 결제수단을 선택하고 결제를 승인합니다.

개발 테스트:

```env
KAKAOPAY_SECRET_KEY=카카오페이_Secret_key_dev
KAKAOPAY_CID=TC0ONETIME
```

운영 전환:

1. [KakaoPay Developers](https://developers.kakaopay.com/)에서 온라인 결제 가맹점 신청을 완료합니다.
2. 발급된 운영 CID와 운영 시크릿 키로 환경 변수를 교체합니다.
3. Vercel Production 환경에만 운영 키를 등록합니다.
4. 실제 소액 결제, 취소, 실패, 중복 콜백, 정산 내역을 확인합니다.

결제 흐름은 `ready -> 카카오 사용자 승인 -> approve -> 서버 금액·주문자 검증 -> approved -> 크레딧 적립` 순서입니다. 적립 트랜잭션이 순간 실패하면 승인 상태를 보존하고 다음 지갑 조회에서 다시 적립합니다. 운영 결제에는 카카오페이 가맹점 수수료가 발생할 수 있습니다.

## 구성

```text
Browser
  -> Next.js Route Handler
  -> GenerationJob / CreditPayment / CreditLedger
  -> Vercel Workflow
  -> Vertex AI Gemini / Veo / Google Cloud TTS
  -> Vercel Blob 원본 + 썸네일
  -> ProjectAsset / ProjectCut / GenerationArtifact
```

- Next.js 15, React 19, TypeScript
- Prisma 6, PostgreSQL
- Vercel Blob, Vercel Workflow, Vercel OIDC
- Google Vertex AI, Gemini 3.1 Flash Image, Veo 3.1 Fast
- iron-session HttpOnly 쿠키 인증
- Resend 이메일
- Kakao OAuth 2.0, KakaoPay Online Payment

## 로컬 실행

```bash
npm install
npx vercel env pull .env.local --environment=production
npx prisma generate
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. 로컬에서 Vertex AI를 직접 호출하려면 Application Default Credentials를 준비합니다.

```bash
gcloud auth application-default login
```

전체 환경 변수 예시는 [`.env.example`](./.env.example)에 있습니다. 핵심 항목은 다음과 같습니다.

```env
DATABASE_URL=
SESSION_SECRET=
BLOB_READ_WRITE_TOKEN=
RESEND_API_KEY=
PASSWORD_EMAIL_FROM=
NEXT_PUBLIC_APP_URL=

PLATFORM_AI_PROVIDER=vertex
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_LOCATION=global
GOOGLE_CLOUD_VIDEO_LOCATION=us-central1
VERTEX_TEXT_MODEL=gemini-3.1-flash-lite
VERTEX_IMAGE_MODEL=gemini-3.1-flash-image
VERTEX_VIDEO_MODEL=veo-3.1-fast-generate-001
VERTEX_VIDEO_OUTPUT_GCS_URI=gs://BUCKET/autocartoon/veo

KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
KAKAOPAY_SECRET_KEY=
KAKAOPAY_CID=TC0ONETIME
```

운영에서는 Vercel OIDC와 Google Workload Identity Federation을 권장합니다. 저장한 서비스 계정 JSON을 클라이언트에 노출하거나 저장소에 커밋하지 마세요.

## 데이터베이스와 배포

```bash
npx prisma migrate deploy
npm run build
npx vercel --prod
```

주요 결제 모델:

- `CreditPayment`: 카카오페이 주문, TID, 승인 상태와 금액
- `CreditLedger`: 지급, 구매, 차감, 환불과 처리 후 잔액
- `GenerationJob.creditUnits`: 작업 생성 시 확정한 차감량
- `User.kakaoId`: 카카오 계정 연결
- `User.welcomeCreditsGrantedAt`: 최초 지급 중복 방지

## 검증

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

테스트는 프롬프트 제약, 캐릭터 레퍼런스 선택, 작업 응답, 프로젝트 정규화, 크레딧 상품과 이미지·영상 비용 계산을 확인합니다.

## 관련 문서

- [ToonAgent 역설계와 기능 비교](./docs/toonagent-reverse-engineering.md)
- [현재 구현·기능 차이·접근 정보 인수인계](./docs/project-handoff.md)
- [Kakao Login REST API](https://developers.kakao.com/docs/ko/kakaologin/rest-api)
- [KakaoPay 단건 결제](https://developers.kakaopay.com/docs/payment/online/single-payment)
- [Vertex AI 생성형 AI 가격](https://cloud.google.com/vertex-ai/generative-ai/pricing)
