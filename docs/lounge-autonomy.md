# 자율형 컴패니언 (Ambient + Goal Planner)

2026-11-13. 브랜치 `feat/autonomous-companion`. **내장 캐릭터 전원** (`jaeseok` `ina` `auditor` `closer` `velvet` `trickster` `diplomat` `shaman` `guide` `poker`).

## 원칙

1. **인챗 체감이 우선** — 매 턴 `turn.life`(core_drive·current_intention)로 삶이 말투·디테일에 스며든다. 화제는 바꾸지 않는다.
2. **컴패니언 우선** — Ambient를 **사건으로** 꺼내는 `self_share`는 대화 정체·근황 질문·활동 종료 때만.
3. **reach-out은 보조** — 침묵 중 목표에 맞는 한 줄 + autonomy tick. 대화 속도에는 거의 영향 없음.

## 계층

| 층 | 저장 | 갱신 |
|---|---|---|
| Core Drive / Persistent Goal | `src/lib/loungeAutonomy.ts` 프로필 (정적) | 설정 변경 시 |
| Current Intention / Ambient / Conversation Intent | `voice_lounge_companion_state.state.autonomy` | reach-out tick, 시드 |
| Initiative stance | 매 턴 코드 (`decideLoungeInitiative`) | 분석 결과 + 게이트 |

## 파일

- `src/lib/loungeAutonomy.ts` — 프로필, 게이트, tick, reach-out 프롬프트 조각
- `src/lib/loungeMessenger.ts` — `state.autonomy`, `turn.initiative`
- `api/lounge.ts` — 턴에 initiative 주입
- `api/lounge-reach-out.ts` — autonomy 입력 + companion_state 갱신
- `scripts/lounge-autonomy.test.mjs`

## 다음

- 다른 캐릭터 프로필 추가
- 유저 복귀 시 오프라인 tick (reach-out 외)
- Ambient EventDeck과 `sceneEvents` 통합 강화
