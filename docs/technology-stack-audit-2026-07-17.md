# 기술 스택 및 종속성 감사 보고서

- 기준일: 2026-07-17 (KST)
- 대상: `autocartoon` / `wonybananabot`
- 범위: 애플리케이션 종속성, Node.js/Next.js/React, Prisma/PostgreSQL, GCP 런타임, Vertex AI, 외부 인증·결제·게시 API
- 조사 방식: 로컬 설치 상태, npm 레지스트리, 실제 GCP 리소스 설정, 각 공급자의 공식 문서 및 릴리스 노트 대조

## 1. 결론 요약

현재 설치 상태에서 알려진 npm 보안 취약점은 **0건**이며, `Next.js 15.5.20`도 보안 수정 버전보다 높고 Maintenance LTS 지원 범위에 있다. 따라서 지금 당장 서비스가 위험한 구버전 위에 있는 상태는 아니다.

다만 최신 메이저 버전으로 한 번에 올리는 것은 권장하지 않는다.

1. `Next.js 16 + eslint-config-next 16 + ESLint 10`은 하나의 독립 작업으로 진행한다.
2. `Prisma 7`은 ESM, 클라이언트 생성 위치, import와 Docker 산출물이 함께 바뀌므로 별도 작업으로 진행한다.
3. `TypeScript 7`은 현재 `typescript-eslint 8.64.0`의 지원 범위 밖이므로 보류한다.
4. `Node.js 24 LTS`와 `PostgreSQL 16`은 유지하되 패치 버전만 최신화한다.
5. 체감 속도와 안정성에는 프레임워크 버전보다 **Cloud SQL `db-f1-micro`와 Cloud Run 동시성 80**이 더 큰 위험 요인이다.
6. Vertex AI 모델 선택은 대체로 최신이지만 Gemini 3.1 텍스트·이미지 모델이 Preview이므로 모델 장애 시 대체 경로와 자동 점검이 필요하다.
7. Meta Graph API는 코드에 `v21.0`이 고정되어 있어 현재 지원되는 `v25.0`으로의 검증·이전이 필요하다.

## 2. 현재 실행 환경

| 영역 | 현재 상태 | 판단 |
| --- | --- | --- |
| 로컬 Node.js | `24.14.0` | LTS 계열로 적절함. 최신 Node 24 패치로 갱신 권장 |
| 로컬 npm | `11.9.0` | 정상. Node 24 패치 갱신 시 함께 정리 가능 |
| Docker 런타임 | `node:24-slim` | 계열은 적절하나 floating tag라 재빌드 재현성이 낮음 |
| Next.js | `15.5.20` | Maintenance LTS, 보안상 즉시 교체 필요 없음 |
| React | `19.2.4` | 같은 19.2 계열 패치 갱신 가능 |
| TypeScript | `5.9.3` | 현 도구 체인과 호환되는 안전한 선택 |
| Prisma | `6.19.3` | 정상. 7.x는 별도 마이그레이션 필요 |
| PostgreSQL | Cloud SQL `POSTGRES_16` | 지원 중. 메이저 업그레이드 급하지 않음 |
| Cloud Run | 1 CPU, 1 GiB, concurrency 80, timeout 600초 | 이미지·문서 처리와 웹 요청이 함께 경쟁할 위험 |
| Cloud Tasks | 초당 5 dispatch, 동시 10, 최대 5회 재시도 | 현재 Cloud Run 자원보다 공격적인 동시 처리 가능성 |
| Cloud SQL 머신 | `db-f1-micro` | 개발·테스트용 shared core, SLA 미적용. 운영 병목 우선 후보 |

## 3. npm 종속성 현황

### 3.1 핵심 패키지

