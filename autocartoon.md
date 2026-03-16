# 워니의 Autocartoon Bot — 기술 문서

## 1. 개요

웹툰/카툰 스타일 캐릭터 이미지를 AI(Google Gemini)로 생성하는 웹 서비스.
캐릭터 참조 이미지 + 텍스트 프롬프트로 일관된 스타일의 장면 이미지를 생성한다.

**서비스 URL**: https://autocartoon.vercel.app

---

## 2. 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 프레임워크 | Next.js 15 (App Router) | TypeScript, React 19 |
| DB | PostgreSQL (Neon) + Prisma 6.x | 서버리스 PostgreSQL |
| 이미지 저장 | Vercel Blob (public) | 생성 이미지 & 배경 저장 |
| 정적 프리셋 | `public/presets/` | 시스템 캐릭터 레퍼런스 이미지 |
| 인증 | iron-session 8.0 | HTTP-Only 암호화 쿠키 |
| 비밀번호 | bcryptjs | 10 rounds salt hash |
| AI | Google Gemini (`@google/genai`) | `gemini-3.1-flash-image-preview` |
| 이메일 | Resend | 회원가입 인증 메일 발송 |
| UI 아이콘 | react-icons (Lucide) | `react-icons/lu` |
| 배포 | Vercel | `output: "standalone"` |

---

## 3. 프로젝트 구조

```
autocartoon/
├── prisma/
│   ├── schema.prisma           # DB 스키마 (PostgreSQL)
│   └── seed.ts                 # 시드: 계정 + 시스템 프리셋 등록
├── public/
│   └── presets/
│       ├── wony/               # Wony 캐릭터 레퍼런스 (4장)
│       └── anian/              # Anian 캐릭터 레퍼런스 (5장)
├── src/
│   ├── app/
│   │   ├── layout.tsx          # 루트 레이아웃 (AuthProvider 래핑)
│   │   ├── page.tsx            # 메인 페이지 (캐릭터/배경 탭, 마켓플레이스)
│   │   ├── login/page.tsx      # 로그인 / 회원가입
│   │   ├── verify/page.tsx     # 이메일 인증 결과
│   │   ├── admin/page.tsx      # 관리자 페이지
│   │   └── api/
│   │       ├── auth/           # 로그인, 회원가입, 로그아웃, 인증
│   │       ├── generate/       # 캐릭터 이미지 생성
│   │       ├── background-generate/  # 배경 이미지 생성
│   │       ├── backgrounds/    # 저장된 배경 CRUD
│   │       ├── presets/        # 캐릭터 프리셋 CRUD
│   │       ├── history/        # 생성 히스토리
│   │       ├── images/[id]/    # 이미지 즐겨찾기/삭제
│   │       ├── marketplace/    # 마켓플레이스 목록
│   │       ├── marketplace/purchase/ # 프리셋 구매
│   │       └── admin/users/    # 관리자 유저 관리
│   ├── components/
│   │   ├── AuthProvider.tsx    # 인증 Context
│   │   ├── UserAvatar.tsx      # 우상단 사용자 메뉴 (바나나 잔액, © wonyframe.inc)
│   │   ├── BackgroundGenerator.tsx
│   │   ├── WorkflowCard.tsx
│   │   ├── ImageDropZone.tsx
│   │   └── ImageModal.tsx
│   ├── lib/
│   │   ├── auth.ts             # requireAuth, requireAdmin
│   │   ├── session.ts          # iron-session 설정
│   │   ├── credit-service.ts   # 크레딧(바나나)/티어 차감 로직
│   │   ├── tier-config.ts      # 티어별 월 한도
│   │   ├── generation-service.ts  # Gemini 호출 + Blob 저장
│   │   ├── gemini.ts           # Gemini API 클라이언트 (primary + fallback key)
│   │   ├── prompt-config.ts    # ⭐ 프롬프트 설정 (모든 템플릿 집중 관리)
│   │   ├── prompts.ts          # 캐릭터 생성 프롬프트 빌더
│   │   ├── background-prompts.ts  # 배경 생성 프롬프트 빌더
│   │   ├── blob.ts             # Vercel Blob 업로드/다운로드/삭제
│   │   └── prisma.ts           # Prisma 싱글턴
│   └── middleware.ts           # 라우트 보호 (인증/관리자)
├── assets/                     # 원본 에셋 (git용 원본 보관)
│   ├── wony/
│   └── anian/
├── .env                        # 환경변수 (git 제외)
└── next.config.ts
```

