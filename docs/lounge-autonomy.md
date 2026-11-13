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

## 유저 맞춤 (대화 설정 › 캐릭터 자율)

Kindroid처럼 **이 유저×이 캐릭터만** 성격·Core Drive·장기 목표·Current Intention·Ambient를 직접 고친다.

- UI: `LoungeAutonomySheet` (대화 설정 메뉴)
- RPC: `get_my_lounge_autonomy` / `set_my_lounge_autonomy` (`20261218000000_lounge_autonomy_member.sql`)
- 저장: `voice_lounge_companion_state.state.autonomy.member`
- 멤버가 적은 Intention/Ambient는 reach-out tick이 덮어쓰지 않음
- 프롬프트: `turn.life.personality` 등으로 다음 대사에 반영

로컬 DB에 마이그레이션을 적용해야 설정 저장이 됩니다.

## 파일

- `src/lib/loungeAutonomy.ts` — 프로필, 게이트, tick, member override
- `src/components/LoungeAutonomySheet.tsx` — 설정 UI
- `src/lib/loungeMessenger.ts` — `state.autonomy`, `turn.life` / `turn.initiative`
- `api/lounge.ts` — 턴에 initiative 주입
- `api/lounge-reach-out.ts` — autonomy 입력 + companion_state 갱신
- `scripts/lounge-autonomy.test.mjs`

## 다음

- 다른 캐릭터 프로필 추가
- 유저 복귀 시 오프라인 tick (reach-out 외)
- Ambient EventDeck과 `sceneEvents` 통합 강화
