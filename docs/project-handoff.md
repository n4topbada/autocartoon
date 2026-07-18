# WONY AutoCartoon 프로젝트 인수인계

작성 기준: 2026-07-18 KST

브랜치: `main`

GitHub: `https://github.com/n4topbada/autocartoon`
운영: `https://wonybananabot-272254743773.asia-northeast3.run.app`

이 문서는 다음 개발자가 현재 운영 구조, 실제 구현, 레퍼런스 차이, 남은 외부 결정을 빠르게 파악하기 위한 기준 문서다. 기능별 조사 근거와 AS-IS -> TO-BE 매트릭스는 [toonagent-reverse-engineering.md](./toonagent-reverse-engineering.md), 저장소 품질 기준은 [code-audit-2026-07-18.md](./code-audit-2026-07-18.md)에 있다.

## 1. 비밀과 접근 정보

- 레퍼런스: `https://app.toonagent.co.kr`
- 레퍼런스 ID·비밀번호: Git에서 제외된 `docs/access-credentials.private.md`
- 운영 사용자 비밀번호, API 키, OAuth secret, DB URL은 문서나 Git에 기록하지 않는다.
- 비밀번호는 평문 복구하지 않으며 이메일 임시 비밀번호 흐름을 사용한다.
- 관리자 대상 계정은 DB 역할로 판별한다. 이메일 닉네임 추정으로 권한을 올리지 않는다.
- 제품은 국내 전용 한국어 서비스다. 레퍼런스의 다국어 기능은 의도적으로 범위에서 제외한다.

## 2. 운영 인프라

| 항목 | 현재 값 |
| --- | --- |
| GCP project | `wonybananabot` |
| Cloud Run | `wonybananabot`, `asia-northeast3`; 2026-07-18 검증 리비전 `wonybananabot-00027-scn` |
| Cloud SQL | `wony-postgres`, PostgreSQL 16 |
| Cloud Tasks | `wony-jobs`, `asia-northeast3`; 동시 10, 초당 5, 최대 5회 재시도 |
| GCS | `wonybananabot-media`, private. 브라우저 직접 업로드 CORS는 `scripts/gcs-cors.json` 기준 |
| Runtime service account | `wony-run@wonybananabot.iam.gserviceaccount.com` |
| DB secret | Secret Manager `database-url` 참조 |
| AI | Vertex Gemini, Veo, Google Cloud TTS |

Cloud Run 배포에는 항상 `--project=wonybananabot --region=asia-northeast3`를 명시한다. `APP_ORIGIN`과 카카오 Redirect URI는 현재 Cloud Run URL을 사용하고, 자체 도메인 연결 시 새 도메인을 추가한 뒤 기존 URI를 안정화 기간 동안 함께 유지한다.

## 3. 현재 제품 기능

### 인증·개인화

- 이메일 인증·복구, 로그인·로그아웃, 12자 영문/숫자 임시 비밀번호, 강제 변경
- 카카오·Google OAuth와 카카오의 명시적 기존 계정 연결
- OAuth로 본인 확인한 세션의 초기 이메일 로그인 비밀번호 설정
- HttpOnly 세션, DB 기기 세션 최대 2대, 목록·철회·계정 삭제
- 사용자별 캐릭터·생성물·배경·프로젝트·보관함·게시글·크레딧 소유권

### AI·제작

- 구조화 캐릭터 생성, 방향별 이미지, 대표·기본 캐릭터, 보이스 최대 3개
- 일반 장면 최대 4명, 1인·2인 제스처, 저밀도 배경 3단계
- Cloud Tasks 영속 작업, 진행률·재접속·재시도·작업/공지 통합 알림·실패 자동 환불
- 프로젝트·컷·표지·자산·대사·AI 기획·영상 플랜
- PDF/DOCX/ZIP/Markdown/TXT/CSV/HTML, 이미지 OCR, 공개 URL 기획 자료 가져오기
- 다중 페이지·레이어·그룹·클리핑·필터·정렬·직접 변환 고급 캔버스
- 33개 폰트, 부분 문자열 서식, 커스텀 말풍선·도형·5종 브러시·효과음
- OCR, AI 자동·사각형·자유 마스크 다시 그리기, 바깥 픽셀 강제 보존
- 변경 레이어 저장 최적화, 버전 비교·복원, PNG/ZIP
- Veo 영상과 ffmpeg.wasm 숏폼 MP4, 캐릭터별 Google TTS

### 커뮤니티·운영

