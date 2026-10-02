# 목소리와 취향으로 가까워지는 라운지

기획 및 요금 확인: 2026-10-01, 한국 시간. USD, 세금·환전·저장·전송 비용 제외.

## 서비스 판단

핵심 가설은 **함께 이야기해 본 사람에게 느끼는 호감이 다음 만남으로 이어진다**는 것이다. 사진을 넘기는 경험과 달리 목소리, 반응, 상대의 말을 듣는 태도, 질문하는 방식과 가치관을 경험할 수 있다. 이는 설득력 있는 제품 방향이지만 더 좋은 매칭이나 지속적인 관계를 보장한다는 근거는 아직 없다. 실제 상호 관심과 재대화율로 검증한다.

포지셔닝: “취향으로 만나, 목소리로 가까워지는 라운지.” 일반 토론 제품의 승패·평가 요소를 이 경험에 넣지 않는다. 대화 목적을 가입 때 선택하게 하고, 만남을 원하는 성인과 친구를 찾는 이용자가 서로의 목적을 이해한 상태로 참여하게 한다. AI와 혼자 이야기하는 연습은 준비 경험으로 두고, 핵심 가치는 사람 간 대화로 검증한다.

## 첫 실험

- 같은 관심 주제로 사람 4명과 AI 사회자, 15~20분 대화. 현재 방은 최대 60분이며 첫 실험 시간은 제안이다.
- 처음 2분은 “좋아하는 작품과 기억에 남는 장면” 같은 쉬운 질문으로 시작한다.
- 이후 선택의 이유, 감정, 일상 경험으로 자연스럽게 이어간다. 사회자는 질문을 한 번에 하나만 하고 참가자의 실제 발언을 연결한다.
- 상대의 말을 듣거나 질문하는 공간을 확보한다. 사회자는 대화가 이어지는 동안 끼어들지 않는다.
- 종료 후 개별적으로 “더 이야기하고 싶은 사람”을 선택한다. 양쪽이 선택한 경우에만 1:1 초대가 생긴다. 일방 관심과 거절 결과는 상대에게 공개하지 않는다.
- 사진 공개는 별도 상호 동의로 진행한다. 사회자가 외모를 평가하거나 사용자 성격·궁합을 점수로 판정하지 않는다.

대화 주제는 일상, 여행, 영화, 생활 방식부터 시작한다. 가치관이 드러나는 이유 질문을 활용하되 심문처럼 정답을 요구하지 않는다. 데이팅 이용자에게는 성인 참여, 차단·신고, 수신 거부와 동의에 따른 연결이 실제 출시 조건이다.

## 화면 경험과 구현 상태

이번 구현:

- 호텔 카페 라운지 배경, 월넛·코코아·샴페인 색상, 부드러운 조명과 큰 인물 프로필 카드. 중앙 타원 테이블과 원형 좌석 배치는 제거했다.
- 인물 프로필은 데스크톱 약 180~210px, 모바일 약 100~168px이며 1:1은 200px이다. 빈 자리는 작게 표시하고 발언자는 금빛 테두리·파형·상태 문구로 강조한다.
- LiveKit의 실제 발언 감지에 연결한 참가자 테두리·파형·“지금 이야기 중” 표시. 사회자 음성 상태도 별도로 표시한다. 동시에 사람이 말하면 사람의 표시도 유지한다.
- 사회자의 마지막 발언을 화면 위에서, 참가자의 최근 발언을 해당 좌석에서 확인한다.
- 사회자 스트림의 문장을 음성 시작 전에 화면에 반영하고, 음성 시작 시 다른 참가자에게도 전달한다. AI 음성은 방장의 LiveKit 참가자가 발행하므로 해당 음성이 방장의 직접 발언 표시를 켜지 않도록 구분한다.
- 오른쪽 대화 기록에는 발언자의 아바타와 AI 사회자 표시가 나온다.
- 가상 캐릭터 6개 중 사용자 선택. 선택은 해당 브라우저에 저장하며, 접속 중 LiveKit metadata로 다른 참가자와 공유한다. 기본 프로필은 닉네임 첫 글자이며 실제 외모를 추정하지 않는다.
- 미리보기는 가상 참가자와 발언 효과를 명확히 표시한다. 효과 일시정지와 아바타 선택 가능. 실제 AI·음성 연결 없이 확인한다.
- 모바일 좌석 배치와 모션 감소 설정 대응.
- 이메일 가입 화면의 선택 사진 첨부와 가입 후 변환·결과 승인. 기존 회원과 소셜 회원은 홈의 프로필 수정에서 생성한다. 이메일 인증이 필요한 계정은 인증 후 로그인해서 프로필에서 생성한다.
- `gemini-3.1-flash-image` (Nano Banana 2), 512×512 반실사 일러스트. 동일 인물의 눈·코·입·얼굴형·나이·표정 유지, 과한 미화와 획일적인 3D 인형 얼굴 억제.
- 원본은 브라우저에서 최대 1024px로 리사이즈·재인코딩해 위치정보를 제거한 후 API로 전달하며 서비스 Storage에는 저장하지 않는다. 동의와 승인 후 생성 결과만 512px WebP로 비공개 저장한다.
- 계정별 하루 3회(한국 날짜), 15초 간격. 실패도 시도에 포함되며 저장 재시도는 모델을 다시 호출하지 않는다. 익명 게스트는 변환할 수 없다.
- 계정 아바타는 기기 간 유지되며 실제 방 연결 시 2시간 유효한 이미지 링크를 새로 발급해 LiveKit metadata로 전달한다. 기본 캐릭터 선택은 해당 연결에서 사진 아바타 대신 표시한다.

