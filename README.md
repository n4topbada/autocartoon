# AutoCartoon

웹툰/카툰 스타일 캐릭터 이미지를 AI로 생성하는 Next.js 웹 서비스입니다.
캐릭터 참조 이미지와 텍스트 프롬프트를 기반으로 일관된 스타일의 장면 이미지를 만들고, 생성 결과를 히스토리와 콘텐츠 보드에서 관리할 수 있습니다.

## 주요 기능

- 캐릭터 참조 이미지 기반 이미지 생성
- 텍스트, 스케치, 편집, 변환 모드 지원
- 캐릭터 프리셋 등록/관리 및 대표 이미지 설정
- 캐릭터 마켓플레이스와 구매 흐름
- 배경 이미지 저장 및 생성 이미지 합성
- 생성 히스토리, 즐겨찾기, 태그 관리
- 콘텐츠 슬롯 관리, 게시판, 인스타그램 연동

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
npm run dev
```

개발 서버는 기본적으로 `http://localhost:3000`에서 실행됩니다.

## 환경 변수

`.env`에 아래 값이 필요합니다.

```env
DATABASE_URL=
SESSION_SECRET=
GEMINI_API_KEY=
GEMINI_API_KEY_FALLBACK=
BLOB_READ_WRITE_TOKEN=
RESEND_API_KEY=
NEXT_PUBLIC_APP_URL=
```

`BLOB_READ_WRITE_TOKEN`은 Vercel Blob 업로드에 필요합니다. 로컬 개발에서는 Blob 장애 시 `public/uploads` fallback이 동작하지만, 운영에서는 Vercel Blob Store가 정상 상태여야 캐릭터 등록과 이미지 저장이 정상 작동합니다.

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
