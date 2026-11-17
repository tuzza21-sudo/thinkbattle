# 정하린 프롤로그·시작 배경 변경 — 2026-11-17

사용자가 준 프롤로그의 문구·대사·별표 묘사를 그대로 반영했다. 화면에서 문단을 나누도록 각 문단 사이에는 빈 줄을 두었다. 이야기 ID `teacher-after-the-lecture`는 유지하고 제목은 `퇴근 후, 와인바의 옆자리`로 바꿨다.

이전의 북토크 청중·반론·호텔 라운지 설정은 새 프롤로그와 충돌하므로, 카드 소개·사용자 역할·첫 관계·장소도 퇴근 후 와인바 옆자리에서 우연히 만난 성인 손님으로 맞췄다. 캐릭터의 기본 설정과 관계 점수 규칙은 바꾸지 않았다. 시험용 프롬프트도 별도 복사본 대신 이야기 JSON을 읽는다.

## 배경

`winebar` 배경을 추가해 정하린의 캐릭터 기본 장소와 이야기 시작 배경으로 연결했다. 기존 `hotellobby`와 `cocktailbar`는 유지한다.

- 파일: [public/lounge/wine-bar-night-v1.webp](../public/lounge/wine-bar-night-v1.webp)
- 크기: 1536 × 1024, WebP
- 생성: 기본 제공 `image_gen` 도구. 이미지 생성 스킬의 built-in 모드 사용.
- 내용: 인물 없는 와인바, 낮은 호박빛 조명, 와인 진열장, 나란한 바 의자, 화이트 와인 잔·메뉴·올리브 접시.

최종 생성 프롬프트:

```text
Use case: photorealistic-natural. Create a high quality cinematic photoreal interior background for a Korean character conversation app, landscape 3:2 composition. An intimate atmospheric wine bar at night, viewed from a seated guest's eye level at the polished dark walnut bar counter. Two adjacent empty bar seats suggest a quiet chance conversation. Warm low amber pendant lamps, softly lit wine bottle shelving, a discreet jazz ambience, elegant burgundy upholstery, natural wood and brass. On the bar a slender glass of chilled white wine, an open wine menu with no readable writing, and a small ceramic plate of green olives. Cozy and refined, relaxed after work, realistic texture, warm light and deep soft shadows with enough detail to read as a background behind chat UI. The bar counter should fill the lower third; wine shelves and the intimate room occupy upper two thirds. No people, no human silhouettes, no lettering, no logos, no watermarks. This is only the setting; do not depict the character.
```

## DB 반영

[20261224000000_lounge_teacher_winebar.sql](../supabase/migrations/20261224000000_lounge_teacher_winebar.sql)을 기존 장소 마이그레이션 뒤에 적용한 다음 코드를 배포한다. 이 마이그레이션은 배경 허용 목록과 관련 함수에 `winebar`를 추가하고 새 프롤로그를 같은 이야기 ID에 저장한다. 새로 시작하는 대화에 적용하며 기존 방에 저장된 프롤로그·배경·진행은 변경하지 않는다.

이번 작업에서는 로컬 파일과 마이그레이션을 준비했고 운영 DB 적용이나 배포는 실행하지 않았다.

## 검증

- TypeScript 프로젝트 빌드 통과.
- 캐릭터·배경·장면 전환·사용자 제작 캐릭터 테스트 47개 통과.
- 이야기 파일 검증(dry run) 통과: 프롤로그 593자, 필드 길이 제한 준수.
- 실제 API 핸들러의 오프라인 프롬프트 캡처 통과. 새 이야기 파일로 첫 사용자 응답을 구성한다.
- 격리된 PostgreSQL(PGlite)에서 SQL 실행 통과: 새 테마 허용, 잘못된 테마 거부, 이야기 JSON과 DB 결과 일치, 기존 방·다른 이야기 보존, 함수 보안 설정 보존, 재실행 가능 여부 확인. 운영 DB·대화 모델 호출 없음.

```text
node --preserve-symlinks --preserve-symlinks-main node_modules/typescript/bin/tsc -b
node --preserve-symlinks --preserve-symlinks-main --test scripts/lounge-characters.test.mjs scripts/lounge-spaces.test.mjs scripts/lounge-scene-follow.test.mjs scripts/lounge-custom-characters.test.mjs
node --preserve-symlinks --preserve-symlinks-main scripts/upsert-lounge-story.mjs docs/stories/teacher-after-the-lecture.json
node --preserve-symlinks --preserve-symlinks-main scripts/lounge-teacher-probe.mjs --case=reply-to-prologue
node --preserve-symlinks --preserve-symlinks-main scripts/lounge-teacher-winebar-sql-check.mjs
```

## 이후 변경 (2026-11-17)

- 정하린이 수능 강사에서 성인 영어 튜터로 바뀌어, 프롤로그·카드 소개의 "수능 영어 강사"는 "성인 영어 강사"로 맞췄다(운영 DB는 20261230 마이그레이션이 같은 말을 바꾼다).
- 배포된 코드에 와인바 배경이 없어서 새 대화가 호텔 라운지 배경으로 시작하던 문제를 고쳤다: `winebar` 배경을 코드에 추가하고, 정하린의 배경 목록과 기본 장소를 `winebar`로 바꿨다. 운영 DB에는 이 마이그레이션이 이미 적용돼 있었다.
