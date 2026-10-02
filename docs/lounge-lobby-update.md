# 라운지 메인 개편 · 2026-10-02

메인 헤드라인 아래는 실제 개설된 그룹 수다방 목록이다. 주제, AI 호스트, 풍경, 참여 인원과 대기/진행/만석 상태를 표시하고 빈 자리가 있으면 참여 링크를 제공한다. 30초마다, 탭에 다시 돌아올 때, 새로고침을 누를 때 목록을 갱신한다. 예시 방을 실제 목록에 넣지 않는다. 로딩·빈 목록·오류 상태를 따로 표시한다.

방 만들기는 **주제 → AI 호스트 → 풍경** 순서다. ‘요즘 그 이야기’는 ‘여행과 산행 풍경’, ‘취향 밸런스 게임’은 ‘먹거리와 맛집’으로 교체했다. 하단의 초대 링크/방 코드 입력 영역은 삭제했다. 실제 방 안의 링크 복사와 기존 초대 URL 접속은 계속 사용할 수 있다. 여행·먹거리에도 맞는 기본 진행 질문과 미리보기 첫 대화를 사용한다.

루프탑은 강과 다리가 없는 도심 시티 뷰로 교체했다. 호텔 이미지는 만들어져 있었지만 테마 목록과 DB 허용값에 연결되지 않았으므로 이번에 연결했다. 루프탑·한강 야경·숲속·호텔에 비 오는 창가 카페·바다 테라스를 더한 여섯 풍경은 PC에서 3열, 600px 이하에서는 2열 선택 카드로 제공한다. 사회자 사진과 목소리 미리 듣기는 [사회자 스타일 변경 기록](./lounge-host-style-update.md)을 참고한다.

## DB 적용

앞선 `20261002020000_voice_lounge_guided_sessions.sql`까지 적용한 뒤 **`supabase/migrations/20261002030000_voice_lounge_discovery_and_hotel.sql` 전체를 Supabase SQL Editor에서 실행**한다. 원격 DB에는 이번 작업에서 적용하지 않았다. 적용 전에는 실제 방 목록 RPC와 호텔 테마 생성이 동작하지 않는다.

새 `list_open_voice_lounges()`는 로그인 전에도 그룹 방의 목록용 정보만 제공한다. 회원 식별자·프로필·대화 기록·사회자 메모·조사 자료·티켓은 반환하지 않으며 기존 테이블 RLS는 유지한다. 1:1·종료·만료된 방과 방장이 90초 넘게 연결되지 않은 방은 제외한다. 만석은 표시하지만 참여 링크를 제공하지 않는다. 인원은 기존 입장 시 정리 기준에 맞춰 2분 넘게 응답하지 않은 일반 참가자를 제외한다. 대기 중인 방부터 최대 60개를 표시하며 실제 입장 시 서버가 정원과 상태를 다시 검증한다. 기존 방 생성 횟수 제한 해제와 연구·순서 발언 설정을 유지한다.

## 이미지 생성

기본 제공 `image_gen` 도구를 사용해 `public/lounge/rooftop-v1.webp`를 편집했다. 생성 PNG를 내용 변경 없이 WebP로 변환해 **`public/lounge/rooftop-city-v2.webp`**(1536×1024, 약 312KB)에 저장했다. 로그인/가입/프로필 공통 배경도 새 이미지를 사용한다. 호텔은 기존 **`public/lounge/hotel-lounge-v1.webp`**를 사용한다.

실행한 전체 프롬프트:

```text
Edit target: the provided rooftop lounge photograph. Change only the view beyond the glass railing: remove the entire river, water surface, waterfront and suspension bridge, replacing them with a continuous dense metropolitan cityscape of streets and buildings, looking down from a genuinely high rooftop in the heart of the city. Nearby midrise rooftops and illuminated avenues below, taller skyscrapers farther away, rich believable depth. Keep the original cozy lounge seating, cream sofas, circular tables, candle lanterns, warm string lights, plants, pergola, glass railing, terrace flooring, camera angle and blue-hour twilight mood. Premium photorealistic architectural photography, warm amber foreground with blue violet urban skyline. No river, lake, sea, pools or bridges anywhere. No people, text, logos or user interface. Landscape 3:2 aspect ratio.
```

## 검증

로컬 PGlite에서 반복 적용, 호텔 방의 연구·진행형 설정 유지, 로그인 전 목록 조회, 반환 필드 제한, 외부인의 방·회원 조회 차단, 1:1·종료·만료·방장 접속 만료 제외, 오래된 참가자 정리와 만석 표시를 확인했다. 실제 Chrome에서 목록 응답을 모의하여 참여 URL·만석·빈 목록·오류 후 재시도를 확인했고, 320~1440px 화면, 네 배경과 미리보기 선택 전달을 검증했다. 검증용 방 목록은 모의 데이터이며 원격 방이나 유료 AI를 생성하지 않았다.

화면 기록: `docs/lounge-lobby-open-rooms-desktop.png`(모의 목록), `docs/lounge-hotel-preview-desktop.png`(미리보기).

프로덕션 빌드와 이번 변경 파일 ESLint, 모의 API 검사 27개를 통과했다. 전체 ESLint는 이번 변경 밖의 `home-ui-check.tsx`, `scripts/live-session-preview.tsx`, `src/components/SharedReportPage.tsx`에 있는 오류 3개로 실패했다.

**비 오는 창가 카페**와 **바다 테라스**를 추가했다. 새 SQL 적용 순서·생성 프롬프트·검증은 [카페·바다 테라스 추가 기록](./lounge-cafe-seaside-update.md)을 참고한다.
