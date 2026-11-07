# 컴패니언 대화 구조 변경

2026-11-06. 최신 사용자 결정인 **캐릭터마다 대화방 하나, 채팅 삭제 시 기억·관계 모두 초기화**를 기준으로 구현했다. 여러 방에서 각각 관계를 쌓는 앞선 안은 적용하지 않는다.

## 적용한 동작

- 일반 대화 시작, 시나리오 카드, 커스텀 캐릭터, 재접속은 같은 캐릭터의 기존 대화방을 재사용한다. 긴 대화도 방을 옮기지 않고 턴 번호를 계속 올린다.
- 잠시 나가기·만료 후 재접속은 관계를 지우지 않는다. 채팅 목록의 삭제 버튼은 대화 기록·기억·관계 점수를 삭제한다고 명시한 후 삭제한다. 이어 가는 1:1 채팅은 30일 보존 기간으로 자동 삭제하지 않고(`20261208000100`), 이용자가 삭제하거나 탈퇴할 때까지 대화 기록·기억·관계를 보관한다. 다른 대화방은 이전처럼 정리한다. 개인정보처리방침도 이에 맞게 고쳤다.
- 삭제 후 새 방을 만들면 캐릭터의 초기 관계에서 시작한다. 삭제 전에 시작한 후처리도 이전 방 ID로만 저장하므로 새 관계를 복구하거나 덮어쓰지 못한다.
- 기존 중복 방은 최신 방 하나를 계속 사용할 방으로 지정하고 나머지는 종료된 과거 기록으로 보존한다. 이전 방 URL은 현재 방으로 연결한다. 현재 채팅을 사용자가 삭제하면 해당 캐릭터의 과거 중복 방도 함께 삭제한다. 기존 전역 관계와 기억은 계속 사용할 방에 연결하여 유지한다.
- 시나리오를 바꾸거나 `p_fresh=true`를 보내도 기존 관계를 유지한 채 새 방을 만들지 않는다. 기존 방을 삭제해야 새로 시작할 수 있다. 시나리오가 수정돼도 진행 중인 대화의 출발 설정을 임의로 교체하지 않는다.

## 발화와 기억

공통 첫 단계 규칙의 강제적인 당황·플러팅 거절을 없애고, 성격·말투·반응은 캐릭터 바이블과 고유 단계 지침을 우선한다. 고유 stageRomance가 있으면 공통 로맨스 문장을 덧붙이지 않는다. 가벼운 식사·산책도 관계 단계만으로 일괄 거절하지 않는다. 명시적 거절·동의와 확인된 합의는 유지한다.

Luna 분석기와 연출기를 **한 번의 Luna 호출**로 합쳤다. 하나의 해석에서 요청과 반응 방향을 정하며, 거절·정정은 서버에서도 장난보다 수습을 우선하도록 정리한다. 모델을 바꿔도 같은 분석 구조다. 분석 실패는 원문을 읽는 생성기로 넘어가며 실패 원인을 로그에 남긴다.

최신 발화는 가운데를 자르지 않는다. 현재 채팅 입력 한도인 1,200자를 모두 보존하고, 보조 함수는 최대 8,000자까지 받는다. 최근 16개 메시지를 공통으로 사용하며 오래된 메시지만 축약한다(1:1 채팅은 생성기도 분석기와 같이 600자 초과 시 앞뒤 300자씩). 검색된 장기 기억도 분석기와 생성기가 같은 선택 결과를 사용한다.

기존 요약과 별도로 `state.room_memory`에 다음을 보관한다. (2026-11-06 정리: 합의와 감정의 원인만 새로 기록하고 최대 10개를 둔다. 약속은 장기 기억의 open_thread, 있었던 일은 방 요약이 맡는다. 이전에 저장된 약속·사실 기록은 읽기만 하고 모델에는 보내지 않으며, 마무리된 기록도 보내지 않는다.)

| 종류 | 기록하는 것 |
|---|---|
| agreement | 서로 동의한 말투·호칭·관계 운영 방식 |
| promise | 아직 이행하거나 확인할 약속 |
| feeling | 누구의 감정인지와 서운함 등의 원인 |
| fact | 이 대화에서 확정된 중요한 사건 |

후처리는 최신 대화에서 가져온 원문 근거를 함께 제안한다. 서버는 해당 원문이 실제 발화에 있는지 확인한다. 합의는 양쪽 근거를 요구하고, 한쪽의 제안을 바로 합의로 저장하지 않는다. 변경·해결 상태를 기록하며, 새 말투 합의가 생기면 이전 말투 합의는 종료한다. 현재 말투 합의는 관계 기본값과 turn.speech에도 같은 값으로 전달한다. 근거 원문 검증은 의미 판단 전체를 보장하는 것은 아니므로 모델이 원문을 잘못 해석하는 가능성은 남는다.

