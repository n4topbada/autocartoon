# AutoCartoon — 기술 문서

## 1. 개요

웹툰/카툰 스타일 캐릭터 이미지를 AI(Google Gemini)로 생성하는 웹 서비스.
캐릭터 참조 이미지 + 텍스트 프롬프트로 일관된 스타일의 장면 이미지를 생성한다.

---

## 2. 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 프레임워크 | Next.js 15 (App Router) | TypeScript, React 19 |
| DB | SQLite + Prisma 6.4 | 파일 기반 (`prisma/dev.db`) |
| 인증 | iron-session 8.0 | HTTP-Only 암호화 쿠키 |
| 비밀번호 | bcryptjs | 10 rounds salt hash |
| AI | Google Gemini (`@google/genai`) | `gemini-3.1-flash-image-preview` |
| 이메일 | Resend | 회원가입 인증 메일 발송 |
| 배포 | Vercel (standalone) | `output: "standalone"` |

---

## 3. 프로젝트 구조

```
autocartoon/
├── prisma/
│   ├── schema.prisma        # DB 스키마
│   └── seed.ts              # 초기 계정 시드 (개발용)
├── src/
│   ├── app/
│   │   ├── layout.tsx        # 루트 레이아웃 (AuthProvider 래핑)
│   │   ├── page.tsx          # 메인 페이지 (캐릭터/배경 탭)
│   │   ├── login/page.tsx    # 로그인 / 회원가입
│   │   ├── verify/page.tsx   # 이메일 인증 결과
│   │   ├── admin/page.tsx    # 관리자 페이지
│   │   └── api/
│   │       ├── auth/         # 로그인, 회원가입, 로그아웃, 인증
│   │       ├── generate/     # 캐릭터 이미지 생성
│   │       ├── background-generate/  # 배경 이미지 생성
│   │       ├── backgrounds/  # 저장된 배경 CRUD
│   │       ├── presets/      # 캐릭터 프리셋 CRUD
│   │       ├── history/      # 생성 히스토리
│   │       └── admin/users/  # 관리자 유저 관리
│   ├── components/
│   │   ├── AuthProvider.tsx   # 인증 Context
│   │   ├── UserAvatar.tsx     # 우상단 사용자 메뉴
│   │   ├── BackgroundGenerator.tsx
│   │   ├── WorkflowCard.tsx
│   │   ├── ImageDropZone.tsx
│   │   └── ImageModal.tsx
│   ├── lib/
│   │   ├── auth.ts            # requireAuth, requireAdmin
│   │   ├── session.ts         # iron-session 설정
│   │   ├── credit-service.ts  # 크레딧/티어 차감 로직
│   │   ├── tier-config.ts     # 티어별 월 한도
│   │   ├── generation-service.ts  # Gemini 호출 + DB 저장
│   │   ├── gemini.ts          # Gemini API 클라이언트
│   │   ├── prompts.ts         # 캐릭터 생성 프롬프트
│   │   ├── background-prompts.ts  # 배경 생성 프롬프트
│   │   └── prisma.ts          # Prisma 싱글턴
│   └── middleware.ts          # 라우트 보호 (인증/관리자)
├── .env                       # 환경변수 (git 제외)
├── .gitignore
└── next.config.ts
```

---

## 4. 인증 시스템

### 4.1 세션 방식

- **iron-session**: 서버 사이드 암호화 쿠키 (`autocartoon_session`)
- 쿠키 속성: `httpOnly`, `secure (prod)`, `sameSite: lax`
- 세션 데이터: `{ userId, email, role }`
- 암호화 키: `SESSION_SECRET` 환경변수

### 4.2 비밀번호 저장

```
저장: bcrypt.hash(password, 10)  → passwordHash 컬럼
검증: bcrypt.compare(입력, passwordHash)
```

- **평문 비밀번호는 DB에 저장되지 않음**
- **프론트엔드 코드에 계정 정보 노출 없음**
- 시드 파일(`prisma/seed.ts`)은 개발용으로만 사용, `.env`는 `.gitignore`에 포함

### 4.3 회원가입 플로우

```
1. 이메일 + 비밀번호 입력
2. bcrypt 해시 → DB 저장 (emailVerified = false)
3. 32바이트 인증 토큰 생성 (24시간 유효)
4. Resend API로 인증 메일 발송
5. 메일 내 링크 클릭 → /api/auth/verify?token=xxx
6. emailVerified = true → 로그인 가능
```

> RESEND_API_KEY가 없으면 자동 인증 (개발 환경용)

### 4.4 로그인 플로우

```
1. POST /api/auth/login { email, password }
2. DB에서 유저 조회
3. bcrypt.compare()로 비밀번호 검증
4. emailVerified 확인
5. iron-session 세션 생성
6. 유저 정보 반환 (비밀번호 제외)
```