| 패키지 | 설치 | 최신 | 권장 판단 |
| --- | ---: | ---: | --- |
| `next` | 15.5.20 | 16.2.10 | 별도 마이그레이션으로 갱신 |
| `react`, `react-dom` | 19.2.4 | 19.2.7 | 낮은 위험의 패치 갱신 |
| `typescript` | 5.9.3 | 7.0.2 | 보류. 현재 lint 생태계와 비호환 |
| `eslint` | 9.39.5 | 10.7.0 | Next 16과 함께 갱신 |
| `eslint-config-next` | 15.5.20 | 16.2.10 | Next 16과 같은 버전으로 갱신 |
| `prisma`, `@prisma/client` | 6.19.3 | 7.8.0 | 별도 마이그레이션으로 갱신 |
| `@types/node` | 22.19.15 | 26.1.1 | 무조건 최신이 아닌 런타임과 같은 24.x로 정렬 |
| `@types/react` | 19.2.14 | 19.2.17 | 패치 갱신 가능 |
| `dotenv` | 16.6.1 | 17.4.2 | 변경점 확인 후 소규모 갱신 |
| `react-icons` | 5.6.0 | 5.7.0 | 패치/마이너 갱신 가능 |
| `sharp` | 0.34.5 | 0.35.3 | 네이티브 바이너리·Docker 이미지 생성 테스트 후 갱신 |
| `tsx` | 4.21.0 | 4.23.1 | 마이너 갱신 가능 |

### 3.2 이미 최신인 주요 패키지

| 패키지 | 버전 |
| --- | ---: |
| `@google/genai` | 2.12.0 |
| `@google-cloud/storage` | 7.21.0 |
| `@google-cloud/tasks` | 6.2.3 |
| `google-auth-library` | 10.9.0 |
| `@ffmpeg/ffmpeg` | 0.12.15 |
| `@ffmpeg/util` | 0.12.2 |
| `bcryptjs` | 3.0.3 |
| `iron-session` | 8.0.4 |
| `jszip` | 3.10.1 |
| `mammoth` | 1.12.0 |
| `pdf-parse` | 2.4.5 |
| `resend` | 6.17.2 |
| `undici` | 8.7.0 |

### 3.3 보안과 설치 무결성

- `npm audit --json`: 총 645개 패키지, `info/low/moderate/high/critical` 모두 0건.
- 직접 종속성 누락 또는 중복으로 인한 즉시 장애 징후 없음.
- `@emnapi/runtime@1.10.0`이 로컬 `npm ls`에서 extraneous로 표시되지만 `npm prune --dry-run`은 변경 없음으로 판정했다. 선택적 네이티브 종속성 또는 로컬 설치 산출물로 보이며, 배포는 항상 `npm ci`로 재현하는 것이 기준이다.
- `glob@10.5.0` deprecation 경고는 최신 `@google-cloud/tasks` 아래 `google-gax -> rimraf` 경로의 전이 종속성이다. 애플리케이션이 직접 교체할 항목은 아니다.

## 4. Next.js, React, TypeScript, ESLint

### 4.1 Next.js 15를 사용한 이유와 현재 판단

`Next.js 15.5.20`은 2026-07-17 기준 Maintenance LTS이다. `Next.js 16`이 Active LTS이므로 신규 개발 기준선은 16이 맞지만, 현재 15가 곧바로 취약하거나 지원 종료된 버전은 아니다. 2025년 12월 보안 공지의 15.5 계열 수정 버전은 15.5.9이며 현재 버전은 이를 충족한다.

공식 자료:

