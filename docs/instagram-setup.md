# Instagram 연동 설정 가이드

최종 갱신: 2026-07-18 KST

## 현재 상태: 보류

Meta OAuth·계정 연결·단일 이미지 발행·계정 인사이트·발행 목록의 서버 코드와 비활성 UI가 남아 있다. 하지만 앱 설정·권한 검수·장기 토큰 자동 갱신·개별 게시물 인사이트 운영이 완료되지 않았으므로 사용자 기능으로 노출하지 않는다.

## 사전 준비

### 1. Instagram 계정

- Instagram 계정을 Business 또는 Creator 계정으로 전환한다.
- Facebook 페이지를 만들고 Instagram 프로페셔널 계정과 연결한다.

### 2. Meta Developer App

1. [Meta for Developers](https://developers.facebook.com/)에서 앱을 만든다.
2. Instagram Graph API 제품을 추가한다.
3. 아래 권한이 실제 제품에 필요한지 다시 확인하고 App Review를 진행한다.

- `instagram_basic`
- `instagram_content_publish`
- `instagram_manage_insights`
- `pages_show_list`
- `pages_read_engagement`

### 3. 환경 변수

```env
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_REDIRECT_URI=https://wonybananabot-272254743773.asia-northeast3.run.app/api/instagram/callback
```

Meta 앱의 유효한 OAuth 리디렉트 URI에도 같은 값을 등록한다. 자체 도메인 전환 시 새 콜백을 먼저 추가하고 안정화 기간에는 기존 Cloud Run 콜백을 유지한다.

개발 모드에서는 앱 역할에 등록되고 초대를 수락한 계정만 로그인할 수 있다. 일반 사용자 공개 전에는 앱 라이브 전환과 권한별 스크린캐스트·사용 목적 심사가 필요하다.

## 현재 코드

- `src/lib/instagram.ts`: OAuth, 토큰 교환, 계정 조회, 이미지 발행, 계정 인사이트
- `src/app/api/instagram/auth/route.ts`: OAuth 시작
- `src/app/api/instagram/callback/route.ts`: 토큰 교환·계정 저장
- `src/app/api/instagram/disconnect/route.ts`: 연결 해제
- `src/app/api/instagram/publish/route.ts`: 이미지 발행
- `src/app/api/instagram/insights/route.ts`: 계정 인사이트
- `src/app/api/instagram/posts/route.ts`: 발행 목록
- `src/components/InstagramTab.tsx`: 현재 내비게이션에서 숨긴 UI
- `InstagramAccount`, `InstagramPost`: 보류 상태로 유지하는 Prisma 모델

## 활성화 전 필수 작업

1. 토큰 만료 전 자동 갱신과 실패 알림을 구현한다.
2. Meta API 현재 버전과 요청 권한을 다시 검증한다.
3. 계정 연결·발행·해제 E2E 테스트와 개인정보 문안을 확정한다.
4. 필요하면 개별 미디어 인사이트 수집과 보존 기간을 설계한다.
5. 위 조건을 만족한 뒤에만 `src/app/page.tsx` 내비게이션에 Instagram 탭을 노출한다.

현재 상태를 “구현 완료”로 취급하지 않는다.
