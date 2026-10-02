# 비 오는 창가 카페·바다 테라스 추가 · 2026-10-02

메인 화면 순서를 **헤드라인 → 열려 있는 방 목록 → 새 방 만들기**로 변경했다. 헤드라인은 페이지의 h1, 방 목록 제목은 h2로 정리했다.

풍경은 루프탑·한강 야경·숲속·호텔에 **비 오는 창가 카페**와 **바다 테라스**를 더한 총 여섯 가지다. 후속 변경으로 선택 카드는 PC에서 3열, 600px 이하에서는 2열로 배치한다. 방 만들기·미리보기·실제 방·개설된 방 카드에서 공통 테마 정보를 사용한다. 카페는 빗방울 맺힌 창과 따뜻한 조명, 바다는 햇살과 푸른 수평선으로 서로 다른 분위기를 만든다.

## DB 적용

기존 마이그레이션 뒤 `20261002030000_voice_lounge_discovery_and_hotel.sql` → **`20261002040000_voice_lounge_cafe_and_seaside.sql`** 순서로 Supabase SQL Editor에서 전체 내용을 실행한다. 이전 파일을 이미 적용했다면 새 파일만 실행한다. 원격 DB에는 이번 작업에서 적용하지 않았다. 새 파일을 적용하기 전에도 미리보기는 사용할 수 있지만 새 풍경으로 실제 방을 만들 수는 없다.

새 마이그레이션은 여섯 테마의 DB 허용값과 5인자 생성 함수를 갱신한다. 기존 무제한 생성·참가자 등록을 재사용하고, 6인자 생성의 사전 조사·순서 발언 설정을 유지한다. 방 목록 RPC와 테이블 RLS를 변경하지 않는다.

## 생성 이미지

기본 제공 `image_gen` 도구로 새 이미지 두 장을 생성했다. PNG를 내용·해상도 변경 없이 WebP로 변환해 프로젝트 안에 저장했다. 두 자산은 1536×1024다.

- `public/lounge/rainy-cafe-v1.webp` — 448,412바이트
- `public/lounge/seaside-terrace-v1.webp` — 443,876바이트

카페 생성 프롬프트:

```text
Create a photorealistic architectural photograph for a premium, cozy voice conversation lounge website background. Scene: a quiet rainy-day cafe seen from inside at a comfortable seated eye level. Broad floor-to-ceiling dark walnut framed windows reveal a softly blurred leafy urban lane with wet paving and faint warm street lamps. Fine raindrops and thin rain trails clearly visible on the glass, gray blue overcast atmosphere outside. Warm amber pendant lamps and soft natural window light inside, inviting caramel and oatmeal fabric armchairs facing each other, low round walnut coffee tables with two simple ceramic cups, a sofa at one side, books and a few green plants. Tasteful spacious realistic cafe, calm warm interior contrasting with cool rain outside. Wide environmental view with the rainy windows as focal point in the upper and middle portions; beautiful unobstructed atmosphere and no intrusive foreground object. A place to linger and talk naturally. Subtle cinematic color, high-end editorial interior photography, believable scale and materials, fine texture. Landscape 3:2 aspect ratio, 1536x1024. No people, portraits, faces, text, signs, logos or user interface. No dramatic storm, flooding, excessive darkness or fantasy architecture.
```

바다 테라스 생성 프롬프트:

```text
Create a photorealistic architectural photograph for a premium, relaxing voice conversation lounge website background. Scene: a beautiful quiet seaside terrace with a broad uninterrupted ocean view, a gentle turquoise shoreline fading to soft blue at the horizon, late morning soft sunlight and clean airy sky with a few wispy clouds. A real comfortable coastal lounge: pale limestone floor, warm natural rattan lounge sofas and oatmeal cushions placed toward the left and right edges, low round stone tables with simple cups, olive trees and coastal grasses in restrained pots, a lightweight pale linen canopy partly visible overhead at the left, low glass railing with fine slim posts, distant rocky headland at the far edge. Cozy tasteful European coastal cafe feeling, no luxury pool or resort spectacle. Eye-level wide architectural composition, inviting shared seating with generous open space; ocean view and horizon are the main focal area in the upper and middle portions. Warm ivory and sand foreground, beautiful blue sea, natural editorial architecture photography, realistic perspective and material detail. Landscape 3:2 aspect ratio, 1536x1024. No people, portraits, faces, text, signs, logos or user interface. No river, skyscrapers, bridges, swimming pool or busy marina.
```

## 검증

프로덕션 빌드와 변경 파일 ESLint를 통과했다. 로컬 PGlite에서 새 마이그레이션 반복 적용, 기존·신규 여섯 테마의 생성과 회원 조회·목록 표시, 5/6인자 생성 경로, 조사·순서 발언 설정 유지, 잘못된 테마 거절과 익명 생성 차단을 확인했다.

실제 Chrome에서 320~1440px의 메인 화면 순서·여섯 선택지·가로 넘침, 여섯 테마의 데스크톱/모바일 미리보기와 이미지 로드, 기존 선택 전달과 대화 UI 동작을 확인했다. 방 목록은 모의 응답으로 확인했으며 실제 방 생성이나 유료 사회자 API 호출은 하지 않았다.

화면 기록:

- `docs/lounge-lobby-open-rooms-desktop.png` — 헤드라인 아래의 모의 방 목록과 여섯 풍경
- `docs/lounge-rainy-cafe-preview-desktop.png` — 카페 미리보기
- `docs/lounge-seaside-preview-mobile.png` — 바다 테라스 모바일 미리보기
