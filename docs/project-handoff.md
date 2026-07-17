# WONY AutoCartoon 프로젝트 인수인계

작성 기준: 2026-07-17 KST

브랜치: `main`

GitHub: `https://github.com/n4topbada/autocartoon`
운영: `https://wonybananabot-272254743773.asia-northeast3.run.app`

이 문서는 다음 개발자가 현재 운영 구조, 실제 구현, 레퍼런스 차이, 남은 외부 결정을 빠르게 파악하기 위한 기준 문서다. 기능별 조사 근거와 AS-IS -> TO-BE 매트릭스는 [toonagent-reverse-engineering.md](./toonagent-reverse-engineering.md)에 있다.

## 1. 비밀과 접근 정보

- 레퍼런스: `https://app.toonagent.co.kr`
- 레퍼런스 ID·비밀번호: Git에서 제외된 `docs/access-credentials.private.md`
- 운영 사용자 비밀번호, API 키, OAuth secret, DB URL은 문서나 Git에 기록하지 않는다.
- 비밀번호는 평문 복구하지 않으며 이메일 임시 비밀번호 흐름을 사용한다.
- 관리자 대상 계정은 DB 역할로 판별한다. 이메일 닉네임 추정으로 권한을 올리지 않는다.

## 2. 운영 인프라

| 항목 | 현재 값 |
| --- | --- |
| GCP project | `wonybananabot` |
| Cloud Run | `wonybananabot`, `asia-northeast3` |
| Cloud SQL | `wony-postgres`, PostgreSQL 16 |
| Cloud Tasks | `wony-jobs`, `asia-northeast3`; 동시 10, 초당 5, 최대 5회 재시도 |
| GCS | `wonybananabot-media`, private |
| Runtime service account | `wony-run@wonybananabot.iam.gserviceaccount.com` |
| DB secret | Secret Manager `database-url` 참조 |
| AI | Vertex Gemini, Veo, Google Cloud TTS |

Cloud Run 배포에는 항상 `--project=wonybananabot --region=asia-northeast3`를 명시한다. `APP_ORIGIN`과 카카오 Redirect URI는 현재 Cloud Run URL을 사용하고, 자체 도메인 연결 시 새 도메인을 추가한 뒤 기존 URI를 안정화 기간 동안 함께 유지한다.

## 3. 현재 제품 기능

### 인증·개인화

- 이메일 가입·인증, 로그인·로그아웃, 12자 영문/숫자 임시 비밀번호, 강제 변경
- 카카오 OAuth와 명시적 기존 계정 연결
- HttpOnly 세션, DB 기기 세션 최대 2대, 목록·철회·계정 삭제
- 사용자별 캐릭터·생성물·배경·프로젝트·보관함·게시글·크레딧 소유권

### AI·제작

- 구조화 캐릭터 생성, 방향별 이미지, 대표·기본 캐릭터, 보이스 최대 3개
- 일반 장면 최대 4명, 1인·2인 제스처, 저밀도 배경 3단계
- Cloud Tasks 영속 작업, 진행률·재접속·재시도·완료 알림·실패 자동 환불
- 프로젝트·컷·표지·자산·대사·AI 기획·영상 플랜
- PDF/DOCX/ZIP/Markdown/TXT/CSV/HTML, 이미지 OCR, 공개 URL 기획 자료 가져오기
- 레이어 캔버스, 자동 저장, PNG/ZIP, OCR, 영역 AI 다시 그리기
- Veo 영상과 ffmpeg.wasm 숏폼 MP4, 캐릭터별 Google TTS

### 커뮤니티·운영

- 공개 닉네임, 최신/인기 게시판, 이미지·링크, 댓글, 글/댓글 좋아요, 신고, 관리자 고정
- 통합 보관함, 썸네일, 타입 필터, 페이지 이동, 저장 용량, 삭제
- 관리자 사용자·크레딧·신고·챗봇 지식
- 관리자 허용 계정용 구조화 캐릭터 디렉터

### 크레딧·결제

- 신규 30크레딧, 1크레딧 12원 기준 상품, 서버 소유 요율
- 모든 유료 AI 버튼 비용 표시, idempotent 차감 원장, 실패 환불
- 카카오페이 ready/approve/cancel/fail 코드는 있으나 운영 결제는 의도적으로 비활성 상태
- 가맹점 심사·운영 CID·약관·환불·정산 정책 전에는 활성화하지 않는다.

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

## 5. 레퍼런스 대비 남은 항목

| 항목 | 상태 | 이유/다음 단계 |
| --- | --- | --- |
| 캔버스 AI 자동 영역·캐릭터 교체·버전 비교 | 부분 | 코드로 확장 가능, 다음 고급 편집 우선순위 |
| 보관함 전체 메타 통합 검색 | 부분 | 태그·즐겨찾기·프로젝트 자산 인덱스 통합 |
| 대형 영상 서버 렌더 | 부분 | 현재 브라우저 렌더는 기능 완성, 메모리 한계 보완 필요 |
| ko/en/ja | 미구현 | 언어·번역 정책 결정 필요 |
| 휴대폰 본인확인 | 외부 결정 | 공급자·비용·개인정보 정책 필요 |
| 약관·개인정보·환불 페이지 | 외부 결정 | 사업자 정보와 법률 검토 필요 |
| 카카오 알림톡 | 외부 결정 | 비즈채널·템플릿 심사·수신 동의 필요 |
| Instagram/다채널 게시 | 외부 결정 | Meta 앱 검수·토큰 운영 필요 |
| 카카오페이 운영 | 보류 정상 | 상품·정책·가맹점 심사 뒤 활성화 |
| Plurank CRM/CX/마케팅 전체 | 범위 결정 | 개인 창작 기능과 별도 제품군 |

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
npx prisma validate
$env:BUILD_TARGET='cloudrun'; npm run build
gcloud run deploy wonybananabot --source . --project=wonybananabot --region=asia-northeast3 --update-env-vars=APP_ORIGIN=https://wonybananabot-272254743773.asia-northeast3.run.app --quiet
gcloud tasks queues update wony-jobs --project=wonybananabot --location=asia-northeast3 --max-concurrent-dispatches=10 --max-dispatches-per-second=5 --max-attempts=5 --min-backoff=10s --max-backoff=300s --max-doublings=5
```

배포 후 확인:

1. `/login`과 카카오 로그인 콜백
2. 홈 대시보드·설정·게시판·보관함·스튜디오·숏폼
3. Vertex 텍스트와 이미지 실제 작업
4. Cloud Tasks 큐, GCS 산출물, DB job/artifact, 완료 알림
5. Cloud Run 최근 오류 로그

## 8. 개발 원칙

1. UI만 만들어 놓고 완료로 표시하지 않는다. API, DB, 권한, 실패·재시도, 모바일까지 확인한다.
2. 사용자 데이터가 있는 계정은 추정으로 병합하거나 역할을 변경하지 않는다.
3. AI·결제는 서버 소유 비용, idempotency, 원장, 실패 반대 분개를 유지한다.
4. 레퍼런스의 기능 흐름만 독자 구현하고 자산·문구·코드는 복제하지 않는다.
5. 환경 변수와 비밀번호는 추적 문서에 기록하지 않는다.
6. 기능 변경 시 역설계 매트릭스와 이 인수인계 문서를 함께 갱신한다.
