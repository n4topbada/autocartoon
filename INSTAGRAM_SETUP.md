# Instagram 연동 설정 가이드

## 현재 상태: 보류 (UI 비활성화)
기능은 구현 완료되어 있으나, Meta Developer App 설정이 필요하여 비활성화 상태.

---

## 사전 준비

### 1. Instagram 계정 준비
- Instagram 계정을 **Business** 또는 **Creator** 계정으로 전환
- 설정 → 계정 → 프로페셔널 계정으로 전환

### 2. Facebook 페이지 연결
- Facebook 페이지 생성 (없으면)
- Instagram 설정 → 계정 → 연결된 계정 → Facebook → 페이지 연결

### 3. Meta Developer App 생성
1. https://developers.facebook.com 접속
2. "앱 만들기" 클릭
3. 앱 유형: **"없음"** 또는 **"소비자"** 선택 (비즈니스 포트폴리오 필요 없는 유형)
4. 앱 이름: "WonyBananaBot" (자유)

### 4. Instagram Graph API 제품 추가
1. 앱 대시보드 → "제품 추가"
2. "Instagram Graph API" 선택

### 5. 이용 사례 추가 (권한)
다음 5개 권한을 이용 사례에 추가:
- `instagram_basic` — 프로필 정보 읽기
- `instagram_content_publish` — 이미지 발행
- `instagram_manage_insights` — 인사이트 조회
- `pages_show_list` — Facebook 페이지 목록
- `pages_read_engagement` — 페이지 참여도

### 6. 환경변수 설정
Vercel 프로젝트 설정 또는 `.env`에 추가:
```
INSTAGRAM_APP_ID=앱_ID
INSTAGRAM_APP_SECRET=앱_시크릿
INSTAGRAM_REDIRECT_URI=https://wonybananabot.vercel.app/api/instagram/callback
```

### 7. Redirect URI 등록
Meta 앱 설정 → Instagram → 기본 표시 → 유효한 OAuth 리디렉트 URI에 추가:
```
https://wonybananabot.vercel.app/api/instagram/callback
```

### 8. 테스터 등록 (개발 모드)
- 앱 역할 → 역할 → 테스터 추가
- 테스터의 Facebook 계정으로 초대 수락
- 개발 모드에서는 등록된 테스터(최대 25명)만 OAuth 연동 가능

### 9. 라이브 모드 전환 (선택)
- 모든 사용자가 사용하려면 App Review 제출 필요
- 스크린캐스트 영상 + 각 권한 사용 목적 설명
- 심사 수일~수주 소요

---

## 활성화 방법
환경변수 설정 완료 후 `src/app/page.tsx`에서 인스타그램 탭 활성화:
```tsx
// 현재: 비활성화
// activeTab === "instagram" 조건 주석 해제
```

---

## 구현된 파일 목록
- `src/lib/instagram.ts` — Meta Graph API 래퍼
- `src/app/api/instagram/auth/route.ts` — OAuth URL 생성
- `src/app/api/instagram/callback/route.ts` — 토큰 교환
- `src/app/api/instagram/disconnect/route.ts` — 연동 해제
- `src/app/api/instagram/publish/route.ts` — 이미지 발행
- `src/app/api/instagram/insights/route.ts` — 계정 인사이트
- `src/app/api/instagram/posts/route.ts` — 발행 게시물 목록
- `src/components/InstagramTab.tsx` — 인스타그램 탭 UI
- `prisma/schema.prisma` — InstagramAccount, InstagramPost 모델

## 광고 액세스 제한 이슈
Facebook 계정에 광고 제한이 걸린 경우:
- 앱 유형을 "비즈니스" 대신 "없음/소비자"로 선택
- 또는 다른 Facebook 계정으로 앱 생성
- Meta Business Help Center에서 이의 제기 가능