별도 구현할 기능:

- 관심사·만남 목적에 따른 참여자 모집 및 방 추천.
- 종료 후 상호 관심 선택, 1:1 연결, 상호 사진 공개.
- 신고·차단·수신 제어와 운영 도구.

현재 6개 샘플은 가상의 캐릭터이며 사진을 변환한 결과가 아니다. 사진으로 생성해 승인한 아바타는 계정 프로필에 저장된다. 실제 두 브라우저 간 아바타 전달은 라운지의 별도 미적용 마이그레이션과 서비스 배포 후 연결 검증이 필요하다.

## 현재 사진 변환 모델

기본은 Nano Banana 2 (`gemini-3.1-flash-image`), 512px 정사각형 출력이다. 특징 유지와 자연스러움을 우선하며, 범용 챗봇 프롬프트를 받지 않는 전용 `/api/lounge-avatar`에서 모델·프롬프트·출력 크기를 고정한다. 사용 중인 Google 키로 모델 조회가 성공했으며 `generateContent` 지원을 확인했다. 실제 얼굴 사진 생성 품질은 사용자의 테스트가 필요하다.

REST 요청 주의: `generationConfig.responseFormat.image`는 문자열 비율·해상도가 아니라 `ASPECT_RATIO_ONE_BY_ONE`, `IMAGE_SIZE_FIVE_TWELVE` 열거형을 받는다. 초기 `1:1`·`512` 설정이 실제 Google `400 INVALID_ARGUMENT`를 발생시켰고 서버가 502로 표시했다. 값을 수정하고 생성 불가능한 빈 요청에서 해당 옵션 오류가 사라지는 것을 확인했다. 결제·크레딧·권한·요청 형식·사용량 오류는 이제 별도 코드와 안내로 표시한다. 모델 조회 성공은 이미지 생성 결제 상태 확인을 의미하지 않는다.

설정: 서버 `GEMINI_API_KEY`, 기존 Supabase URL/anon key. `20261001040000_lounge_profile_avatars.sql`은 2026-10-01 연결된 Supabase에 단독 적용하고 이력을 기록했다. 이전 라운지/토론 미적용 마이그레이션은 실행하지 않았다. 프런트엔드는 로컬 구현이며 운영 배포는 하지 않았다.

검증: `node --test scripts/lounge-avatar.test.mjs`, `node scripts/lounge-avatar-db-check.mjs`, `node scripts/lounge-avatar-browser-check.mjs`. 브라우저 검사는 CDP 9241, Vite 5191의 로컬 모의 계정·모의 모델을 사용한다. 비용을 발생시키는 이미지 호출이나 실제 계정 생성은 하지 않는다.

