# 코드 감사 기록

기준일: 2026-07-18 KST  
기준 브랜치: `main`  
감사 시작 커밋: `01af234`

이 문서는 현재 저장소를 대상으로 수행한 정적·동적 감사를 기록한다. 외부 보안 인증이나 침투 테스트를 대신하지 않지만, 전체 TypeScript 소스·API 라우트·의존성·환경 변수·문서와 운영 Cloud Run 설정을 같은 기준에서 확인했다.

## 확인 범위

- 214개 추적 대상 `src` 파일, 99개 API Route Handler, Prisma 모델 34개
- 인증·OAuth·세션·비밀번호 복구·계정 삭제
- GCS 및 로컬 저장 폴백, 직접 업로드, 미디어 게이트웨이
- 생성 작업·크레딧·Cloud Tasks·게시판·관리자 경계
- 사용하지 않는 파일·내보내기·의존성
- Git 추적 비밀 패턴, 환경 변수 예시 누락, Markdown 상대 링크
- 테스트, ESLint, TypeScript, Prisma, 프로덕션 빌드, npm 취약점
- Cloud Run의 실제 리비전·환경 변수 이름과 Cloud SQL 안전 설정

## 수정한 결함

| 중요도 | 결함 | 조치 |
| --- | --- | --- |
| 높음 | Cloud Run `APP_ORIGIN` 값에 Prisma 변수 문자열이 붙어 OAuth·메일 링크 URL 파싱이 실패할 수 있었음 | 운영 값을 즉시 정정하고 PowerShell 배포 예시를 단일 문자열 변수 방식으로 변경 |
| 높음 | 로컬 저장 참조의 `..`가 `public` 루트 밖 파일 읽기·삭제로 이어질 수 있었음 | 모든 로컬 읽기·쓰기·삭제·상태조회에 경로 세그먼트 및 루트 containment 검사 적용 |
| 높음 | 로컬 직접 업로드가 일반 사용자에게 `public/`과 임의 확장자·MIME를 허용했음 | 사용자 소유 경로, 3개 허용 폴더, 생성 파일명, MIME-확장자, 폴더별 용량 정책 강제 |
| 중간 | `/terms`, `/privacy`, `/refund`가 로그인 세션 없이는 `/login`으로 이동했음 | 공개 경로 목록에 포함하고 경로 경계 회귀 테스트 추가 |
| 중간 | Google/Kakao 신규 계정은 아는 비밀번호가 없는데 설정·탈퇴가 현재 비밀번호를 요구했음 | 세션 로그인 방식을 기록해 OAuth 본인 확인 세션에서 초기 비밀번호 설정·계정 관리 허용 |
| 중간 | 만료·잘못된 이메일 인증 토큰이 메시지를 표시하지 않는 로그인 화면으로 이동했음 | 오류 표시 전용 `/verify` 화면으로 연결 |
| 낮음 | `/api/auth*` 같은 문자열도 공개 API로 오인할 수 있는 느슨한 접두사 검사 | 정확한 경로 또는 `/` 경계에서만 공개 판정 |
| 낮음 | 확장자만 이미지·JS인 모든 URL을 정적 자산으로 간주해 미래 API가 인증을 우회할 수 있었음 | 현재 공개 자산 루트만 명시적으로 허용 |
| 낮음 | 전역 기본 브라우저 보안 헤더가 없었음 | `nosniff`, frame deny, referrer policy, camera/microphone/geolocation 제한 추가 |

## 제거·정리

