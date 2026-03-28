# Autocartoon (WonyBananaBot) - Architecture Document

## Overview
AI 캐릭터 일러스트 생성 서비스. Gemini API로 캐릭터 레퍼런스 기반 이미지 생성, 레이어 기반 캔버스 편집, 태그 관리, 게시판 커뮤니티 기능 제공.

## Tech Stack
- **Frontend**: Next.js 15 (App Router), React 19, CSS Modules
- **Backend**: Next.js API Routes (Serverless)
- **Database**: PostgreSQL (Neon), Prisma ORM 6.x
- **Storage**: Vercel Blob
- **AI**: Google Gemini 3.1 Flash (streaming)
- **Deploy**: Vercel

---

## Database Schema (15 Models)

### Core
- **User** - 사용자 (email, password, role, tier, credits)
- **CharacterGroup** - 캐릭터 그룹 (Depth_A: 유니버스)
- **CharacterPreset** - 캐릭터 프리셋 (이름, 대표이미지, 그룹 소속)
- **PresetImage** - 프리셋 참조 이미지 (order, blobUrl)
- **PurchasedPreset** - 구매한 프리셋 (userId+presetId unique)

### Generation
- **GenerationRequest** - 생성 요청 (presetIds[], mode, prompt)
- **GeneratedImage** - 생성된 이미지 (blobUrl, favorite)
- **SavedBackground** - 저장된 배경 이미지

### Tags
- **ImageTag** - 사용자별 태그 정의 (name, color, userId unique)
- **ImageTagLink** - 이미지↔태그 다대다 (cascade delete)

### Community
- **BoardPost** - 게시글 (title, content, imageIds, links)
- **BoardComment** - 댓글
- **BoardLike** - 좋아요 (게시글/댓글)

### System
- **ChatKnowledge** - 챗봇 RAG 지식
- **HelpRequest** - 사람 호출 요청

### Indexes
- PresetImage(presetId)
- GenerationRequest(userId, createdAt)
- BoardPost(userId, createdAt)

---

## API Routes (33 endpoints)

### Auth
- POST /api/auth/login, register, logout, verify
- GET /api/auth/me

### Characters
- GET/POST /api/presets (그룹핑 응답: {groups, ungrouped})
- POST /api/presets/[id]/images (이미지 추가)
- DELETE /api/presets/[id]/images (이미지 삭제)
- PATCH /api/presets/[id]/representative (대표이미지 설정)
- GET/POST /api/groups (그룹 CRUD)
- PATCH/DELETE /api/groups/[id]

### Generation
- POST /api/generate (presetIds[], mode, prompt)
- GET /api/history (태그 포함 응답)
- PATCH/DELETE /api/images/[id] (즐겨찾기/삭제)
- POST /api/images/[id]/tags (태그 토글)
- POST /api/images/save (캔버스 편집 저장)

### Tags
- GET/POST /api/tags
- DELETE /api/tags/[id]

### Marketplace
- GET /api/marketplace (Depth_A 기준)
- POST /api/marketplace/purchase (그룹/개별 구매)

### Background
- GET/POST /api/backgrounds
- DELETE /api/backgrounds/[id]
- POST /api/background-generate

### Board
- GET/POST /api/board
- GET/DELETE/PATCH /api/board/[id]
- POST /api/board/[id]/comments
- POST/DELETE /api/board/[id]/like
- POST /api/board/[id]/pin

### System
- POST /api/chat (챗봇)
- POST /api/help (사람 호출)
- POST /api/admin/knowledge

---

## Frontend Components

### page.tsx (~1,500 lines)
메인 페이지. 사이드바(캐릭터 선택, 배경, 프롬프트) + 갤러리.

### Components (src/components/)
| Component | Lines | Description |
|-----------|-------|-------------|
| CanvasEditor | ~810 | 레이어 기반 이미지 편집 캔버스 |
| WorkflowCard | ~550 | 배경 생성 워크플로우 |
| Board | ~450 | 게시판 (글/댓글/좋아요) |
| ChatBot | ~220 | AI 챗봇 패널 |
| CharacterManagementModal | ~200 | 캐릭터 이미지 관리 |
| BackgroundGenerator | ~180 | 배경 생성기 |
| PromptInput | ~170 | contentEditable 프롬프트 (인라인 태그) |
| UserAvatar | ~150 | 사용자 아바타 + 메뉴 |
| ImageDropZone | ~150 | 파일 드래그&드롭 |
| AuthProvider | ~75 | 인증 Context |
| ImageModal | ~50 | 이미지 모달 |

---

## Key Features

### 1. 캐릭터 시스템
- 2단계 그룹핑: Depth_A(유니버스) → Depth_B(캐릭터)
- 다중 선택 (최대 4개)
- 대표이미지 시스템
- 마켓플레이스 (Depth_A 단위 구매)

### 2. 이미지 생성
- 단일 캐릭터: referenceImages로 전송
- 다중 캐릭터: labeledImages로 이름 라벨 포함 전송
- 모드: text, sketch, edit, transform
- 배경: 텍스트 설명 or 저장된 배경 이미지

### 3. 캔버스 편집
- 레이어 기반 (추가/삭제/순서변경/보기토글)
- 도구: 이동, 크롭, 배경제거(Flood Fill), 투명도
- 빈 레이어 단색 채우기 (10색)
- 비율: 1:1 (1080x1080), 4:5 (1080x1350)
- 1회 Undo (Ctrl+Z/Cmd+Z)

### 4. 태그 시스템
- Gmail 스타일 색 라벨 (8색)
- 개인용 (타인 비공유)
- 중첩 가능 (이미지당 여러 태그)
- 낙관적 업데이트
- 필터링/검색

### 5. 반응형
- Desktop: 사이드바 + 갤러리 2단
- Tablet (1024px): 사이드바 축소
- Mobile (768px): 세로 스택, 3열 그리드

---

## Performance Optimizations
- 낙관적 업데이트: 즐겨찾기, 태그 토글
- useMemo: flatImages 계산 캐싱
- useCallback: 함수형 setState로 stale closure 방지
- Gemini 스트리밍: 생성 중 실시간 반환
- Vercel Blob: CDN 기반 이미지 서빙
- DB 인덱스: userId+createdAt 복합 인덱스
