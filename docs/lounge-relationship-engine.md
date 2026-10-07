# 캐릭터 관계 엔진 (Character Relationship State Engine)

2026-10-06. 캐릭터 6명(다정한 등대지기 `ina`, 유쾌한 재담꾼 `jaeseok`, 냉정한 검증가, 노련한 협상가, 벨벳 나이프, 능청스러운 트릭스터)과 사용자의 장기 관계를 상태 벡터로 저장하고, 대화 행동에 따라 바꾸며, 응답 말투에 반영한다.

2026-10-07. 활기찬(`sunny`)·발랄한(`dodi`) 진행자를 없애고, 기존 재치형·공감형을 같은 상태 기계로 옮겼다. 6명 모두 1:1 방과 사람끼리 대화하는 방에서 쓸 수 있다.

- **1:1 방(`capacity=1`)**: 관계를 읽고 응답에 반영하며, 이벤트로 점수를 바꿔 저장한다.
- **2명 이상 방**: 관계를 읽지도 쓰지도 않는다. 캐릭터의 `instruction`(그룹용 말투·관점)으로 가볍게 대화를 돕기만 하고 상태는 변하지 않는다. DB 함수 `save_voice_lounge_relationship`도 `capacity=1`이 아니면 저장을 거부한다.

관계가 깊어진다는 의미는 캐릭터마다 다르다.

| 캐릭터 | 관계가 깊어진다는 것 | 고유 지표 | 단계 |
| --- | --- | --- | --- |
| 다정한 등대지기 | 나를 더 정확히 이해한다 | 이해도(attunement), 안전감(emotionalSafety) | 정중한 거리 → 편안한 사이 → 이해받는 느낌 → 속마음을 나누는 사이 → 안전한 쉼터 |
| 유쾌한 재담꾼 | 우리만의 유머가 생긴다 | 케미(chemistry), 익숙함(familiarity) | 친근한 사이 → 말이 통하는 사이 → 호흡이 맞는 사이 → 둘만의 농담이 있는 사이 → 오랜 친구 같은 사이 |
| 냉정한 검증가 | 내 판단을 신뢰한다 | 지적 정직성, 사고의 엄밀함 | 4단계 |
| 노련한 협상가 | 나를 진짜 플레이어로 인정한다 | 협상력, 결단력 | 4단계 |
| 벨벳 나이프 | 나에게 흥미와 존중을 느낀다 | 궁금함, 품위 | 4단계(5번째는 꺼짐) |
| 능청스러운 트릭스터 | 제대로 티키타카가 된다 | 장난기, 회복력 | 4단계 |

재치형은 사람을 즐겁게 하는 유머(Affiliative Humor)이고 트릭스터는 살짝 공격하고 받아치는 유머(Adversarial Banter)라서 이벤트 반응과 말투 지침을 따로 두었다. 공감형은 안심 요구·자기비하·결정 회피·같은 말 반복으로 감점하지 않고, 높은 단계에서 "괜찮다"는 말과 표현이 어긋나 보이면 부드럽게 짚도록 지침을 둔다. 공감형·재치형의 최고 단계 진입 조건은 이상값(공감형 신뢰 90·안전감 95 등, 재치형 케미·익숙함 95 등)의 80~85% 수준으로 잡았다. 턴당 상승 상한 때문에 이상값 자체는 현실적으로 닿기 어렵다.

## 구조

| 층 | 내용 | 위치 | 수명 |
| --- | --- | --- | --- |
| 성격 | `core`, 말투(`companion`), 음성 | `src/lib/relationship/configs/*.ts`, `src/lib/lounge.ts` | 고정 |
| 관계 | 공통 5개(trust·respect·interest·comfort·openness) + 캐릭터 고유 2개, 단계, 기억 | `voice_lounge_relationships` (user_id + character_id) | 장기 |
| 기분 | amusement·irritation·curiosity·excitement·boredom | `voice_lounge_rooms.ai_mood` | 방(세션)마다 초기값에서 시작 |
| 맥락 | 주제, 최근 대화, 방 기억 | 기존 그대로 | 방 |

관계 점수는 평균으로 합치지 않는다. 단계는 캐릭터 설정의 조건식(`enter.min`)으로만 정한다.

## 한 턴의 흐름

