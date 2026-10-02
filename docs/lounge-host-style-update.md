# 라운지 사회자 사진·목소리와 풍경 배치 · 2026-10-02

후속 변경: 카드 보조 문구를 제거하고 사진을 확대했다. 재치형 사진은 정장으로 변경하고 마지막 느긋형은 coral 음성·1.07 속도의 발랄형으로 교체했다. 아래는 최초 변경 기록이며 최신 자산·설정은 [진행자 카드와 발랄형 개편](./lounge-host-refresh.md)을 참고한다.

풍경 선택은 600px 초과 화면에서 **3열×2행**, 600px 이하에서는 카드와 설명을 읽기 쉽도록 2열로 표시한다.

사회자 선택 카드, 방 만들기 요약, 열려 있는 방 목록, 대화방의 사회자와 대화 기록에 같은 인물 사진을 사용한다. 네 사진은 실제 인물과 관계없는 AI 생성 인물이며 화면에도 합성 음성과 함께 안내한다. 기존 호스트 ID를 유지하므로 기존 방과 링크는 계속 동작하고 **이번 변경에 추가 DB 마이그레이션은 없다**.

## 대화 성격과 음성

대화 모델의 행동 지시와 TTS의 전달 지시를 분리했다. 재치형에는 참가자의 구체적인 표현을 짧은 관찰·비유로 받아 질문으로 잇는 창작 예시를 추가했다. 진지한 이야기에는 억지 농담을 하지 않고 순서 발언의 질문·대상은 서버 상태를 따른다. 공감형·활기형·느긋형도 각자 반응과 질문 방식의 예시를 갖는다. 대화 모델은 기존 `gpt-6-luna`를 유지한다.