이 기억은 분석기·생성기·기록기와 기억 화면에서 사용한다. 다른 방의 이전 세션 요약은 주입하지 않는다. 캐릭터 정체성 자체를 사용자와의 대화 기록으로 재정의하지 않는다.

## 비동기 저장

대사를 보여주는 속도는 유지한다. 대사 INSERT와 같은 DB 트랜잭션에서 후처리 대기 항목을 만든다. 후처리가 완료되면 다음 순서로 적용한다.

1. 해당 방의 가장 오래된 미처리 턴을 고른다. 앞선 턴이 대기 중이면 뒤 턴이 추월하지 않는다.
2. 마지막으로 저장된 관계·장면·기분을 다시 읽고 변경분을 계산한다.
3. 버전이 일치할 때 관계·기분·장면·방 기억·요약·장기 기억 연산과 완료 표시를 한 트랜잭션에서 저장한다.
4. 충돌은 최신 상태로 다시 계산한다. 이미 처리한 턴은 중복 적용하지 않는다.

반복해서 실패하는 턴이 뒤 턴을 영구히 막지 않도록, 후처리 복구나 커밋이 3번 실패하면 그 턴은 적용하지 않은 채 닫고 다음 턴이 진행된다(`fail_voice_lounge_turn`). 닫힌 턴의 관계·기억 변화는 반영되지 않는다.

아직 기록되지 않은 직전 대사는 `pending_turns`로 다음 생성 입력에도 전달한다. 프로세스 종료·모델 오류로 남은 대기 항목은 다음 응답 처리에서 60초 이상 지난 항목부터 Luna로 재시도한다. 응답당 오래된 기록 하나만 복구하며, 별도 상시 작업자는 추가하지 않았다. 새 대화가 없으면 자동 재시도가 계속 도는 구조는 아니다. 원문과 대기 항목은 DB에 남는다.

## 모델과 비용

기본 응답과 분석은 Luna의 reasoning none을 유지한다. 기록기는 기존 Luna low 설정을 유지한다. 보통 빠른 채팅의 호출 수는 분석·연출·생성·기록 4회에서 **통합 판단·생성·기록 3회**가 된다. 입력을 더 충실히 보존하므로 실제 청구 비용 감소율까지 단정하지 않는다. 오래된 기록 복구가 필요할 때는 추가 기록 호출이 발생할 수 있다.

모델 비교 스크립트는 기본 오프라인 실행으로 바꿨다. `--live`를 명시해야 실제 호출하며, 기본 비교 대상은 Luna 하나다. 캡처한 동일한 입력을 각 응답 모델에 재사용하므로 모델 선택에 따라 연출기 유무가 달라지던 혼란을 없앴다. `--room`은 현재 저장 상태의 재사용이며 과거 각 턴 당시 상태의 복원은 아니다.

```powershell
# 외부 모델 호출 없이 합성 장면의 요청 조립 확인
node scripts/lounge-model-compare.mjs model-compare.json --bibles --dry
```

이번 구현 검증에서는 상위 모델에 유료 요청을 보내지 않았다. 실제 대화 품질의 상승 폭은 실측하지 않았으며, 코드·DB·요청 조립 검증과 구분해야 한다.

## reactions 제안

아래는 기존 목록을 **대체할 후보**다. 이번 변경에서 캐릭터별 reactions와 퓨샷을 임의로 교체하거나 이 표를 공통 프롬프트에 추가하지 않았다. 반응 예문을 계속 쌓기보다, 맥락에 따른 판단 원칙 여섯 개 정도로 정리하는 것을 권한다.

| 상황 | 서도현 | 선우령 |
|---|---|---|
| 평범한 질문·취향 | 자신의 생활에서 구체적으로 답한다. 매번 분석이나 반문으로 돌리지 않는다. | 자신의 취향을 확실히 말한다. 모든 질문을 주도권 시험으로 바꾸지 않는다. |
| 농담·떠보기 | 가볍게 받아치되 자신을 증명하려 애쓰지 않는다. 진짜 의심이면 사실부터 답한다. | 여유 있게 되받는다. 실제 불만을 장난으로 무마하거나 굴복을 요구하지 않는다. |
| 호감·칭찬 | 겸손하게 부정하거나 당황하지 않고 여유 있게 받는다. 감정 확정은 지금 사이를 따른다. | 관심이 있으면 숨기지 않고 자신 있게 받는다. 먼저 판을 까는 성격과 실제 동의는 구분한다. |
| 서운함·오해 | 무엇 때문에 서운했는지 받아들이고 구체적으로 바로잡는다. 차분한 자기 확신은 유지한다. | 순간 장난을 거두고 문제에 직접 답한다. 수습 뒤 매번 다시 시험하지 않는다. |
| 부탁·동행·거절 | 현재 일정과 취향으로 판단하고 가능하면 받아들이거나 대안을 낸다. | 원하는 활동이면 주도적으로 받거나 조건을 낸다. 진짜 거절에는 물러나고 탓하지 않는다. |
| 지난 합의·약속 | 합의한 말투와 약속을 지킨다. 작은 말을 실제 행동으로 기억한다. | 가까워진 사실과 자신이 허락한 것을 되돌리지 않는다. 해결된 일을 다시 빚처럼 꺼내지 않는다. |

