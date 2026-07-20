# 숏폼 씬 제작 파이프라인

## 현재 동작

`/shorts`는 프로젝트 컷을 세로 영상 씬으로 제작하는 전용 워크스페이스다.

1. 프로젝트와 씬을 만들고 씬마다 시작 이미지를 선택한다.
2. 한국어 등 짧은 장면 설명을 입력한다.
3. Gemini Flash의 `영상 프롬프트 확장`을 실행하면 단일 연속 씬에 맞는 영문 제작 프롬프트와 제외 요소를 구조화 JSON으로 만든다.
4. 씬마다 Veo 또는 Seedance, 길이, 720p/1080p, 오디오 생성을 선택한다.
5. 생성은 기존 `GenerationJob -> Cloud Tasks -> 공급자 폴링 -> private GCS` 파이프라인에서 비동기로 실행된다.
6. 사용자는 완성된 씬을 재생한 뒤 승인하거나 Retry할 수 있다.
7. 승인된 씬만 순서대로 H.264/AAC, 30fps, 9:16 규격으로 정규화하고 MP4로 이어 붙인다.
8. 최종 MP4는 프로젝트 작업 보관함과 `GenerationArtifact`에 저장한다.

생성 실패와 제한 시간 초과는 기존 원장 참조로 자동 환불한다. Retry는 새 외부 생성 요청이므로 다시 차감하며, 최종 MP4 병합은 브라우저 연산이라 별도 크레딧을 차감하지 않는다.

## 공급자

| 공급자 | 모델 선택 | 길이 | 해상도 | 현재 상태 |
| --- | --- | ---: | --- | --- |
| Veo | `VERTEX_VIDEO_MODEL` | 4, 6, 8초 | 720p, 1080p | Vertex AI 설정 재사용 |
| Seedance | 720p Fast / 1080p Full | 4~15초 | 720p, 1080p | `SEEDANCE_API_KEY` 필요 |

Seedance 키가 없으면 탭은 비교를 위해 표시하지만 선택할 수 없다. 서버도 작업 생성과 크레딧 예약 전에 `provider_not_configured`로 차단한다. Seedance의 임시 결과 URL은 성공 직후 서버가 내려받아 private GCS에 복사한다.

## 크레딧 정책

- Gemini Flash 프롬프트 확장: 1크레딧
- Veo 3.1 Fast: 720p 무음 $0.08/초, 오디오 $0.10/초; 1080p 무음 $0.10/초, 오디오 $0.12/초
- Seedance 2.0: 720p Fast $0.12/초, 1080p Standard $0.37/초
- 공통 환산: `ceil(API USD × 1,500 × 1.5 ÷ 12)`, 요청 전체에서 한 번 올림

구현과 전체 예시는 [AI 모델 가격·크레딧 정책](./ai-model-pricing.md)을 따른다. 공급자 실제 청구와 `estimatedCostUsdMicros`를 정기 대조해 환율 상수를 조정한다.

## 데이터와 API

`ProjectCut`은 `videoPrompt`, `videoProvider`, `videoResolution`, `videoGenerateAudio`, `videoApprovedAt`을 저장한다. 생성 성공 시 현재 `videoUrl`을 새 결과로 교체하고 승인을 해제한다.

- `GET /api/shorts/providers`: 공급자 연결 상태, 모델, 옵션
- `POST /api/shorts/prompt`: Gemini Flash 프롬프트 확장과 저장
- `POST /api/jobs`: 공급자별 영상 작업 생성과 크레딧 예약
- `PATCH /api/studio/cuts/:id`: 씬 설정과 승인 상태 저장
- `POST /api/shorts/upload`, `/confirm`: 최종 MP4 보관

## 운영 메모

현재 최종 병합은 기존 ffmpeg.wasm을 재사용해 클라이언트에서 실행한다. 수십 초 길이의 일반 숏폼은 서버 비용 없이 처리할 수 있지만, 많은 1080p 씬을 한 번에 합치면 브라우저 메모리 영향을 받는다. 사용량이 생기면 같은 정규화 명령을 private Cloud Run 인코딩 worker와 Cloud Tasks로 이동하고, 화면의 승인·병합 계약은 그대로 유지한다.