### 4.5 라우트 보호 (middleware.ts)

| 라우트 | 보호 수준 |
|--------|-----------|
| `/login`, `/verify`, `/api/auth/*` | 공개 |
| `/api/generate`, `/api/background-generate` | `requireAuth()` |
| `/api/admin/*` | `requireAdmin()` |
| `/admin` | middleware에서 role 체크 |
| 그 외 모든 라우트 | 로그인 필요 (리다이렉트) |

---

## 5. 크레딧 & 티어 시스템

### 5.1 이중 체계

이미지 생성 시 **두 가지 "잔고"**를 순서대로 차감한다:

```
1차: 월간 티어 무료 사용량 (tierUsedThisMonth < 월 한도)
2차: 크레딧 (credits -= 1)
둘 다 소진 → 402 에러 (생성 불가)
```

### 5.2 티어별 월 한도

| 티어 | 월 무료 생성 | 비고 |
|------|-------------|------|
| free | 5회 | 기본 |
| basic | 30회 | |
| pro | 100회 | |
| enterprise | 무제한 | 관리자용 |

- 매월 1일 자동 리셋 (`tierResetAt` 기준)
- 크레딧은 별도 — 월 리셋 없이 누적/차감

### 5.3 차감 로직 (`credit-service.ts`)

```typescript
1. 월 리셋 체크 (현재 월 != tierResetAt 월)
   → tierUsedThisMonth = 0, tierResetAt = 현재 시각
2. 티어 무료 사용량 남음?
   → tierUsedThisMonth += 1 (크레딧 차감 없음)
3. 크레딧 남음?
   → credits -= 1
4. 둘 다 없음?
   → { ok: false, error: "크레딧 부족" }
```

---

## 6. 데이터베이스 스키마

### User

| 필드 | 타입 | 설명 |
|------|------|------|
| id | String (CUID) | PK |
| email | String (unique) | 로그인 이메일 |
| passwordHash | String | bcrypt 해시 |
| name | String | 표시 이름 |
| role | String | `user` / `admin` |
| tier | String | `free` / `basic` / `pro` / `enterprise` |
| credits | Int | 잔여 크레딧 |
| tierUsedThisMonth | Int | 이번 달 티어 사용량 |
| tierResetAt | DateTime | 티어 리셋 시점 |
| emailVerified | Boolean | 이메일 인증 여부 |
| verifyToken | String? | 인증 토큰 |
| verifyTokenExp | DateTime? | 토큰 만료 시각 |

### CharacterPreset

| 필드 | 타입 | 설명 |
|------|------|------|
| id | String (CUID) | PK |
| alias | String (unique) | 고유 별칭 |
| name | String | 캐릭터 이름 |

### PresetImage

| 필드 | 타입 | 설명 |
|------|------|------|
| id | String (CUID) | PK |
| presetId | String (FK) | 프리셋 참조 |
| filePath | String? | 파일 경로 (import용) |
| imageData | String? | base64 이미지 데이터 |
| mimeType | String | MIME 타입 |
| order | Int | 정렬 순서 |

### SavedBackground

| 필드 | 타입 | 설명 |
|------|------|------|
| id | String (CUID) | PK |
| name | String | 배경 이름 |
| imageData | String | base64 이미지 데이터 |
| mimeType | String | MIME 타입 |

### GenerationRequest

| 필드 | 타입 | 설명 |
|------|------|------|
| id | String (CUID) | PK |
| presetId | String (FK) | 프리셋 참조 |
| mode | String | `text` / `sketch` / `edit` |
| prompt | String | 사용자 프롬프트 |
| background | String? | 텍스트 배경 |
| backgroundImageId | String? (FK) | 이미지 배경 참조 |

### GeneratedImage

| 필드 | 타입 | 설명 |
|------|------|------|
| id | String (CUID) | PK |
| requestId | String (FK) | 요청 참조 |
| imageData | String | base64 결과 이미지 |
| mimeType | String | MIME 타입 |

---

## 7. API 라우트 목록

| 라우트 | 메서드 | 인증 | 설명 |
|--------|--------|------|------|
| `/api/auth/login` | POST | - | 로그인 |
| `/api/auth/register` | POST | - | 회원가입 |
| `/api/auth/verify` | GET | - | 이메일 인증 |
| `/api/auth/me` | GET | - | 현재 유저 정보 |
| `/api/auth/logout` | POST | 세션 | 로그아웃 |
| `/api/generate` | POST | `requireAuth` | 캐릭터 이미지 생성 (크레딧 차감) |
| `/api/background-generate` | POST | `requireAuth` | 배경 이미지 생성 (크레딧 차감) |
| `/api/presets` | GET/POST | POST만 인증 | 프리셋 조회/생성 |
| `/api/presets/[id]/thumbnail` | GET | - | 프리셋 썸네일 |
| `/api/backgrounds` | GET/POST | POST만 인증 | 저장 배경 조회/저장 |
| `/api/backgrounds/[id]` | DELETE | `requireAuth` | 배경 삭제 |
| `/api/history` | GET | - | 생성 히스토리 |
| `/api/admin/users` | GET | `requireAdmin` | 유저 목록 |
| `/api/admin/users/[id]` | PATCH | `requireAdmin` | 유저 티어/크레딧 수정 |