선우령의 `interpretationLens`도 모든 말을 지배와 시험으로 읽는 대신, **먼저 실제 의도를 읽고 반응에서 여유와 주도성이 드러나게** 바꾸는 것이 이 제안과 맞다. 이 성격 방향 변경은 제안으로 남겼다.

## 적용과 검증

운영 적용에는 `20261208000000_lounge_room_state.sql` 마이그레이션과 앱/API 배포가 함께 필요하다. 이번 작업에서 운영 DB 적용이나 배포는 실행하지 않았다. 과거 중복 방을 보존하는 마이그레이션 정책과 삭제 버튼의 전체 초기화 안내를 운영에서도 확인해야 한다.

검증 경로:

- 일반 lounge 테스트와 새 턴 저장 순수 함수 테스트.
- 실제 API 핸들러 mock 통합 테스트: 합의 기록 → 원자 저장 → 다음 턴 반말 유지.
- 로컬 PGlite SQL 검사: 마이그레이션 재실행, 기존 기록 연결, 방 재사용, 턴 제한 해제, 역순 완료·버전 충돌·중복 방지, 소유자 권한, 삭제·새 시작, 늦은 기록 거부.
- TypeScript 앱/API 검사, Vite 빌드, 변경된 엔진·API·테스트 ESLint.

Windows의 Node 경로 권한 제약이 있으면 `--preserve-symlinks --preserve-symlinks-main` 옵션으로 실행한다. 기존 LoungePage와 lounge.ts의 변경 범위 밖 React/unused lint 경고는 별도로 구분한다.

최종 로컬 실행: 전체 자동 테스트 **314/314 통과**, SQL 검사 통과, TypeScript 검사와 Vite 빌드 완료, 위에 열거한 엔진·API·관련 테스트 ESLint 통과, `git diff --check` 통과. 기존 LoungePage의 React lint 오류 2건과 lounge.ts의 unused/assignment 오류 2건은 이번 변경 범위 밖 코드에 남아 있다. 합성 장면 27개의 오프라인 요청 조립을 확인했다. 유료 모델 품질 비교·운영 DB 적용·배포 결과를 뜻하지 않는다.

## Voice call minutes (2026-11-07)

Members see, and plans allow, **minutes spent in voice calls** (Plus 60 a month, Pro 120), never characters.

- Migration `20261210000000_lounge_call_usage.sql` (apply after `20261209000000_lounge_payments.sql`): `lounge_call_usage`, `tick_lounge_call`, `lounge_call_status`, `lounge_active_plan`, and `admin_list_lounge_usage` (super admin only).
- The call screen sends `call-tick` every 30 seconds while a one-to-one voice call is connected; the database adds the time since the last tick (at most 60 s, nothing after a gap of over 90 s). Check with `node scripts/lounge-call-usage-sql-check.mjs`.
- The limit is on unless `LOUNGE_CALL_LIMITS=off`: past the minutes a call's voice stops (the reply stays text, the chat goes on). Who is held to what (migration `20261210040000_lounge_call_exempt.sql`, `lounge_call_exempt`): a paid plan has its minutes (Plus 60, Pro 120); a member without a plan has `LOUNGE_FREE_CALL_MINUTES` (5) only if they signed up after the migration was first run; the beta testers (`lounge_beta_testers`) have `LOUNGE_TESTER_CALL_MINUTES` (30, `20261210060000_lounge_call_testers_limited.sql`; a tester with a plan has the plan's); the super admin (email and Kakao account) and the earlier members without a plan have none. The super admin's premium voice (ElevenLabs credits) has none either.
- Behind it the premium-voice characters (ElevenLabs credits) stay a cost guard: set `LOUNGE_ELEVEN_MONTHLY_CHARS` high enough (about 40000) that call minutes, not characters, are what ends a member's month, and `LOUNGE_ELEVEN_TOTAL_MONTHLY_CHARS` to the credits bought (for example 850000 of 900000).
- The administrator's list is in 슈퍼 관리자 › 베타: minutes and credits per member, this month or the last.
- The beta's daily allowance (`20261030000000`, 8 minutes) no longer binds one-to-one talks (`20261210050000_lounge_beta_solo_unlimited.sql`: `lounge_beta_left(…, 'solo')` is NULL, no limit): voice is limited by the month's minutes of calls, a chat never was. Rooms with other people keep their daily allowance.
