# AutoCartoon

웹툰/카툰 스타일 캐릭터 이미지를 AI로 생성하는 Next.js 웹 서비스입니다.
캐릭터 참조 이미지와 텍스트 프롬프트를 기반으로 일관된 스타일의 장면 이미지를 만들고, 생성 결과를 히스토리와 콘텐츠 보드에서 관리할 수 있습니다.

## 주요 기능

- 캐릭터 참조 이미지 기반 이미지 생성
- 텍스트, 스케치, 편집, 변환 모드 지원
- 캐릭터 프리셋 등록/관리 및 대표 이미지 설정
- 관리자용 캐릭터 페르소나 설계 채팅 및 동적 설정 패널
- 캐릭터 마켓플레이스와 구매 흐름
- 배경 이미지 저장 및 생성 이미지 합성
- 생성 히스토리, 즐겨찾기, 태그 관리
- 콘텐츠 슬롯 관리, 게시판, 인스타그램 연동
- 이메일 임시 비밀번호 발급 및 계정 설정 내 비밀번호 변경

## 기술 스택

- Next.js 15, React 19, TypeScript
- Prisma, PostgreSQL
- Vercel Blob
- Google Gemini API
- iron-session 기반 세션 인증

## 로컬 실행

```bash
npm install
npx prisma generate
npx vercel env pull .env.local --environment=production
npm run dev
```

개발 서버는 기본적으로 `http://localhost:3000`에서 실행됩니다.
`npm run dev`는 Windows 등에 남아 있는 오래된 전역 환경변수보다 프로젝트의 `.env.local` 값을 우선 적용합니다.

## 환경 변수

`.env`에 아래 값이 필요합니다.

```env
DATABASE_URL=
SESSION_SECRET=
GEMINI_API_KEY=
GEMINI_API_KEY_FALLBACK=
BLOB_READ_WRITE_TOKEN=
RESEND_API_KEY=
PASSWORD_EMAIL_FROM=
NEXT_PUBLIC_APP_URL=
```

`BLOB_READ_WRITE_TOKEN`은 Vercel Blob 업로드에 필요합니다. 로컬 개발에서는 Blob 장애 시 `public/uploads` fallback이 동작하지만, 운영에서는 Vercel Blob Store가 정상 상태여야 캐릭터 등록과 이미지 저장이 정상 작동합니다.

## 계정 복구

로그인 화면의 `비밀번호를 잊으셨나요?`에서 가입 이메일로 30분짜리 영문·숫자 12자리 임시 비밀번호를 발급합니다. 기존 비밀번호는 유지되며, 임시 비밀번호로 로그인하면 설정 탭이 자동으로 열립니다. 새 비밀번호로 변경하면 발급된 임시 비밀번호는 즉시 폐기됩니다.

각 발급 메일 제목에는 고유 요청 번호가 포함됩니다. Gmail이 반복 발급 메일을 과거 대화로 묶어 숨기는 것을 줄이고, 사용자가 가장 최근 메일을 구분할 수 있게 합니다.

실사용자에게 메일을 보내려면 Resend에서 발신 도메인을 인증하고 `PASSWORD_EMAIL_FROM`에 인증된 주소를 설정해야 합니다. `onboarding@resend.dev` 기본 발신자는 Resend 계정 소유자 대상 테스트 용도입니다.

### 발신 도메인 후속 작업

- 보류 사유: `wonyframe.com` DNS는 별도 도메인 관리 담당자가 관리합니다.
- DNS 위치: Hostcocoa 네임서버(`ans1`~`ans4.hostcocoa.com`)
- 담당자 작업: Resend가 안내하는 SPF, DKIM, MX 레코드를 Hostcocoa DNS에 등록하고 도메인을 인증합니다.
- 인증 후 설정: Vercel의 `PASSWORD_EMAIL_FROM`을 `워니바나나봇 <no-reply@wonyframe.com>`으로 지정하고 재배포합니다.
- 인증 전 테스트: `onboarding@resend.dev`는 Resend 계정 소유 이메일로만 발송할 수 있습니다.

## DB 반영

운영/공유 DB에는 migration을 적용합니다.

```bash
npx prisma migrate deploy
```

로컬 스키마를 빠르게 맞출 때만 아래 명령을 사용합니다.

```bash
npm run db:push
```

## 기본 계정과 시드

기본 계정과 시스템 프리셋은 `prisma/seed.ts`에 정의되어 있습니다.

```bash
npm run db:seed
```

## 캐릭터 폴더 등록

합법적으로 확보한 캐릭터 참조 이미지를 폴더에 넣고 프리셋으로 등록할 수 있습니다. PNG/JPG/WEBP/GIF를 지원하며 파일명 순서 기준 첫 4장만 등록합니다.

권한 있는 직접 이미지 URL 목록이 있으면 먼저 폴더로 내려받을 수 있습니다.

```bash
npm run download:images -- --folder="assets/kang-geonma" --manifest="assets/kang-geonma/urls.txt"
```

```bash
npm run import:character -- --name="강건마" --alias="kang-geonma" --folder="assets/kang-geonma" --email="n4topbada@gmail.com"
```

캐릭터 샵에 공개하려면 `--public`을 추가합니다.

## 성능 메모

- 캐릭터 목록 API는 첫 화면 속도를 위해 대표 이미지 1장만 내려줍니다.
- 캐릭터 관리 모달을 열 때 전체 참조 이미지를 별도로 조회합니다.
- 이미지 생성 경로에서는 참조 이미지 로딩과 결과 이미지 저장을 병렬 처리합니다.
- 이미지 저장 시 원본과 512px webp 썸네일을 함께 생성해 갤러리/캐릭터/콘텐츠 목록에는 썸네일을 우선 사용합니다.
- 생성 중에는 단계별 진행 문구를 표시하고, 완료 후 갤러리를 자동 갱신하며 브라우저 알림/토스트를 띄웁니다.
- 자주 조회되는 목록 쿼리에는 Prisma migration으로 인덱스를 추가했습니다.
- 무료/저가 DB와 서버리스 환경에서는 콜드 스타트와 네트워크 지연이 체감될 수 있습니다. 사용량이 늘면 DB 리전, Vercel 플랜, 이미지 CDN/스토리지 구성을 함께 점검하세요.

기존 이미지에 썸네일을 채우려면 아래 스크립트를 실행합니다.

```bash
npm run backfill:thumbnails
```

## 배포 전 체크

```bash
npm run build
npx prisma migrate deploy
```

Vercel Blob Store가 suspended 상태이면 이미지 업로드가 실패합니다. Vercel Dashboard의 Storage/Usage/Billing 상태를 먼저 확인하세요.