- 호출되지 않던 `scripts/seed-sanrio.ts`, `src/lib/email-verification.ts` 제거
- 연결되지 않던 Instagram 토큰 갱신·개별 미디어 인사이트 함수 제거
- 내부 전용 함수·타입의 불필요한 `export` 제거, Knip 경고 0건
- 자체 타입을 포함하는 `bcryptjs`의 중복 `@types/bcryptjs` 제거
- 직접 import하는 `server-only`, `@eslint/eslintrc`를 명시 의존성으로 등록
- 앱과 연결되지 않고 현재 정책을 잘못 안내하던 `public/guide.html` 제거
- 중복 포인터 문서 `autocartoon.md` 제거
- 오래된 `NEXT_PUBLIC_SITE_URL`, `WONY_PHONE` 환경 변수 별칭 제거
- `.env.example`을 실제 코드 환경 변수와 대조해 Instagram 보류 설정까지 보완
- 사용되지 않게 된 캐릭터 디렉터 이메일 허용 목록과 별도 권한 함수를 제거하고 일반 로그인·크레딧 경계로 통일
- 홈·더보기·설정·캐릭터 관련 중복 동선을 로고, 1단 메뉴, 계정 아이콘과 두 내부 작업공간으로 정리
- 제작 동선을 5개 핵심 메뉴와 게시판·WonyBot·계정 보조 동선으로 재구성하고 대시보드 중복 바로가기를 제거
- 제스처와 배경 생성물을 공통 영속 작업·보관함·캔버스 자산으로 연결하고 비활성 패널 폴링을 중단
- 다크 테마 잔여값과 잘못 조합된 CSS 변수·카카오 노란 버튼 대비를 수정하고 밝은 공통 디자인 토큰으로 통일

## 의도적으로 유지한 항목

- `POST /api/background-generate`, `POST /api/credits/refund`의 410 응답은 구형 클라이언트가 잘못된 동작을 실행하지 않도록 하는 호환 경계다.
- Instagram UI·API·DB 모델은 비활성 상태지만 Meta 검수 뒤 재개할 제품 범위라 유지했다. 현재 공백은 [Instagram 설정 문서](./instagram-setup.md)에 명시한다.
- Next.js 15, Prisma 6, TypeScript 5, Node.js 24의 메이저 전환은 사용자 결정에 따라 수행하지 않았다.
- 결제 운영, Cloud Tasks OIDC worker 분리, Cloud SQL 복구·네트워크 변경은 코드 감사와 별도 운영 결정이다.

## 검증 결과

- `npm test`: 61/61 통과
- `npm run lint`: 통과
- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters --incremental false`: 통과
- `npx --yes knip --reporter compact`: 경고 0건
- `npx prisma validate`: 통과
- `npm audit --omit=dev`: 취약점 0건
- `$env:BUILD_TARGET='cloudrun'; npm run build`: 통과
- Git 추적 파일의 비밀 키·제공된 레퍼런스 비밀번호 패턴: 발견 0건
- Markdown 상대 링크: 끊어진 링크 0건
- Cloud Run `wonybananabot-00028-wrc`: 트래픽 100%, 컨테이너 정상 기동, 배포 후 오류 로그 0건
- 운영 `/terms`, `/privacy`, `/refund`: 비로그인 200; `/api/credits`: 비로그인 401
- 운영 카카오 OAuth callback, 로그인 홈, 계정 설정과 보안 헤더: 정상

## 남은 위험과 다음 조건

- 로그인 실패에 대한 분산 rate limit은 아직 없다. 사용자가 생기기 전 Cloud Armor 또는 DB/Redis 기반 제한을 선택한다.
- Content Security Policy는 이미지·Blob·WASM·외부 AI 미디어 사용처를 먼저 계측한 뒤 report-only로 도입한다.
- Cloud Tasks는 같은 공개 서비스와 고정 토큰을 사용한다. worker 분리 시 OIDC/IAM으로 교체한다.
- Cloud SQL 자동 백업, PITR, deletion protection은 아직 꺼져 있다. 적용 절차는 [Cloud SQL 확장·복구 런북](./cloud-sql-scaling-runbook.md)에 있다.
- Google OAuth 운영 키, SOLAPI 알림톡 승인, 카카오페이 운영 가맹점은 외부 설정이 완료돼야 활성화된다.