- [Next.js 지원 정책](https://nextjs.org/support-policy)
- [Next.js 16 업그레이드 가이드](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js 16.2 릴리스](https://nextjs.org/blog/next-16-2)
- [Next.js 보안 업데이트](https://nextjs.org/blog/security-update-2025-12-11)

### 4.2 Next.js 16 전환 시 이 저장소에서 필요한 작업

확인 결과 App Router의 비동기 Request API 전환은 대부분 이미 완료되어 있다.

- Route Handler의 `params`가 `Promise<...>` 형태이며 await 처리됨.
- `cookies()`를 await 처리함.
- 페이지 `searchParams`도 비동기 형태를 사용함.

남은 핵심 변경과 검증은 다음과 같다.

1. `src/middleware.ts`를 `src/proxy.ts`로 바꾸고 `middleware` export를 `proxy`로 변경한다.
2. `next`, `eslint-config-next`, `eslint`을 함께 올리고 flat config 호환성을 검증한다.
3. Next 16의 기본 번들러인 Turbopack으로 production build를 수행한다.
4. `output: "standalone"` 산출물에서 Google Cloud Tasks의 GAPIC JSON, `mammoth`, `pdf-parse`, `sharp`가 추적·포함되는지 확인한다.
5. 현재 Dockerfile이 `@google-cloud/tasks` 런타임 파일을 별도 복사하는 이유를 Next 16 산출물에서도 재검증한다.
6. 로그인, 카카오 OAuth callback, 이미지 생성, 문서 분석, Cloud Tasks worker를 Cloud Run 후보 revision에서 smoke test한다.

Next 16은 Node `>=20.9`와 TypeScript `>=5.1`을 요구하므로 현재 Node 24/TypeScript 5.9는 이 조건을 충족한다.

### 4.3 React

현재 `19.2.4`에서 최신 `19.2.7`로의 변경은 같은 기능 계열의 패치 갱신이다. Next 15.5와 Next 16 모두 React 19를 지원하므로 독립적으로 반영할 수 있는 낮은 위험 항목이다.

- [React 19.2 공식 릴리스](https://react.dev/blog/2025/10/01/react-19-2)

### 4.4 TypeScript 7을 지금 올리면 안 되는 이유

TypeScript 7은 컴파일러가 네이티브 Go 구현으로 전환된 큰 메이저 릴리스다. 현재 `eslint-config-next`가 사용하는 `@typescript-eslint/parser` 및 plugin `8.64.0`의 지원 범위는 TypeScript `<6.1.0`이다. 따라서 npm의 최신 숫자만 따라 `7.0.2`로 올리면 lint와 IDE 도구가 공식 지원 범위를 벗어난다.

권장:

- 당장은 `5.9.3` 유지.
- Next 16/ESLint 10 전환 후 TypeScript 6 호환성을 별도로 확인.
- `typescript-eslint`이 TypeScript 7을 공식 지원한 뒤 TypeScript 7 마이그레이션 수행.

- [TypeScript 7.0 공식 발표](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)

### 4.5 ESLint 10

이 저장소는 이미 `eslint.config.mjs`를 사용하지만 `FlatCompat`으로 Next preset을 불러온다. ESLint 10은 flat config만 지원하고 설정 탐색 및 일부 규칙 동작도 바뀌므로 `eslint`만 단독으로 올리지 말고 `eslint-config-next 16`과 함께 테스트해야 한다.

- [ESLint 10 마이그레이션 가이드](https://eslint.org/docs/latest/use/migrate-to-10.0.0)

## 5. Node.js와 Docker

Node.js 24는 LTS이고 Node.js 26은 Current이다. 운영 애플리케이션은 LTS 사용이 권장되므로 26으로 옮길 이유가 아직 없다.

권장 상태:

- 개발·CI·Docker를 Node 24 최신 패치로 통일한다.
- 현재 로컬 `24.14.0`은 공식 최신 Node 24 패치 `24.18.0`으로 갱신한다.
- `@types/node`는 npm 전체 최신인 26.x가 아니라 런타임과 같은 24.x 최신으로 변경한다.
- `node:24-slim`은 빌드 시점마다 내용이 변한다. 재현 가능한 배포를 원하면 테스트를 거친 정확한 패치 태그 또는 digest로 고정하고 Renovate/Dependabot으로 갱신한다.
- `package.json`에 `engines.node`와 `packageManager`를 선언해 개발 환경 차이를 줄인다.

공식 자료:

- [Node.js 릴리스 지원 현황](https://nodejs.org/en/about/previous-releases)
- [Node.js 24.18.0 릴리스](https://nodejs.org/en/blog/release/v24.18.0)

## 6. Prisma와 PostgreSQL

### 6.1 Prisma 7

Prisma 7은 단순 패키지 업데이트가 아니다. 이 저장소에는 다음 영향이 있다.

- 현재 `provider = "prisma-client-js"` 사용.
- 애플리케이션과 seed에서 `@prisma/client`를 직접 import하는 파일이 다수 존재.
- Docker가 `node_modules/.prisma`를 복사함.
- Prisma 7은 ESM 전환, 새 `prisma-client` generator와 명시적 output 경로, 설정 이동, 생성 클라이언트 import 경로 변경이 핵심이다.

따라서 Next 16과 동시에 바꾸지 않는다. 별도 브랜치에서 아래 순서로 진행한다.

1. ESM 및 실행 스크립트 호환성 정리.
2. `prisma.config.ts`에 datasource 설정 통합.
3. 새 client generator/output 설정.
4. 전체 import 및 seed 갱신.
5. migration, transaction, credit ledger 동시성 테스트.
6. standalone Docker에 generated client와 엔진/adapter가 정확히 포함되는지 검증.

- [Prisma ORM 7 업그레이드 가이드](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)

### 6.2 PostgreSQL 16

PostgreSQL 16은 커뮤니티 지원이 2028-11-09까지 이어지고, Cloud SQL에서도 지원되는 버전이다. 최신 Cloud SQL 기본 메이저가 PostgreSQL 18이라고 해서 지금 데이터베이스 메이저를 먼저 올릴 필요는 없다.

현재 우선순위는 버전보다 머신 등급이다.

- 실제 인스턴스: `db-f1-micro`, `POSTGRES_16`, `asia-northeast3`.
- Google은 shared-core 머신을 개발·테스트 용도로 설명하며 SLA 대상에서 제외한다.
- 운영 전 dedicated core 머신으로 상향하고 CPU, 메모리, connection, disk latency를 관찰해야 한다.
- 애플리케이션의 Prisma `connection_limit=5`, `pool_timeout=30`은 작은 인스턴스에서 무제한 연결을 만드는 구성은 아니다.
- 머신 상향 후에만 pool 크기를 부하 테스트로 조절한다.

공식 자료:

- [Cloud SQL 지원 PostgreSQL 버전](https://docs.cloud.google.com/sql/docs/postgres/db-versions)
- [PostgreSQL 버전 지원 정책](https://www.postgresql.org/support/versioning/)
- [Cloud SQL 인스턴스 설정과 머신 유형](https://docs.cloud.google.com/sql/docs/postgres/instance-settings)
- [Cloud SQL 연결 관리](https://docs.cloud.google.com/sql/docs/postgres/manage-connections)

## 7. Cloud Run과 Cloud Tasks

현재 Cloud Run 한 서비스가 웹 요청과 Sharp/문서/AI 작업을 함께 처리하면서 다음 자원 설정을 사용한다.

- 1 CPU
- 1 GiB memory
- request concurrency 80
- request timeout 600초
- Cloud Tasks 최대 동시 dispatch 10, 초당 5

이 구성에서는 최대 80개의 웹 요청과 최대 10개의 무거운 task가 같은 인스턴스 자원을 경쟁할 수 있다. 특히 이미지 처리와 PDF 파싱은 메모리 순간 사용량이 커서 프레임워크 패치보다 사용자 체감 지연과 생성 실패에 더 직접적인 영향을 줄 수 있다.

권장 구조:

1. 웹 서비스와 생성 worker 서비스를 Cloud Run 서비스 단위로 분리한다.
2. worker는 낮은 concurrency부터 시작해 작업별 메모리 사용량을 측정한다.
3. 웹 서비스도 현재 80을 그대로 가정하지 말고 8~20 부근의 후보값을 부하 테스트한다.
4. Cloud Tasks의 `maxConcurrentDispatches`를 worker 인스턴스 수·concurrency와 함께 맞춘다.
5. 생성별 latency, 실패율, 메모리, credit 환불/재처리를 Cloud Logging 기반 지표로 만든다.

정확한 최종 concurrency 값은 실제 이미지 크기와 동시 사용자 수에 따라 결정해야 하며, 문서의 숫자는 부하 테스트 시작점이다.

공식 자료:

- [Cloud Run 최대 동시 요청 설정](https://docs.cloud.google.com/run/docs/about-concurrency)
- [Cloud Tasks queue 설정](https://docs.cloud.google.com/tasks/docs/configuring-queues)

## 8. Vertex AI와 생성 모델

### 8.1 현재 기본 모델

| 기능 | 기본 모델 | 상태 판단 |
| --- | --- | --- |
| 텍스트 | `gemini-3.1-flash-lite` | 최신 저비용 계열, Preview |
| 이미지 | `gemini-3.1-flash-image` | 최신 이미지 계열, Preview |
| 동영상 | `veo-3.1-fast-generate-001` | stable ID 사용 중 |
| SDK | `@google/genai 2.12.0` | npm 최신 |

Vertex AI 릴리스 노트 기준 Gemini 3.1 Flash-Lite와 Flash Image는 2026년에 공개된 Preview 모델이다. 반면 코드의 Veo 3.1 fast 모델 ID는 preview endpoint가 아닌 stable ID여서 올바른 방향이다.

필요한 보강:

- 모델 ID를 환경 변수로 교체할 수 있는 현재 구조를 유지한다.
- 텍스트는 fallback 후보가 있으므로 각 모델의 입력·출력 호환성을 smoke test한다.
- 이미지 생성은 Preview 모델 장애나 지역 제한에 대비한 대체 모델/재시도 정책을 명시한다.
- 배포 후 작은 텍스트·이미지·비디오 요청을 정기 실행해 모델 폐기, 권한, quota 이상을 조기에 발견한다.
- SDK 다음 메이저에서 automatic function calling의 기본 동작이 바뀔 수 있으나, 현재 저장소는 function calling을 사용하지 않아 즉시 영향은 없다.

공식 자료:

- [Vertex AI Generative AI 릴리스 노트](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes)
- [Google Gen AI JavaScript SDK 문서](https://googleapis.github.io/js-genai/release_docs/)

## 9. 외부 인증·결제·게시 API

### 9.1 카카오 로그인

현재 구현은 카카오의 REST authorization code flow를 사용하며, 인가 코드 교환, client secret, `state` 검증 구조는 공식 흐름과 일치한다. 자체 도메인 전환 시에는 코드보다 콘솔 설정이 중요하다.

- 카카오 개발자 콘솔의 Redirect URI에 최종 자체 도메인 callback 추가.
- JavaScript SDK를 쓰는 화면이 생기면 Web platform domain도 추가.
- Cloud Run 임시 도메인은 전환 기간 동안만 병행 등록.
- 환경 변수의 서비스 기준 URL과 callback URL 일치 확인.

- [카카오 로그인 REST API](https://developers.kakao.com/docs/ko/kakaologin/rest-api)

### 9.2 카카오페이

코드는 카카오페이 온라인 결제 v1의 ready/approve 흐름을 기준으로 준비되어 있다. 실제 결제가 비활성인 것은 현재 요구와 일치하며, 운영 사용에는 사업자 심사·제휴 및 운영 CID/secret 설정이 필요하다. 카카오 로그인 계정과 카카오페이 결제 승인 주체는 연결된 사용자 경험을 제공할 수 있지만, 로그인만 했다고 별도 결제 계약 없이 자동 과금되는 구조는 아니다.

- [카카오페이 온라인 결제 공식 문서](https://developers.kakaopay.com/docs/payment/online)

### 9.3 Meta Graph API

코드에 `v21.0` endpoint가 고정되어 있다. 공식 endpoint 확인 기준 현재 `v25.0`이 사용 가능하고 `v21.0`도 아직 응답하지만, 새 개발 기준으로는 오래된 버전이다.

권장:

1. 버전을 단일 환경 변수/상수로 통합한다.
2. `v25.0` 후보 환경에서 OAuth, Page/Instagram account discovery, publish, insight 필드를 회귀 테스트한다.
3. v22 이후 Instagram insight와 destination 관련 변경점을 반영한다.
4. 테스트를 통과한 뒤 v25로 전환한다.

공식 자료:

- [Meta Graph API v21.0 변경 기록](https://developers.facebook.com/docs/graph-api/changelog/version21.0)
- [Meta Graph API v25.0 변경 기록](https://developers.facebook.com/docs/graph-api/changelog/version25.0)

## 10. 권장 목표 스택

### 단기 목표

| 영역 | 권장 버전/상태 |
| --- | --- |
| Node.js | 24 LTS 최신 패치 |
| npm | Node 24와 함께 제공되는 최신 호환 11.x |
| Next.js | 우선 15.5.20 유지, 검증 브랜치에서 16.2.10 전환 |
| React | 19.2.7 |
| TypeScript | 5.9.3 유지 |
| ESLint | 현재 9.39.5, Next 16 전환 시 10.7.0 |
| Prisma | 6.19.3 유지, 별도 작업으로 7.8.0 전환 |
| PostgreSQL | 16 유지, 최신 minor와 Cloud SQL maintenance 적용 |
| Cloud SQL | shared core에서 SLA 지원 dedicated core로 상향 |
| Cloud Run | 웹/worker 분리 및 동시성 재조정 |
| Vertex AI | 현재 모델 유지 + Preview fallback/monitor 추가 |
| Meta Graph API | v25 회귀 테스트 후 전환 |

### 보류 대상

- Node.js 26: Current이므로 운영 기준선으로 사용하지 않음.
- TypeScript 7: 현재 lint 도구의 공식 지원 범위 밖.
- PostgreSQL 18: 지원 수명만을 이유로 즉시 올릴 필요 없음.
- Next.js 16과 Prisma 7 동시 전환: 장애 원인 분리가 어려워지므로 금지.

## 11. 실행 우선순위

### P0: 운영 안정성

1. Cloud SQL `db-f1-micro` 상향 계획 수립 및 모니터링 지표 확보.
2. Cloud Run 웹/worker 분리 또는 최소한 concurrency와 queue 동시성 축소 부하 테스트.
3. 이미지·텍스트·비디오 생성 smoke test와 모델별 오류율 대시보드 구성.
4. Meta Graph API v25 회귀 테스트.

### P1: 낮은 위험의 유지보수

1. React 19.2.7, React types, `tsx`, `react-icons` 패치/마이너 갱신.
2. `@types/node`를 24.x 최신으로 런타임과 정렬.
3. Node 24 최신 패치로 로컬·CI·Docker 기준 통일.
4. Docker base image와 package manager 버전의 재현성 강화.

### P2: Next.js 16 전환

1. middleware-to-proxy codemod/수동 변경.
2. Next 16.2.10, eslint-config-next 16.2.10, ESLint 10.7.0 동시 적용.
3. lint, typecheck, unit/integration test, production build.
4. standalone Docker와 Cloud Run 후보 revision 검증.
5. 로그인·설정·캐릭터 디렉터·캔버스·AI 생성 전체 브라우저 회귀 테스트.

### P3: Prisma 7 전환

Next.js 16이 안정화된 뒤 별도 브랜치와 후보 배포에서 수행한다. 특히 credit ledger와 결제 관련 transaction은 동시성 테스트를 포함해야 한다.

## 12. 조사에 사용한 명령과 판정 기준

주요 로컬·클라우드 확인 항목:

```text
node --version
npm --version
npm ls --depth=0
npm outdated --long
npm audit --json
npm dedupe --dry-run
npm prune --dry-run
gcloud run services describe ...
gcloud sql instances describe ...
gcloud tasks queues describe ...
```

`latest`는 2026-07-17 npm registry의 dist-tag와 공급자 공식 문서를 기준으로 한다. 최신 숫자가 현재 애플리케이션의 최적 버전이라는 뜻은 아니며, 런타임·peer dependency·LTS·배포 산출물 호환성까지 확인한 권장 판단을 우선한다.