---

## 8. 이미지 생성 파이프라인

### 8.1 캐릭터 생성

```
[캐릭터 참조 이미지 1~4장]
  + [배경 이미지 (선택)]
  + [스케치/편집 이미지 (선택)]
  + [텍스트 프롬프트]
        ↓
   Gemini API (gemini-3.1-flash-image-preview)
        ↓
   생성된 이미지 (base64) → DB 저장
```

- **텍스트 배경**: 드롭다운에서 선택 (카페, 공원 등) → 프롬프트에 텍스트로 포함
- **이미지 배경**: 배경 탭에서 생성/저장한 이미지 → 실제 이미지로 Gemini에 전달, 합성 프롬프트 사용
- 두 배경은 상호배타 (하나 선택 시 다른 쪽 해제)

### 8.2 배경 생성 (3단계 워크플로우)

```
1단계: 배경 정리 (cleanup)   — 사진에서 사람/차량 등 제거
2단계: 스타일 변환 (stylize) — 아동용 일러스트 스타일로 변환
3단계: 앵글 생성 (angles)    — 다양한 카메라 앵글로 변형
```

각 단계 독립 실행 가능, 이전 단계 결과를 다음 단계 입력으로 선택 가능.

---

## 9. 관리자 기능

### 접근 조건
- `user.role === "admin"` 인 계정만 접근 가능
- 헤더 우상단 아바타 메뉴에 "관리자 페이지" 버튼 노출

### 관리자 페이지 기능
- 전체 유저 목록 테이블 (이메일, 이름, 역할, 티어, 월 사용량, 크레딧, 인증 상태, 가입일)
- **티어 변경**: 드롭다운으로 즉시 변경
- **크레딧 지급**: 수량 입력 후 지급 버튼

---

## 10. 프론트엔드 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| `AuthProvider` | 인증 상태 Context (useAuth 훅) |
| `UserAvatar` | 우상단 원형 아바타 + 드롭다운 (이름, 티어, 크레딧, FAQ, 고객문의, 로그아웃) |
| `BackgroundGenerator` | 배경 생성 탭 전체 UI + 저장 모달 |
| `WorkflowCard` | 3단계 배경 워크플로우 카드 |
| `ImageDropZone` | 이미지 업로드 (클릭/드래그/붙여넣기) |
| `ImageModal` | 이미지 확대 미리보기 |

---

## 11. 환경변수

| 변수 | 용도 | 노출 |
|------|------|------|
| `DATABASE_URL` | SQLite 경로 | 서버만 |
| `GEMINI_API_KEY` | Gemini API 기본 키 | 서버만 |
| `GEMINI_API_KEY_FALLBACK` | Gemini API 대체 키 | 서버만 |
| `SESSION_SECRET` | iron-session 암호화 키 | 서버만 |
| `RESEND_API_KEY` | 이메일 발송 API 키 | 서버만 |
| `NEXT_PUBLIC_APP_URL` | 인증 메일 리다이렉트 URL | 클라이언트 |

- `.env`는 `.gitignore`에 포함되어 Git에 커밋되지 않음
- `NEXT_PUBLIC_` 접두사가 있는 변수만 클라이언트에 노출

---

## 12. 보안 현황

| 항목 | 상태 | 비고 |
|------|------|------|
| 비밀번호 해싱 | ✅ bcrypt 10 rounds | DB에 평문 없음 |
| 세션 암호화 | ✅ iron-session | HTTP-Only 쿠키 |
| API 키 보호 | ✅ 서버 사이드만 | `.env` + `.gitignore` |
| 라우트 보호 | ✅ middleware + requireAuth | 미인증 시 리다이렉트 |
| 관리자 권한 | ✅ requireAdmin() | role 체크 |
| 시드 평문 비밀번호 | ⚠️ 개발용 | `prisma/seed.ts`에 존재, 프로덕션 배포 시 주의 |
| 히스토리 API | ⚠️ 인증 없음 | `/api/history` 보호 필요 |

---

## 13. 초기 시드 계정

> `npx prisma db seed` 로 생성

| 이메일 | 역할 | 티어 | 크레딧 |
|--------|------|------|--------|
| `wony@wonyframe.com` | admin | enterprise | 999,999 |
| `admin@wonyframe.com` | admin | enterprise | 999,999 |
| `n4topbada@gmail.com` | admin | enterprise | 999,999 |

---

*마지막 업데이트: 2026-03-15*