1. 브라우저가 기존처럼 `api/lounge` `action=host`를 부른다.
2. API가 방·대화·참가자와 **같은 시점에 병렬로** 사용자의 관계 행을 서비스 키로 읽는다(추가 왕복 없음). 오래 쉬었으면 설정의 감쇠(`decay`)를 적용한다.
3. 기존 모델 호출 **한 번**에 관계 맥락(단계 힌트, 지표 라벨과 점수, 기분 상위 3개, 기억 최대 5개)을 넣고, 출력 스키마에 `events`를 추가한다. 모델은 사용자 직전 발언을 이벤트 코드로 분류만 한다.
4. 응답 문장을 저장하고 음성 합성을 시작하는 동시에, 엔진이 이벤트로 점수를 결정적으로 계산해 `save_voice_lounge_relationship`(서비스 역할 전용, 낙관적 버전)으로 저장한다. 저장 실패는 대화를 막지 않는다.
5. 바뀐 관계는 다음 턴 응답에 반영된다(한 턴 지연).

## 이벤트 → 점수

- 이벤트 33개(`events.ts`). 사양의 26개에 `FLATTERS_CHARACTER`, `DECEIVES_CHARACTER`, `EXPRESSES_DISTRESS`를 더했고, 공감형·재치형을 위해 `SHARES_FEELING`, `CORRECTS_UNDERSTANDING`, `CREATES_RUNNING_JOKE`, `BUILDS_ON_INSIDE_JOKE`를 더했다. 이 네 개는 공통 반응이 비어 있어서 해당 캐릭터 설정이 있는 캐릭터만 점수가 바뀐다.
- 캐릭터 설정의 `events`가 공통 반응(`defaultEventEffects`)을 이벤트 단위로 덮는다. 같은 이벤트라도 캐릭터마다 변화가 다르다.
- 신뢰도 0.6 미만은 버리고, 0.8 미만은 0.7배. 한 턴 최대 3개, 같은 종류 중복 제거.
- 한 턴 상승 상한: trust 4, respect 6, interest 8, comfort 5, openness 4, 고유 지표 6(설정으로 변경). 하락 상한: 보통 6, 강한 사건 12, 심각한 사건 20. 그래서 신뢰는 천천히 오르고 배신 한 번에 크게 떨어진다.
- 반복 감쇠: 최근 3턴 안의 같은 이벤트는 상승분에 1 → 0.6 → 0.2 → 0. 하락분은 줄이지 않는다. 벨벳 나이프는 아부(`FLATTERS_CHARACTER`)에 intrigue가 오히려 내려간다.
- 사용자가 실제로 힘든 상태(`EXPRESSES_DISTRESS`)를 드러낸 턴에는 안심 요구·자기비하·약함 드러내기·결정 회피로 감점하지 않는다.
- 사용자의 새 발언이 없는 턴(화제 요청 등)은 이벤트를 무시한다.

## 단계 전환

- 다음 단계 조건을 **의미 있는 턴(이벤트가 반영된 턴) 3번 연속** 만족해야 승급. 한 번에 한 단계씩.
- 유지선은 진입 조건에서 8점 낮다(hysteresis). 유지선 아래로 3번 연속 내려가야 한 단계 강등.
- 심각한 사건(경계 침범, 명백한 거짓말)은 유지선을 지키는 단계까지 즉시 강등.
- 벨벳 나이프의 ATTACHED는 설정에 정의돼 있지만 `enabled: false`다. 게스트 입장과 나이 확인이 없는 현재 서비스에서 애착 표현을 막기 위해서다.

## 화면과 API

- `api/lounge` `action=relationship`: 방장 본인의 1:1 관계 캐릭터 방에서만 동작. 모두에게 단계 라벨과 지표별 한국어 라벨을, `LOUNGE_RELATIONSHIP_DEBUG_USERS`(이메일 또는 사용자 ID, 쉼표 구분)에 있는 개발자에게만 원점수·기분·최근 이벤트·기억·승급 대기를 준다.
- 방 화면 진행자 이름 아래 `관계 · {단계}` 칩. 펼치면 지표 라벨, 개발자는 숫자와 로그까지 본다.
- 로비 진행자 목록에 6명이 한 목록으로 보인다. 카드에 사진, 이름, 한 줄 분위기, 특징 키워드 3개, 소개 두 줄이 있고(`loungeCharacterProfiles`), 목록 아래에 "혼자 대화에서는 관계가 쌓이고, 여럿이 함께할 때는 바뀌지 않는다"는 안내가 있다. 캐릭터를 골라도 인원이 바뀌지 않는다.
- 사진은 `scripts/generate-lounge-character-portraits.mjs`로 만든 가상 인물이다(`gpt-image-2`, 캐릭터당 1회, 512×512 WebP: `public/lounge/host-{auditor,closer,trickster}-v1.webp, host-velvet-v2.webp`). 음성 예시는 `generate-lounge-host-samples.mjs`로 만든 `public/lounge/host-{id}-v1.mp3`(검증가 `onyx`, 협상가 `ash`, 벨벳 나이프 `sage`, 트릭스터 `fable`, 각 7~8초)이며 카드의 `목소리 듣기` 버튼으로 재생한다. 샘플이 없는 캐릭터는 음성 설명만 보인다.