---

## 4. 프롬프트 설정 (prompt-config.ts)

모든 AI 프롬프트 템플릿이 `src/lib/prompt-config.ts`에 집중되어 있다.
이 파일 하나만 수정하면 생성 결과의 톤/스타일을 조정할 수 있다.

| 키 | 용도 |
|----|------|
| `STYLE_INSTRUCTION` | 공통 스타일 지시문 (웹툰 스타일, 워터마크 금지 등) |
| `BG_IMAGE_INSTRUCTION` | 배경 이미지 합성 지시문 |
| `TEXT_MODE` | 텍스트 모드 (reference, task, backgroundPrefix) |
| `SKETCH_MODE` | 스케치 모드 |
| `EDIT_MODE` | 편집 모드 |
| `TEXT_WITH_BG_IMAGE` | 텍스트 + 배경이미지 모드 |
| `SKETCH_WITH_BG_IMAGE` | 스케치 + 배경이미지 모드 |
| `EDIT_WITH_BG_IMAGE` | 편집 + 배경이미지 모드 |
| `BG_CLEANUP` | 배경 정리 (default, withPrompt) |
| `BG_STYLIZE` | 배경 스타일라이즈 |
| `BG_ANGLES` | 배경 앵글 변경 |

템플릿 변수: `{{characterName}}`, `{{userPrompt}}`, `{{background}}`, `{{angles}}`

---

## 5. 인증 시스템

### 5.1 세션 방식

- **iron-session**: 서버 사이드 암호화 쿠키 (`autocartoon_session`)
- 쿠키 속성: `httpOnly`, `secure (prod)`, `sameSite: lax`
- 세션 데이터: `{ userId, email, role }`

### 5.2 회원가입 플로우

```
1. 이메일 + 비밀번호 입력
2. bcrypt 해시 → DB 저장 (emailVerified = false)
3. 32바이트 인증 토큰 생성 (24시간 유효)
4. Resend API로 인증 메일 발송
5. 메일 내 링크 클릭 → /api/auth/verify?token=xxx
6. emailVerified = true → 로그인 가능
```

> RESEND_API_KEY가 없으면 자동 인증 (개발 환경용)

### 5.3 라우트 보호 (middleware.ts)

| 라우트 | 보호 수준 |
|--------|-----------|
| `/login`, `/verify`, `/api/auth/*` | 공개 |
| `/api/generate`, `/api/background-generate` | `requireAuth()` |
| `/api/admin/*` | `requireAdmin()` |
| 그 외 모든 라우트 | 로그인 필요 (리다이렉트) |

---

## 6. 크레딧(바나나) & 티어 시스템

### 6.1 이중 체계

이미지 생성 시 **두 가지 "잔고"**를 순서대로 차감:

```
1차: 월간 티어 무료 사용량 (tierUsedThisMonth < 월 한도)
2차: 바나나 크레딧 (credits -= 1)
둘 다 소진 → 402 에러 (생성 불가)
```

> UI에서는 "바나나 🍌"로 표시, 내부 코드에서는 `credits`

### 6.2 티어별 월 한도

| 티어 | 월 무료 생성 | 비고 |
|------|-------------|------|
| free | 5회 | 기본 |
| basic | 30회 | |
| pro | 100회 | |
| enterprise | 무제한 | 관리자용 |

### 6.3 마켓플레이스 구매