- 공개 닉네임, 최신/인기 게시판, 이미지·링크, 댓글, 글/댓글 좋아요, 신고, 관리자 고정
- 통합 보관함, 썸네일, 타입 필터, 페이지 이동, 저장 용량, 삭제
- 홈 최신 공지와 사용자별 읽음 상태
- 관리자 공지 작성·수정·게시·고정·만료·삭제·열람 수, 사용자·크레딧·신고·챗봇 지식
- 모든 로그인 사용자가 쓰는 구조화 캐릭터 디렉터와 서버 크레딧 차감

### 크레딧·결제

- 신규 30크레딧, 1크레딧 12원 기준 상품, 서버 소유 요율
- 모든 유료 AI 버튼 비용 표시, idempotent 차감 원장, 실패 환불
- 카카오페이 ready/approve/cancel/fail 코드는 있으나 운영 결제는 의도적으로 비활성 상태
- 가맹점 심사·운영 CID·약관·환불·정산 정책 전에는 활성화하지 않는다.
- 비로그인도 접근하는 `/terms`, `/privacy`, `/refund` 운영 전 초안과 로그인·설정·크레딧 공통 링크

## 4. 이번 작업에서 닫은 공백

- GCP 운영 주소 기준 카카오 콜백과 정규 origin
- 제작 대시보드와 온보딩/최근 작업 복구
- PDF/DOCX/ZIP, 이미지 OCR, SSRF 방어 공개 URL 기획 자료 가져오기
- 이메일 미제공 카카오 내부 계정의 안전한 명시 연결
- 빈 DB 지식에서도 정확히 답하는 내장 서비스 지식
- 배경 과거 결과 이어서 작업
- 게시판 좋아요 실패 롤백
- Google Storage 의존성 보안 경고 제거
- 문서를 Cloud Run·Cloud SQL·GCS·Cloud Tasks 기준으로 전면 정정
- Cloud Tasks를 동시 10건·초당 5건·최대 5회 재시도로 제한해 장애 시 비용과 DB 부하 폭증 방지
- 레퍼런스 고급 캔버스 전 도구 재조사와 동등성 구현
- 레이어·텍스트·도형·말풍선 직접 크기/회전, 투명 픽셀 선택 관통과 꼬리 좌표 버그 수정
- 컷당 캔버스 버전 60개, 복원 전 자동 백업, 변경 픽셀 레이어만 업로드
- 컷 저장의 생성 아카이브 중복 제거와 Prisma 연결 풀 기본 5개 제한
- 레퍼런스 전체 제작 흐름 2026-07-18 재감사와 운영 공지·읽음·통합 알림 구현
- 국내 서비스용 약관·개인정보·환불 페이지와 로그인·설정·크레딧 공통 링크
- SOLAPI 알림톡 어댑터의 HMAC-SHA256 인증 수정과 사업자 도입 절차 문서화
- 공개 정책 페이지가 세션 때문에 로그인으로 이동하던 미들웨어 오류 수정
- OAuth 신규 계정에 알 수 없는 임의 비밀번호를 요구하던 설정·탈퇴 흐름 수정
- 로컬 파일 경로 탈출과 임의 `public/`·MIME 업로드 차단
- Cloud Run의 손상된 `APP_ORIGIN` 값을 운영 URL 하나로 교정
- 정적 데드코드·중복 의존성·오래된 HTML/Markdown 정리와 Knip 경고 0건
- 홈 버튼을 없애고 로고를 홈 동선으로 고정, `더보기`의 작업 메뉴를 1단 상단 메뉴로 전개
- 계정 설정을 사용자 아이콘 메뉴로, 캐릭터 설계를 `캐릭터 만들기`로, 내 캐릭터를 `My Contents`로 통합

운영 반영 상태: 기존 마이그레이션 실행 `wony-prisma-migrate-99klj`는 성공 상태다. 정보 구조 통합 변경을 담은 리비전 `wonybananabot-00027-scn`에 트래픽 100%를 연결했다. 운영 9개 1단 메뉴, 계정 아이콘 설정, 캐릭터 만들기와 My Contents 내부 탭, 390px 모바일 폭, 비로그인 정책 페이지 3종 `200`, 보호 API `401`, 전역 보안 헤더와 해당 리비전 오류 로그 0건을 확인했다. 이번 변경에는 DB 마이그레이션이 없다.

## 5. 레퍼런스 대비 기능상 남은 항목