TTS는 `gpt-4o-mini-tts`를 유지하며 음색, 속도와 별도의 한국어 억양·쉼·감정 지시를 적용한다. OpenAI 문서는 이 모델에서 억양·감정·톤·속도를 지시할 수 있다고 설명하며 `marin`과 `cedar`를 권장한다. 한국어도 지원하지만 기본 음성은 영어에 최적화되어 있으므로 한국어 연기의 자연스러움은 실제 대화로 평가해야 한다. [공식 TTS 문서](https://developers.openai.com/api/docs/guides/text-to-speech)

| 진행 스타일 | 기본 음성 | 속도 배율 | 전달 방향 |
| --- | --- | --- | --- |
| 재치 있는 진행자 | cedar | 1.04 | 밝은 음색, 짧고 경쾌한 리듬, 재치 있는 구절의 가벼운 강조 |
| 공감하는 진행자 | marin | 0.98 | 따뜻한 음색, 감정 구절을 천천히, 질문 앞의 짧은 쉼 |
| 활기찬 진행자 | verse | 1.08 | 또렷하고 생기 있는 호흡, 풍부한 억양 |
| 느긋한 진행자 | sage | 0.92 | 차분한 음색, 문장 사이의 여유 있는 쉼 |

PCM 스트리밍과 MP3 응답은 `loungeSpeechRequest`의 같은 설정을 사용한다. 클라이언트가 보내는 호스트 ID 대신 서버가 읽은 방의 호스트를 사용한다. 음성 성격은 사진·말투와 어울리도록 설정했으며 특정 인물의 목소리를 재현한 것은 아니다.

## 목소리 미리 듣기

각 선택 카드의 **목소리 듣기**는 위 설정으로 실제 생성한 고정 한국어 MP3를 재생한다. 다른 예시를 누르거나 진행자를 선택하거나 페이지를 떠나면 기존 재생을 멈춘다. 듣기 버튼 자체는 유료 API를 호출하지 않는다.

네 예시를 처음 만들 때 TTS 요청 4회가 발생했다. `scripts/generate-lounge-host-samples.mjs`는 서버 키가 설정된 환경에서 예시를 만들고 기존 파일을 재사용한다. 음성·지시·문장을 변경했다면 `--overwrite`로 재생성해야 하며 그때는 다시 TTS 비용이 발생한다. 키나 공급자의 원문 오류를 출력하지 않는다.

## 확인

- 프로덕션 빌드와 변경 파일 ESLint 통과.
- 모의 API 검사 28개 통과. 네 스타일의 대화 지시, PCM/MP3 음색·속도·음성 지시와 방 설정 우선 적용을 확인.
- 실제 Chrome에서 320·390·768·1024·1440px, 풍경 열 수, 인물 사진 로드, 네 MP3 디코딩·재생·교체·이동 시 정지, 반복 미리보기 확인.
- 실제 방 컴포넌트의 자동 연결·시작과 순서 발언·손들기·패스·마이크 발언 순서 보호 검사 통과.
- 실제 참가자가 나누는 대화의 재치·진행 품질과 한국어 음성의 주관적 평가는 아직 진행하지 않았다. 지시 개선이 매 발언의 유머나 표현을 보장하지는 않는다.

[메인 화면](./lounge-host-styles-desktop.png) · [대화방 사진 적용](./lounge-host-photo-room.png)

## 생성 사진과 전체 프롬프트

기본 제공 `image_gen`으로 각각 생성했다. 원본 PNG를 512×512 WebP로 크기 조절·인코딩하여 `public/lounge/host-{witty,empathetic,lively,relaxed}-v1.webp`에 저장했다. 아래는 각 요청에 사용한 전체 프롬프트다.

### 재치 있는 진행자

```text
Generate a square 1:1 photorealistic editorial head-and-shoulders portrait of an entirely fictional Korean adult AI conversation host. Direct eye contact, centered composition with entire hair and shoulders visible, generous clear margin around head for a round crop. Premium natural lifestyle photography, realistic skin texture, soft window lighting, warm softly blurred lounge background, consistent 85mm portrait lens, subtle warm cream and earthy colors. Friendly approachable everyday person, understated wardrobe, authentic expression rather than fashion model posing. No text, labels, logos, watermarks, headphones or microphones. Not a celebrity and no resemblance to any recognizable public figure. Character: a man in his late thirties with natural short textured dark hair, no glasses, a linen overshirt in warm olive over an ivory t-shirt. A playful knowing smile, lively expressive eyes, slightly raised eyebrow and open posture suggesting a quick-witted inclusive host who makes everyone feel welcome. Tasteful golden warmth.
```

### 공감하는 진행자

```text
Generate a square 1:1 photorealistic editorial head-and-shoulders portrait of an entirely fictional Korean adult AI conversation host. Direct eye contact, centered composition with entire hair and shoulders visible, generous clear margin around head for a round crop. Premium natural lifestyle photography, realistic skin texture, soft window lighting, warm softly blurred lounge background, consistent 85mm portrait lens, subtle warm cream and earthy colors. Friendly approachable everyday person, understated wardrobe, authentic expression rather than fashion model posing. No text, labels, logos, watermarks, headphones or microphones. Not a celebrity and no resemblance to any recognizable public figure. Character: a woman in her mid-thirties with a natural softly layered dark brown bob tucked behind one ear, a cream knit cardigan. A small kind smile, attentive warm eyes and gentle relaxed posture suggesting an empathetic listener who notices feelings and asks thoughtful questions. Soft muted lilac undertone in the blurred background.
```

### 활기찬 진행자

```text
Generate a square 1:1 photorealistic editorial head-and-shoulders portrait of an entirely fictional Korean adult AI conversation host. Direct eye contact, centered composition with entire hair and shoulders visible, generous clear margin around head for a round crop. Premium natural lifestyle photography, realistic skin texture, soft window lighting, warm softly blurred lounge background, consistent 85mm portrait lens, subtle warm cream and earthy colors. Friendly approachable everyday person, understated wardrobe, authentic expression rather than fashion model posing. No text, labels, logos, watermarks, headphones or microphones. Not a celebrity and no resemblance to any recognizable public figure. Character: a man in his late twenties with casually tousled dark hair, a muted coral casual shirt. A bright genuine open smile with a hint of teeth, expressive eyes, energetic but natural posture suggesting an upbeat host who brings lively reactions and playful imagination. Warm peach background tones, no exaggerated comedian expression.
```

### 느긋한 진행자

```text
Generate a square 1:1 photorealistic editorial head-and-shoulders portrait of an entirely fictional Korean adult AI conversation host. Direct eye contact, centered composition with entire hair and shoulders visible, generous clear margin around head for a round crop. Premium natural lifestyle photography, realistic skin texture, soft window lighting, warm softly blurred lounge background, consistent 85mm portrait lens, subtle warm cream and earthy colors. Friendly approachable everyday person, understated wardrobe, authentic expression rather than fashion model posing. No text, labels, logos, watermarks, headphones or microphones. Not a celebrity and no resemblance to any recognizable public figure. Character: a woman in her late forties with shoulder-length dark brown hair with a few subtle natural gray strands, a soft sage green cardigan over an ivory top. A restful subtle smile, calm welcoming eyes, relaxed shoulders and unrushed presence suggesting a laid-back host who gives people time to think. Soft muted sage tones in the blurred background.
```