- 시스템 프리셋(`userId = null`)은 마켓플레이스에 등록
- `price` 필드로 바나나 가격 설정 (0 = 무료)
- 구매 시 `PurchasedPreset` 레코드 생성 + credits 차감
- 구매한 프리셋만 캐릭터 선택 목록에 표시

---

## 7. 데이터베이스 스키마

### User

| 필드 | 타입 | 설명 |
|------|------|------|
| id | String (CUID) | PK |
| email | String (unique) | 로그인 이메일 |
| passwordHash | String | bcrypt 해시 |
| name | String? | 표시 이름 |
| role | String | `user` / `admin` |
| tier | String | `free` / `basic` / `pro` / `enterprise` |
| credits | Int | 잔여 바나나 크레딧 |
| tierUsedThisMonth | Int | 이번 달 티어 사용량 |
| tierResetAt | DateTime | 티어 리셋 시점 |
| emailVerified | Boolean | 이메일 인증 여부 |
| purchasedPresets | PurchasedPreset[] | 구매한 프리셋 목록 |

### CharacterPreset

| 필드 | 타입 | 설명 |
|------|------|------|
| id | String (CUID) | PK |
| alias | String (unique) | 고유 별칭 (예: `wony`, `anian`) |
| name | String | 캐릭터 표시 이름 |
| userId | String? | null = 시스템 프리셋 (마켓플레이스) |
| price | Int | 바나나 가격 (0 = 무료) |
| purchasedBy | PurchasedPreset[] | 구매 기록 |

### PurchasedPreset

| 필드 | 타입 | 설명 |
|------|------|------|
| userId | String (FK) | 구매한 유저 |
| presetId | String (FK) | 구매한 프리셋 |
| @@unique | [userId, presetId] | 중복 구매 방지 |

### PresetImage

| 필드 | 타입 | 설명 |
|------|------|------|
| presetId | String (FK) | 프리셋 참조 |
| blobUrl | String | 이미지 URL (정적 경로 또는 Vercel Blob) |
| mimeType | String | MIME 타입 |
| order | Int | 정렬 순서 |

### GeneratedImage

| 필드 | 타입 | 설명 |
|------|------|------|
| requestId | String (FK) | 생성 요청 참조 |
| blobUrl | String | Vercel Blob URL |
| favorite | Boolean | 즐겨찾기 여부 |

### SavedBackground / GenerationRequest

기존 구조 유지. 이미지는 Vercel Blob URL로 저장.

---

## 8. API 라우트 목록

| 라우트 | 메서드 | 인증 | 설명 |
|--------|--------|------|------|
| `/api/auth/login` | POST | - | 로그인 |
| `/api/auth/register` | POST | - | 회원가입 |
| `/api/auth/verify` | GET | - | 이메일 인증 |
| `/api/auth/me` | GET | - | 현재 유저 정보 |
| `/api/auth/logout` | POST | 세션 | 로그아웃 |
| `/api/generate` | POST | `requireAuth` | 캐릭터 이미지 생성 (크레딧 차감) |
| `/api/background-generate` | POST | `requireAuth` | 배경 이미지 생성 (크레딧 차감) |
| `/api/presets` | GET/POST | POST만 인증 | 프리셋 조회(구매한 것만)/생성 |
| `/api/presets/[id]/thumbnail` | GET | - | 프리셋 썸네일 |
| `/api/backgrounds` | GET/POST | POST만 인증 | 저장 배경 조회/저장 |
| `/api/backgrounds/[id]` | DELETE | `requireAuth` | 배경 삭제 |
| `/api/history` | GET | - | 생성 히스토리 (프리셋별, 즐겨찾기 필터) |
| `/api/images/[id]` | PATCH/DELETE | `requireAuth` | 이미지 즐겨찾기 토글 / 삭제 |
| `/api/marketplace` | GET | `requireAuth` | 시스템 프리셋 목록 (가격, 보유 여부) |
| `/api/marketplace/purchase` | POST | `requireAuth` | 프리셋 구매 (바나나 차감) |
| `/api/admin/users` | GET | `requireAdmin` | 유저 목록 |
| `/api/admin/users/[id]` | PATCH | `requireAdmin` | 유저 티어/크레딧 수정 |

