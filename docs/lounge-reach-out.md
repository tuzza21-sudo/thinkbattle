# 캐릭터가 먼저 연락하기 (2026-11-09)

앱(안드로이드)에서 알림을 켠 이용자에게, 하루 한 번 캐릭터가 한 줄을 먼저 보내는 기능이다. **기본은 꺼져 있다.**

## 정해진 것
- 한 이용자에게 하루 최대 1번(모든 캐릭터 합쳐서, 한국 날짜 기준). 한국 시간 9시~22시 사이에만.
- 알림을 켠 이용자에게만. 이용자는 설정 › 계정 관리 › 알림의 "캐릭터가 먼저 말을 걸어도 좋아요"로 끌 수 있다(기본 켜짐).
- 내용은 캐릭터 말투로 AI가 쓴 한 줄(100자 안팎). 같은 문장이 대화방에 캐릭터의 말로 남고, 알림을 누르면 그 대화방이 열린다.
- 내장 캐릭터의 1:1 대화만(이용자가 만든 캐릭터는 제외).

## 아직 정하지 않은 것: 언제 보내나
캐릭터 성격과 상황에 따라 나중에 정한다. 지금은 모든 캐릭터가 기본 정책을 쓴다: 마지막 메시지 뒤 24시간 이상 지났고, 14일을 넘지 않았고, 이용자가 6번 이상 말한 대화(`src/lib/loungeReachOut.ts`의 `defaultReachOutPolicy`). 캐릭터마다 다르게 하려면 `reachOutPolicies`에 캐릭터 id로 덮어쓴다.

## 켜는 방법
1. Supabase SQL Editor에서 `supabase/migrations/20261214000000_lounge_reach_out.sql` 실행.
2. Vercel 환경변수: `CRON_SECRET`(아무 긴 무작위 문자열), `LOUNGE_REACH_OUT=on`. **`CRON_SECRET`은 기존 하루 1회 이미지 크론(`/api/lounge-images`)도 함께 켠다**(그 크론도 이 값을 요구한다).
3. 크론은 매일 19:00(한국)에 `/api/lounge-reach-out`을 부른다(`vercel.json`). 한 번에 최대 40명.
4. 어떤 이용자에게 갈지 미리 보기: `GET /api/lounge-reach-out?dry=1` (Authorization: Bearer CRON_SECRET).

## 파일
- `api/lounge-reach-out.ts` 크론 처리, `src/lib/loungeReachOut.ts` 규칙과 프롬프트, `src/lib/pushServer.ts` 푸시 보내기.
- 테이블 `lounge_reach_out`(스위치, 마지막으로 보낸 때). 계정을 지우면 함께 지워진다.