## 새 캐릭터 추가

1. `src/lib/relationship/configs/<id>.ts`에 설정을 만들고 `index.ts` 목록에 넣는다(`validateRelationshipConfig`가 빈 배열이어야 한다).
2. `src/lib/lounge.ts`의 `loungeHosts`에 진행자 항목(1:1용 `companion`과 그룹용 `instruction` 모두)을 넣고 `loungeRelationshipHostIds`와 `loungeCharacterProfiles`에 ID를 추가한다.
3. 새 마이그레이션에서 `voice_lounge_rooms_host_persona_check`에 ID를 추가한다.

엔진 코드는 수정하지 않는다.

## 적용 순서

1. `20261006000000_voice_lounge_light_moderation.sql` 다음에 `20261006010000_voice_lounge_relationships.sql`, 그다음 `20261007000000_voice_lounge_six_hosts.sql`을 실행한다. 마지막 파일은 `sunny` 방을 `jaeseok`으로, `dodi` 방을 `ina`로 옮기고 6명 모두 인원 제한 없이 쓰도록 제약을 바꾼다.
2. 서버 환경변수 `SUPABASE_SERVICE_ROLE_KEY`가 있어야 관계가 저장된다. 없거나 표를 읽지 못하면 관계 기능만 꺼지고 대화는 그대로 된다.
3. (선택) `LOUNGE_RELATIONSHIP_DEBUG_USERS`에 개발자 이메일을 넣는다.
4. 음성 예시를 다시 만들려면 `node scripts/generate-lounge-host-samples.mjs --host=<id> --overwrite`를 쓴다(유료 TTS 1회). 음성이나 연기 지시를 바꿨다면 샘플도 다시 만들어야 한다. 새 캐릭터는 `loungeHosts`의 `voiceSample` 경로를 채운 뒤 같은 명령으로 만든다.

## 검증

- `npm run test:lounge`: 엔진 단위 테스트 17개(범위, 캐릭터별 변화, 단계 조건, hysteresis, 즉시 강등, 신뢰 비대칭, 반복 감쇠, 기분 분리, 사용자·캐릭터별 독립, 설정만으로 새 캐릭터)와 API 통합 테스트.
- `node scripts/lounge-relationship-sql-check.mjs`: 격리 PostgreSQL에서 1:1 전용 제약, 버전 충돌, 방·사용자·캐릭터 결합, 점수 검증, 서버 전용 권한, 재실행.
- `npm run simulate:relationship` (결정적), `npm run simulate:relationship -- --live` (실제 모델, 유료, TTS·DB 모의). 로그는 `docs/relationship-simulation/`.

실제 실행(52턴)에서 모델 호출과 저장을 합친 시간은 중앙값 3.5초, p90 5.3초, 최대 12.6초였다. 이벤트 출력이 없는 같은 호출과의 비교는 측정하지 않았다.

## 응답 속도 (2026-10-07)

1:1 방은 모델 응답을 스트리밍으로 받고, JSON의 첫 키인 `text`가 닫히는 순간 화면 표시와 음성 합성을 시작한다(`replyTextSoFar`). 기억과 관계 이벤트는 음성이 나오는 동안 이어서 받은 뒤 저장한다. 뒷부분이 잘리면 말한 문장은 저장하고 이전 기억을 유지한다. 그룹 방은 진행 순서 검증 때문에 전체 응답을 받은 뒤 말한다.

실제 모델 5턴(검증가) 측정: 첫 문장 준비 평균 1.76초, 기억까지 전체 완료 평균 2.93초. 턴당 약 1.2초 빨라졌고 기억이 길어질수록 차이가 커진다(`npm run simulate:relationship -- --live --only auditor --turns 5`).

1:1 대기도 줄였다(`loungeSoloTiming`): 말 끝 판단 침묵 2초 → 1.5초, 전사 저장 후 대기 1초 → 0.3초, AI 발화 후 대기 3초 → 1.5초, 확인 주기 0.5초 → 0.25초. 말하는 도중 1.5초 넘게 쉬면 AI가 답할 수 있지만, 사람이 말하면 AI 음성이 멈춘다.

모든 캐릭터의 말하기 속도(`speechSpeed`)를 10% 올렸다. `gpt-4o-mini-tts`는 이 값을 일부만 반영해서, 같은 문장 2회씩 비교해 실제 길이를 확인했다(검증가 -11.8%, 벨벳 나이프 -7.7%). 음성 예시 8개도 새 속도로 다시 만들었다.
