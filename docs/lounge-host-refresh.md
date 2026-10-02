# 진행자 카드와 발랄형 개편 · 2026-10-02

후속 화면 조정: 진행자 이름 아래에 분위기 한 줄을 추가했다(재치형 ‘유쾌하고 재치 있게’, 공감형 ‘다정하고 따뜻하게’, 활기형 ‘활기차고 신나게’, 발랄형 ‘발랄하고 사랑스럽게’). 주제는 ‘소설 속으로’에서 ‘책 속으로’로 넓히고 풍경 카드의 사진·설명 높이를 3:1로 배치했다. PC 3열·모바일 2열을 유지한다.

후속 변경 검증: 빌드·변경 파일 ESLint·320~1440px 브라우저 검사를 통과했다. 320px와 1440px에서 모든 분위기 문구가 한 줄에 표시되고, 여섯 풍경 모두 사진이 카드 높이의 약 75%를 차지하며 설명이 잘리지 않는 것을 확인했다.

진행자 선택 카드의 태그·설명·음색 보조 문구를 제거했다. 사진, 이름, 선택 표시와 목소리 듣기 버튼을 남겼다. 사진은 기존 76px에서 PC 112px, 600px 이하 화면 104px로 확대했다.

재치형 사진은 기존 가상 인물의 얼굴과 웃는 인상을 유지하면서 정장·셔츠·넥타이를 갖춘 토크쇼 진행자 분위기로 수정했다. `public/lounge/host-witty-v2.webp`를 사용한다. 재치형의 대화·음성 설정은 유지한다.

기존 마지막 스타일은 **발랄한 진행자**로 바꿨다. 새로운 가상 성인 여성 사진 `public/lounge/host-bubbly-v1.webp`, 맑고 밝은 음색, 다정한 장난과 짧은 반응을 사용한다. 활기형의 높은 에너지와 구별되도록 가까운 친구 같은 친밀감을 지시한다. 실제 인물의 얼굴이나 목소리를 복제한 설정은 아니다.

TTS 기본 음성은 `sage`에서 `coral`, 속도는 0.92에서 1.07로 변경하고 긴 쉼과 어미 늘이기를 피하도록 지시했다. 동일한 설정으로 실제 TTS 예시 `public/lounge/host-bubbly-v1.mp3`를 새로 생성했다. 기존 예시 세 개는 재사용하고 새 음성 생성 요청은 한 번이었다. 듣기 버튼 재생에는 추가 API 호출이 없다.

저장된 호스트 ID `dodi`는 유지하므로 기존 방과 초대 링크도 새 발랄형으로 표시·진행된다. 추가 SQL 실행은 필요 없다.

프로덕션 빌드·변경 파일 ESLint·모의 API 검사 28개와 320~1440px Chrome 검사를 통과했다. 새로운 사진 로드, 보조 문구 제거, 사진 크기, 발랄형 표시, 음성 예시 디코딩·교체·이동 시 정지를 확인했다. 실제 여러 사람 대화에서 음성 연기와 진행 품질의 평가는 별도로 필요하다.

기존 `host=dodi` 미리보기 링크와 새 발랄형 예시의 실제 재생·페이지 이동 시 정지도 확인했다. [새 카드 화면](./lounge-host-cards-refresh.png)

## 자산과 생성 프롬프트

기본 제공 `image_gen` 도구로 첫 사진은 편집하고 두 번째 사진은 새로 생성했다. PNG를 512×512 WebP로 크기 조절·인코딩해 프로젝트에 저장했다.

- `public/lounge/host-witty-v2.webp` — 25,154바이트
- `public/lounge/host-bubbly-v1.webp` — 36,596바이트
- `public/lounge/host-bubbly-v1.mp3` — 191,616바이트

재치형 전체 편집 프롬프트:

```text
Use case: identity-preserve. Edit target: the supplied fictional Korean male lounge host portrait. Replace his casual olive overshirt and t-shirt with a beautifully fitted charcoal navy suit, crisp ivory dress shirt and elegant narrow dark tie, like a polished evening talk-show presenter. Keep the same fictional face, age, hairstyle, friendly clever smile, direct eye contact, natural skin texture, centered head-and-shoulders composition and warm blurred lounge background. A slightly knowing playful expression, approachable, charming, quietly funny rather than solemn or corporate. Square portrait, entire hair and shoulders visible with space for circular crop, soft premium portrait photography, no microphone, no text or logo.
```

발랄형 전체 생성 프롬프트:

```text
Use case: photorealistic-natural. Asset type: square profile photo for a fictional female AI lounge conversation host. Generate an entirely fictional Korean woman in her late twenties with a fresh cute playful presence, bright sparkling eyes and a warm lively smile showing a hint of teeth, natural long dark softly waved hair, small understated earrings, a polished cream blouse with a pastel peach cardigan. Centered head-and-shoulders portrait with direct eye contact, entire hair and shoulders visible and ample margin for a circular crop. She looks like a friendly, charming conversational radio presenter, bubbly, witty, kind and warmly approachable. Adult proportions, natural realistic skin, authentic cheerful expression without exaggerated posing. Premium natural lifestyle photography, soft flattering window light, softly blurred warm cafe lounge in cream and peach tones, consistent 85mm portrait lens. No text, logo, watermark, headset or microphone. Create a new original face rather than any recognizable real individual.
```