공식 참고: [Google 이미지 생성 API](https://ai.google.dev/gemini-api/docs/generate-content/image-generation), [Google API 데이터 정책](https://ai.google.dev/gemini-api/terms).

## 초기 비교 후보 (참고)

| 방식 | 공식 단가 | 선택 이유와 한계 |
| --- | --- | --- |
| fal FLUX.1 Kontext Dev | $0.025 / 메가픽셀, 올림 청구 | 저렴한 사진 스타일 변환 후보. 출력 1MP 이하면 1회 약 $0.025, 1MP 초과~2MP면 $0.05. 품질은 자체 샘플 테스트 필요. |
| fal FLUX.1 Kontext Pro | $0.04 / 이미지 | 동일한 스타일과 특징 유지가 만족스럽다면 채택할 MVP 기본 후보. 작은 단가 차이보다 승인되는 결과의 비율을 비교한다. |
| DiceBear 로컬 생성 | 모델 호출 비용 없음 | 사진 변환 기능 없이 직접 고르는 아바타 대안. 코드 MIT와 각 스타일의 별도 라이선스를 확인하고 CC0 스타일을 선택한다. |

출처: [fal Dev](https://fal.ai/models/fal-ai/flux-kontext/dev), [fal Pro](https://fal.ai/models/fal-ai/flux-pro/kontext), [DiceBear 라이선스](https://www.dicebear.com/licenses/).

추천: 얼굴 사진 20~30장으로 Dev와 Pro를 비교한 후 **승인된 아바타 1개당 비용**을 기준으로 선택한다. 공개 동의를 받은 테스트 사진을 사용한다. Dev 1MP 이하 1,000회 생성은 $25, Pro 1,000회는 $40이며 재시도 비용은 별도다. 예를 들어 1,000명에게 각각 두 번 생성하면 $50 / $80이다. 현재 두 방식의 품질 우열은 검증하지 않았다.

가입 시 1회 생성하고 WebP 썸네일로 저장해 재사용한다. 대화 중에는 새 얼굴 이미지를 생성하지 않고 CSS 테두리·파형만 바꿔 발언을 표현한다. 키는 서버에 보관하고 인증된 사용자에게 생성 횟수를 제한한다. 결과 승인 전 미리보기와 재생성 선택을 제공한다.

사진 입력 → 촬영 배경·위치정보 제거 → 서버에서 변환 → 본인 결과 승인 → 캐리커처만 프로필에 저장. 원본 사진은 작업 완료 후 삭제하는 정책을 기본으로 설계하고 제공업체의 입력 보관 정책도 검토한다. 공개 원본을 보관하려면 별도로 동의를 받는다.

권장 스타일은 과도한 미화보다 머리·안경·표정·분위기를 남기는 일관된 일러스트다. 결과가 실제 외모와 다를 수 있다는 점을 알려준다. 캐리커처와 목소리는 신원을 알아보게 할 수 있으므로 ‘완전 익명’이라고 표현하지 않는다.

변환 프롬프트 초안:

> Convert this consenting adult's portrait into a warm editorial clay caricature for a voice lounge. Preserve hairstyle, glasses if present, skin tone, and general expression. Simplify fine facial detail and remove identifiable surroundings. Do not beautify, change age, or add accessories. Center one head-and-shoulders portrait on a muted sage background, with space around the hair for a circular crop. No text, logos, or watermark.

## 검증 지표

- 핵심: 대화 종료 후 상호 관심 비율, 매칭 뒤 실제 두 번째 대화 참여율.
- 경험: 입장 대비 실제 음성 참여, 대화 완료, 특정 한 사람의 발언 독점, AI 개입량, 응답 지연.
- 운영: 첫 참가자 대기 시간, 방 취소율, 신고·차단 비율.
- 비용: 승인된 아바타당 비용, 완료 대화당 비용, 실제 두 번째 만남으로 이어진 연결당 비용.

성공 기준은 초기 실험 데이터를 보고 정한다. 사진 기반 서비스보다 관계의 질이 높다는 주장은 비교 실험 전에는 마케팅에서 보장하지 않는다.

## 이미지 제작 기록

Built-in imagegen 사용. 최종 파일: `public/lounge/avatar-portraits.png`.

최종 생성 프롬프트:

```text
Use case: stylized-concept. Asset type: six avatar portraits for a refined voice conversation lounge. Create ONE square image containing an exact seamless 3-column by 2-row grid of SIX DIFFERENT fictional Korean adult characters, each in their own equally sized square tile. No gaps or borders. Each cell has one centered head-and-shoulders portrait, entire hair visible with ample margins so the cell can be cropped into a circle. Top row: friendly adult man with short dark hair and round glasses wearing cream knit; adult woman with short dark bob hair wearing soft sage cardigan; adult man with slightly wavy dark hair wearing navy sweater. Bottom row: adult woman with long dark hair wearing warm rust knit; adult man with medium dark hair wearing soft olive shirt; adult woman with dark hair tied back wearing cream blouse. Style: sophisticated charming editorial 3D clay caricature portraits, matte handcrafted texture, expressive natural eyes, understated slightly exaggerated features, rounded forms, beautiful warm soft lighting, realistic adult proportions but clearly illustrated, no resemblance to celebrities. Individual tile backgrounds in muted warm cream, sage, muted lavender, terracotta, olive, dusty rose respectively. Face must be centered near middle of each cell. Same scale and visual style for all six. Exact grid, exactly six faces. No text, no watermarks, no props.
```

실제 결과는 정사각형 전체 안에 3열·2행 직사각형 타일로 생성되었다. UI에서 각 타일 중앙을 정사각형으로 표시해 원형 프로필에 사용한다.

## 풍경 테마 배경 제작

Built-in `imagegen`으로 루프탑, 한강 야경, 숲속 배경을 각각 생성했다. 최종 자산은 모두 1536×1024 WebP이며 생성 PNG를 내용 변경 없이 브라우저로 인코딩했다. 원본 PNG는 Codex 생성 이미지 폴더에 보존했다. 방 개설 시 테마를 선택하고 DB에 저장해 모든 참가자에게 같은 풍경을 표시한다. 호텔 배경은 이전 버전 자산으로 남겨 두었다.

### rooftop

최종 자산: `public/lounge/rooftop-v1.webp`

```text
Use case: photorealistic-natural. Website background asset for a real-time voice lounge. Wide 3:2 editorial architectural photo of an intimate rooftop lounge at blue hour overlooking a beautiful softly lit city skyline. Elegant comfortable outdoor sofas in warm linen, small low coffee side tables, warm brass lanterns and discreet string lights, glass balustrade, subtle greenery, midnight indigo sky with hints of dusty violet. Calm open center, natural eye-level perspective, refined inviting atmosphere, believable tactile materials and natural soft light. Designed as a background behind profile cards: no people, no portraits, no UI, no text, logos or watermark. No giant central table, no casino or poker objects. Keep the skyline and rooftop recognizably distinct from an indoor hotel lobby.
```

### river

최종 자산: `public/lounge/river-v1.webp`

```text
Use case: photorealistic-natural. Website background asset for a real-time voice lounge. Wide 3:2 editorial architectural photograph from a calm elegant riverside terrace overlooking the Han River in Seoul at night. Broad water and shimmering city lights, a graceful illuminated bridge in the middle distance, restrained Seoul skyline. Foreground has comfortable lounge seating, small coffee side tables, warm candle lanterns and a glass railing. Rich navy night sky, warm amber foreground and silver-gold reflections. Natural eye-level lens, premium realistic cafe hospitality photo, spacious clear center suitable behind UI profile cards. No people, no portraits, no UI, no text, signs, logos or watermark. No giant central table, no casino or poker objects. The wide river view should be the defining feature.
```

### forest

최종 자산: `public/lounge/forest-v1.webp`

```text
Use case: photorealistic-natural. Website background asset for a real-time voice lounge. Wide 3:2 editorial architectural photograph of a tranquil open-air forest cafe lounge on a wooden deck, surrounded by lush tall trees and a softly misty woodland view. Comfortable natural linen lounge chairs, a few small coffee side tables, warm pendant lanterns under a light wood pergola, gentle late afternoon light through leaves. Deep forest green, honey wood, soft cream, atmospheric depth, tactile real materials and natural eye-level perspective. Welcoming contemporary retreat, spacious calm center for foreground UI profile cards. No people, no faces, no UI, no text, signs, logos or watermark. No giant central table, no casino or poker objects. The living woodland view should be the defining feature.
```

## 호텔 라운지 배경 제작 (이전 버전)

Built-in `imagegen` 사용. 최종 웹 자산: `public/lounge/hotel-lounge-v1.webp` (1536×1024, 약 262KiB). 생성 PNG는 내용 변경 없이 브라우저 WebP 인코더로 압축했다. 사람·UI·게임 테이블이 없는 배경만 생성하며 실제 참가자 사진은 별도 프로필로 표시한다. PNG 원본은 Codex 생성 이미지 폴더에 보존했다.

최종 생성 프롬프트:

```text
Use case: photorealistic-natural. Asset: ambient background photograph for an elegant voice conversation lounge website, not a UI mockup. Wide landscape architectural interior photograph of an intimate boutique hotel cafe lounge at blue hour. Warm amber wall sconces and sculptural pendant lights, walnut wood, soft ivory plaster, tall arched windows with a softly blurred evening garden, comfortable cream and caramel lounge chairs and curved sofas arranged for conversation, a few very small low side tables with coffee cups. Eye-level camera, natural perspective, tactile fabrics and tasteful real materials, premium hospitality editorial photography, quiet inviting atmosphere. Keep a spacious calm center and gently soft focus so foreground profile portraits and interface text can stand out. Warm cocoa, honey, linen and subdued olive accents. No people, no faces, no giant central table, no oval poker or casino table, no gaming paraphernalia, no text, logos, watermark, signs, screens or interface elements. Landscape 3:2 composition.
```