---

## 9. 이미지 생성 파이프라인

### 9.1 캐릭터 생성

```
[캐릭터 참조 이미지 1~5장] (정적 파일 → fs.readFile)
  + [배경 이미지 (선택)] (Vercel Blob → HTTP fetch)
  + [스케치/편집 이미지 (선택)]
  + [텍스트 프롬프트]
        ↓
   Gemini API (gemini-3.1-flash-image-preview)
   - streaming 응답
   - thinkingLevel: MINIMAL
   - aspectRatio: 1:1, imageSize: 1K
   - primary key → fallback key 자동 전환
        ↓
   생성된 이미지 (base64) → Vercel Blob 업로드 → DB에 URL 저장
```

### 9.2 배경 생성 (3단계 워크플로우)

```
1단계: 배경 정리 (cleanup)   — 사진에서 사람/물체 제거
2단계: 스타일 변환 (stylize) — 아동용 일러스트 스타일로 변환
3단계: 앵글 생성 (angles)    — 다양한 카메라 앵글로 변형
```

### 9.3 이미지 저장 경로

| 유형 | 저장 위치 | 접근 방식 |
|------|-----------|-----------|
| 시스템 프리셋 이미지 | `public/presets/{alias}/` | `fs.readFile` (서버사이드) |
| 생성된 이미지 | Vercel Blob (public) | HTTPS URL 직접 접근 |
| 저장된 배경 | Vercel Blob (public) | HTTPS URL 직접 접근 |

---

## 10. 시스템 프리셋 (캐릭터)

| alias | 이름 | 가격 | 이미지 수 | 비고 |
|-------|------|------|-----------|------|
| `wony` | Wony | 무료 (0) | 4장 | 시드 시 전 유저 자동 지급 |
| `anian` | Anian | 1 바나나 | 5장 | 마켓에서 구매 필요 |

프리셋 추가 방법:
1. `public/presets/{alias}/`에 이미지 배치
2. `prisma/seed.ts`에 프리셋 등록 코드 추가
3. `npx prisma db seed` 실행

---

## 11. 환경변수

| 변수 | 용도 | 노출 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL (Neon) 연결 문자열 | 서버만 |
| `GEMINI_API_KEY` | Gemini API 기본 키 | 서버만 |
| `GEMINI_API_KEY_FALLBACK` | Gemini API 대체 키 | 서버만 |
| `SESSION_SECRET` | iron-session 암호화 키 | 서버만 |
| `RESEND_API_KEY` | 이메일 발송 API 키 | 서버만 |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 읽기/쓰기 토큰 | 서버만 |
| `NEXT_PUBLIC_APP_URL` | 인증 메일 리다이렉트 URL | 클라이언트 |

---

## 12. 보안 현황

| 항목 | 상태 | 비고 |
|------|------|------|
| 비밀번호 해싱 | ✅ bcrypt 10 rounds | DB에 평문 없음 |
| 세션 암호화 | ✅ iron-session | HTTP-Only 쿠키 |
| API 키 보호 | ✅ 서버 사이드만 | `.env` + `.gitignore` |
| 이미지 저장 | ✅ Vercel Blob (public) | URL 기반 접근 |
| 라우트 보호 | ✅ middleware + requireAuth | 미인증 시 리다이렉트 |
| 관리자 권한 | ✅ requireAdmin() | role 체크 |

---

## 13. 초기 시드 계정

> `npx prisma db seed` 로 생성

| 이메일 | 역할 | 티어 | 크레딧 |
|--------|------|------|--------|
| `wony@wonyframe.com` | admin | enterprise | 999,999 |
| `admin@wonyframe.com` | admin | enterprise | 999,999 |
| `n4topbada@gmail.com` | admin | enterprise | 999,999 |

---

*마지막 업데이트: 2026-03-17*
*© 2026 wonyframe.inc*
