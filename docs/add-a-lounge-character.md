# 라운지 캐릭터 추가하기 · 교체하기

2026-10-26 기준. 캐릭터 하나를 더하는 데 필요한 것은 **명령 한 줄, 문구 채우기, 이미지·목소리 만들기, 테스트**예요. DB에서 직접 실행할 SQL은 없어요(처음 한 번만 아래 "한 번만" 참고).

## 한 번만: 등록 테이블

`supabase/migrations/20261120000000_lounge_character_registry.sql`을 Supabase SQL 편집기에서 한 번 실행해요. 지금까지 캐릭터 8명의 id가 DB 제약 3곳과 함수 5개에 박혀 있어서 새 캐릭터마다 SQL이 필요했는데, 이제는 `lounge_house_characters` 테이블의 한 줄이에요. 실행 전까지는 새 캐릭터를 DB에 등록할 수 없어요(코드는 먼저 써 둘 수 있어요).

## 새 캐릭터

```
node scripts/new-lounge-character.mjs seoyeon --name 윤서연 --job "출판 편집자" --gender female --group challenge --theme cafe --age 36
```

- `id`는 영문 소문자와 숫자 2~24자예요. 한 번 정하면 DB와 링크에 남으니 바꾸지 않아요.
- `--job`은 홈 카드에 나오는 짧은 직업(12자 이내), `--group`은 로비 묶음(`basic`·`challenge`), `--theme`은 1:1 방의 배경 id(`src/lib/lounge.ts`의 `loungeThemes`).
- 스크립트가 아래를 한 번에 만들어요. 여러 파일을 한꺼번에 쓰기 때문에 중간에 실패하면 아무것도 바뀌지 않아요.

| 만드는 것 | 위치 |
| --- | --- |
| 진행자(대화방 역할, 1:1 인물 설명, 목소리 지시, 로비 샘플 문장) | `src/lib/lounge.ts` `loungeHosts` |
| 로비 카드, 배경, 묶음, 목소리 성별 | `src/lib/lounge.ts` (`loungeCharacterProfiles`, `loungeHostThemes`, `loungeHostGroups`, `houseVoiceGender`) |
| 캐릭터 소개 페이지 (살아온 이야기, 성격, 습관, 호감을 얻는·잃는 대화, 선, 다른 캐릭터와의 관계) | `src/lib/loungeCharacters.ts` |
| 관계 설정 (단계 4개, 점수 2개, 반응, 연애 수위, 털어놓는 이야기) | `src/lib/relationship/configs/<id>.ts` + `index.ts` |
| 검색용 사이트맵 줄 | `public/sitemap.xml` |
| 이미지 프롬프트 (대표 사진, 전신, 일하는 모습) | `scripts/lounge-character-prompts.json` |

만들어진 문구는 모두 `TODO(새 캐릭터)`예요. 숫자(점수, 단계 속도)는 이미 테스트를 통과하는 값이라서, 문구부터 쓰고 숫자는 필요할 때만 바꿔요.

## 채워 넣을 것

1. **문구** — `TODO(새 캐릭터)`를 모두 써요. 쓸 때 지킬 것:
   - 1:1 인물 설명(`companion`)에 "사람 자체를 깎아내리지 않는다" 같은 선이 있어야 해요(테스트가 확인해요).
   - 질문으로 끝내지 않고 둘 중 하나를 고르게 하는 질문을 하지 않도록 써요. 인물이 매번 같은 방식으로 끝나는 문제가 이미 한 번 있었어요.
   - 소개 페이지의 `wins`·`losses`는 관계 설정의 반응과 맞아야 해요. 점수가 4 이상 오르는 반응은 모두 소개 페이지에 설명이 있어야 하고, 테스트가 빠진 것을 알려 줘요.
   - 이 캐릭터만의 점수가 필요하면 `configs/<id>.ts`의 `uniqueMetrics`와 단계 조건을 바꿔요(`seoyeon.ts`가 예시).
2. **이미지** — 프롬프트를 `scripts/lounge-character-prompts.json`에 쓴 뒤:
   ```
   node scripts/generate-lounge-character-portraits.mjs --only=<id> --quality=high
   node scripts/generate-lounge-character-full-body.mjs --only=<id> --quality=high
   node scripts/generate-lounge-character-full-body.mjs --set=work --only=<id> --quality=high
   ```
   대표 사진을 먼저 만들고, 눈으로 확인한 뒤 전신·일하는 모습을 만들어요(같은 얼굴로 이어져요). 파일은 `public/lounge/host-<id>-v1.webp` 등이에요.
3. **목소리** — ElevenLabs 라이브러리에서 한국어 목소리를 골라(후보 샘플을 만들어 들어 보세요) `loungeEngineVoices.eleven`에 id를 넣어요. 없으면 성별 기본 목소리가 쓰여요. 그다음:
   ```
   node scripts/generate-lounge-voice-sample.mjs <id> host-<id>-v1.mp3
   ```
   로비 샘플 mp3가 만들어지고 목소리 크기(dBFS)가 나와요. 다른 캐릭터(-18 ~ -23)와 많이 다르면 `loungeEngineLoudness`로 맞춰요.
4. **DB에 등록** — 준비가 끝나면 한 줄이에요. 이미 코드만 만들어 둔 캐릭터는 `node scripts/new-lounge-character.mjs <id> --register-only` (공간도 만들려면 `--space "공간 이름" --theme <배경 id>`)로 등록해요. 처음 만들 때 `--register`를 붙이면 같이 해 줘요. 코드를 올리기 **전에** 등록해 두면 안전해요.
5. **이야기·지식** — 1:1 대화는 이야기에서 시작해요. `lounge_scenarios`에 행을 넣어요(관리자 화면, 또는 `supabase/migrations`에 `INSERT ... ON CONFLICT`를 쓰고 같은 행을 서비스 키로 반영). 프롤로그에서 사용자를 가리킬 때는 "당신"을 써요(닉네임으로 바뀌어요). 캐릭터의 겪은 일·지식은 `docs/lounge-knowledge/<id>.jsonl`을 쓰고 `node scripts/import-lounge-knowledge.mjs docs/lounge-knowledge/<id>.jsonl --apply`.

## 확인

```
npx tsc -p tsconfig.app.json --noEmit
npm run test:lounge
```

테스트가 빠진 것을 이름으로 알려 줘요.
- `every host is fully set up` — 로비 묶음, 카드, 배경, 목소리, 이미지·샘플 파일
- `no character is shipped with the placeholders` — `TODO(새 캐릭터)`가 남아 있으면 실패해요. 반쯤 쓴 캐릭터가 배포되지 않게 하는 안전장치예요.
- 관계 설정 테스트 — 단계가 열리는 속도(대화 12번 안에 둘째 단계 등), 단계별 연애 수위, 털어놓는 이야기

## 있는 캐릭터를 바꿔 넣기 (2026-10-26, 한이나 → 윤서연)

id를 그대로 두면 DB를 바꿀 필요가 없어요. 대신 이전 캐릭터의 기록이 새 캐릭터에게 이어지니, 지울지 정해요. 지우려면 서비스 키로 `voice_lounge_rooms`(`host_persona`), `voice_lounge_relationships`, `voice_lounge_memories`, `lounge_character_knowledge`, `lounge_character_posts`, `lounge_scenarios`(`character_id`)에서 그 id의 행을 삭제해요. 이전 이미지는 파일을 지우고, `docs/ad-agent/assets.json`과 `scripts/lounge-ui-check.mjs`의 이름도 바꿔요.