| 항목 | 상태 | 이유/다음 단계 |
| --- | --- | --- |
| 휴대폰 본인확인 | 외부 결정 | 공급자·비용·개인정보 정책 필요 |
| 약관·개인정보·환불 페이지 | 초안 완료 | 사업자 정보·위탁/국외이전·환불 산식과 법률 검토 후 확정 |
| 카카오 알림톡 | 부분 | SOLAPI HMAC 어댑터 준비, 비즈채널·템플릿·사용자 번호 기능 필요 |
| Instagram/다채널 게시 | 보류 | Meta 앱 검수·토큰 갱신 운영 필요. [설정 문서](./instagram-setup.md) 참조 |
| 카카오페이 운영 | 보류 정상 | 상품·정책·가맹점 심사 뒤 활성화 |
| Plurank CRM/CX/마케팅 전체 | 범위 결정 | 개인 창작 기능과 별도 제품군 |

보관함 전체 메타 검색과 대형 영상의 서버 렌더링은 유용한 확장 후보지만, 레퍼런스에만 있는 필수 기능 공백으로 계산하지 않는다. 사용자 API 키와 공급자 선택 역시 플랫폼 Vertex AI·크레딧 방식으로 의도적으로 대체했다.

알림톡의 사업자 작업과 구현 경계는 [kakao-alimtalk-setup.md](./kakao-alimtalk-setup.md)를 따른다. 현재 지원 문의 운영자 알림 골격만 있으며 사용자 생성 완료 알림은 아직 켜지 않는다.

## 6. 카카오 계정 연결 주의

카카오가 이메일을 제공하지 않아 최초 로그인 시 `@oauth.wonyframe.local` 내부 계정이 생길 수 있다. 기존 이메일 계정으로 로그인한 뒤 설정의 **카카오 연결**을 사용한다.

- 연결 대상 카카오 ID가 비어 있으면 현재 계정에 바로 연결한다.
- 자동 생성 계정이 웰컴 크레딧과 검증용 AI 채팅 이력만 갖고 있으면 비활성화 후 연결한다.
- 캐릭터, 프로젝트, 생성물, 게시물, 결제 등 사용자 데이터가 있으면 자동 병합하지 않고 충돌로 중단한다.
- 데이터가 있는 두 계정의 병합은 별도 관리자 도구와 감사 원장을 설계해야 한다.

## 7. 검증과 배포 절차

```powershell
npm test
npm run lint
npx tsc --noEmit
npx tsc --noEmit --noUnusedLocals --noUnusedParameters --incremental false
npx --yes knip --reporter compact
npx prisma validate
$env:BUILD_TARGET='cloudrun'
$runtimeEnv='APP_ORIGIN=https://wonybananabot-272254743773.asia-northeast3.run.app,PRISMA_CONNECTION_LIMIT=5,PRISMA_POOL_TIMEOUT=30'
npm run build
gcloud run deploy wonybananabot --source . --project=wonybananabot --region=asia-northeast3 --update-env-vars $runtimeEnv --quiet
gcloud tasks queues update wony-jobs --project=wonybananabot --location=asia-northeast3 --max-concurrent-dispatches=10 --max-dispatches-per-second=5 --max-attempts=5 --min-backoff=10s --max-backoff=300s --max-doublings=5
```

배포 후 확인:

1. `/login`과 카카오 로그인 콜백
2. 로고 홈 이동, 사용자 아이콘 계정 설정, 1단 메뉴, 게시판·보관함·스튜디오·숏폼
3. 캐릭터 만들기의 이미지/설정 설계 탭과 My Contents의 내 캐릭터/콘텐츠 보드 탭
4. Vertex 텍스트와 이미지 실제 작업
5. Cloud Tasks 큐, GCS 산출물, DB job/artifact, 완료 알림
6. Cloud Run 최근 오류 로그

## 8. 개발 원칙

1. UI만 만들어 놓고 완료로 표시하지 않는다. API, DB, 권한, 실패·재시도, 모바일까지 확인한다.
2. 사용자 데이터가 있는 계정은 추정으로 병합하거나 역할을 변경하지 않는다.
3. AI·결제는 서버 소유 비용, idempotency, 원장, 실패 반대 분개를 유지한다.
4. 레퍼런스의 기능 흐름만 독자 구현하고 자산·문구·코드는 복제하지 않는다.
5. 환경 변수와 비밀번호는 추적 문서에 기록하지 않는다.
6. 기능 변경 시 역설계 매트릭스와 이 인수인계 문서를 함께 갱신한다.
