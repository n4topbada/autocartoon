# AI 모델 가격·크레딧 정책

기준일: 2026-07-20. 실행 가격표의 단일 원본은 `src/lib/ai-pricing.ts`다. 이미지·영상 화면의 표시 가격, 작업 생성 시 예상 원가, 서버 크레딧 차감이 모두 이 파일을 사용한다.

## 환산 규칙

```text
요청 크레딧 = ceil(API 원가 USD × 1,500원/USD × 1.5 ÷ 12원/크레딧)
```

- 1크레딧은 12원, 원가 가산율은 1.5배다.
- 카카오·Google 신규 가입자는 가입 시 100크레딧을 한 번 지급받는다.
- 환율은 결제 전 보수적으로 고정한 운영 기준값 1,500원이다. 환율을 바꿀 때는 가격표 상수 하나와 테스트 기대값을 함께 수정한다.
- 반올림은 이미지 장수나 영상 초마다 하지 않고 **요청 전체 원가를 합산한 뒤 한 번만 올림**한다.
- 이미지 표는 고정 출력 원가다. 프롬프트와 참고 이미지 입력 토큰은 사용량에 따라 별도 청구되지만, 현재 크레딧 최소 단위보다 작아 작업별 고정 가격에는 넣지 않았다. 운영 청구서에서 반복적으로 1크레딧 이상 차이가 나면 API usage metadata 기반 사후 정산으로 전환한다.

## 이미지

현재 제품이 요청하는 해상도는 `1K`, `2K` 두 가지다. Nano Banana 2 Lite는 공식적으로 1K만 지원하므로 2K 버튼이 비활성화된다.

| 사용자 선택 | 실제 모델 ID | 상태 | 1K API 원가 / 크레딧 | 2K API 원가 / 크레딧 |
| --- | --- | --- | ---: | ---: |
| Nano Banana 2 | `gemini-3.1-flash-image` | 사용 가능 | $0.067 / **13C** | $0.101 / **19C** |
| Nano Banana Pro | `gemini-3-pro-image` | 사용 가능 | $0.134 / **26C** | $0.134 / **26C** |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` | 사용 가능 | $0.034 / **7C** | 미지원 |
| GPT Image 2, Medium | `gpt-image-2` | 연동 완료, 키 필요 | $0.05268 / **10C** | $0.10704 / **21C** |

GPT Image 2는 공식 출력 단가 $30/백만 토큰과 공식 계산기의 Medium 출력량(1K 1,756토큰, 2K 3,568토큰)을 적용했다. 생성·다중 이미지 편집 API 연동은 완료되었고, 서버에 `OPENAI_API_KEY`가 없으면 선택 단계와 요청 단계에서 차감 전에 비활성화된다. 그림체 참고 이미지는 입력 배열의 첫 번째로 전달하며 GPT Image 2의 자동 고충실도 입력 처리를 사용한다.

Google 입력 단가는 Nano Banana 2 Lite $0.125/백만 토큰, Nano Banana 2 $0.25/백만 토큰, Pro $1/백만 토큰이다. 입력 이미지 한 장은 Lite·Nano 2가 1,120토큰, Pro가 560토큰이다. GPT Image 2는 텍스트 입력 $5/백만 토큰, 이미지 입력 $8/백만 토큰, 캐시 이미지 입력 $2/백만 토큰이다.

## 영상

| 공급자·옵션 | API 원가 | 4초 | 8초 |
| --- | ---: | ---: | ---: |
| Veo 3.1 Fast 720p, 무음 | $0.08/초 | **60C** | **120C** |
| Veo 3.1 Fast 720p, 오디오 | $0.10/초 | **75C** | **150C** |
| Veo 3.1 Fast 1080p, 무음 | $0.10/초 | **75C** | **150C** |
| Veo 3.1 Fast 1080p, 오디오 | $0.12/초 | **90C** | **180C** |
| Seedance 2.0 Fast 720p | $0.12/초 | **90C** | **180C** |
| Seedance 2.0 Standard 1080p | $0.37/초 | **278C** | **555C** |

Veo는 4·6·8초, Seedance는 4~15초를 지원한다. Seedance는 현재 공식 표의 출력 영상 단가를 사용하며 오디오 선택에 따른 별도 단가가 없어 같은 가격을 적용한다. 실패 작업은 기존 원장 참조로 전액 자동 환불되고, 최종 MP4 이어 붙이기는 브라우저 연산이라 0크레딧이다.

## 구현 계약

- 클라이언트가 보낸 가격은 신뢰하지 않는다. 서버가 모델·해상도·길이·오디오를 검증하고 가격표로 다시 계산한다.
- 작업에는 선택 모델 ID, 실제 API 모델 ID, 예약 크레딧, `estimatedCostUsdMicros`를 함께 저장한다.
- UI의 모델 옵션과 실제 차감 행동 버튼 가격은 같은 계산 함수를 사용하며, 버튼에는 `13C`처럼 크레딧 단위를 명시한다.
- 모델별 가격이나 환율 변경은 `src/lib/ai-pricing.ts`와 `tests/ai-pricing.test.ts`를 한 커밋에서 변경한다.

## 실호출 검증

- Nano Banana 2 Lite 1K: 성공, 7크레딧 차감
- Nano Banana Pro 1K: Flash 전용 `thinkingLevel` 옵션이 호환되지 않는 문제를 실호출에서 발견해 모델 표의 호환 설정으로 분리한 뒤 성공, 26크레딧 차감
- 첫 Pro 실패 요청: 26크레딧 자동 환불 확인
- 최종 테스트 계정 순사용: 33크레딧(7 + 26)
- 운영 반영: Cloud Run `wonybananabot-00041-5w6`, 트래픽 100%, 배포 직후 오류 로그 0건

## 공식 출처

- [Google Cloud 생성형 AI 가격](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing)
- [Google Cloud 모델 버전과 ID](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions)
- [OpenAI API 이미지 생성 가격](https://developers.openai.com/api/docs/pricing#image-generation)
- [GPT Image 2 모델](https://developers.openai.com/api/docs/models/gpt-image-2)
- [BytePlus Seedance 가격](https://docs.byteplus.com/en/docs/ModelArk/1544106)
