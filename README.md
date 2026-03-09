# AutoCartoon - 웹툰 캐릭터 이미지 생성 웹서비스

웹툰 작가용 캐릭터 이미지 생성 프로토타입입니다. 캐릭터 프리셋 이미지를 기반으로 Google Gemini API를 활용해 새로운 장면을 생성합니다.

## 기능

- **텍스트 생성**: 텍스트 설명으로 캐릭터 장면 생성
- **스케치 변환**: 러프 스케치를 웹툰 스타일로 변환
- **이미지 편집**: 기존 이미지를 수정
- **배경 선택**: 다양한 배경 프리셋
- **히스토리**: 생성 이력 조회

## 기술 스택

- Next.js 15 + TypeScript
- Prisma + SQLite
- Google Gemini API (@google/genai)

## 실행 방법

```bash
# 1. 환경변수 설정
cp .env.example .env
# .env 파일에 GEMINI_API_KEY 입력

# 2. 의존성 설치
npm install

# 3. DB 반영
npm run db:push

# 4. 캐릭터 프리셋 import (assets/ 폴더에 이미지 추가 후)
npm run import:presets

# 5. 개발 서버
npm run dev
```

## 캐릭터 프리셋 추가

`assets/` 디렉토리 아래에 캐릭터별 폴더를 만들고 참조 이미지를 넣습니다:

```
assets/
  캐릭터이름/
    1.png
    2.png
    ...
```

그 후 `npm run import:presets`를 실행하면 자동으로 DB에 등록됩니다.
