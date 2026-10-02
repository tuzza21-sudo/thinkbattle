# 클럽 라운지 메인과 오른쪽 대화 기록 · 2026-10-02

후속 변경에서는 사진을 헤드라인 영역 전체로 펼치고 제목을 “문득 사람과의 대화가 하고 싶은 순간이 찾아올 때...”로 교체했다. 대화방 하단 블러와 프로필 위치도 조정했다. 아래는 최초 변경 기록이며 최신 화면은 [전체 사진 헤드라인과 풍경·대화석 연결](./lounge-full-hero-update.md)을 참고한다.

메인 헤드라인 뒤에는 크림색 여백을 유지한다. 읽기 쉬운 초대 화면에서 더 큰 풍경의 대화방으로 이어지는 흐름을 위해 오른쪽 커피잔·궤도 그래픽을 고급 클럽 라운지 사진으로 교체했다. 우드와 가죽, 부드러운 조명, 저녁 도시 불빛을 사용하고 사진 아래에는 짧은 초대 문구를 둔다.

대화방 풍경의 최소 높이는 PC 370→650px(약 1.76배), 800px 이하 340→590px(약 1.74배), 600px 이하 300→540px(1.8배)로 늘렸다. 참가자 프로필과 사회자 대사는 풍경 아래 대화석에 유지한다.

오른쪽 고정 **대화 기록** 탭이나 상단의 기존 버튼으로 기록 패널을 연다. PC에서는 오른쪽 세로 탭, 모바일에서는 오른쪽 아래 버튼으로 접근한다. 패널은 화면에 고정되고 풍경의 폭과 스크롤 위치를 바꾸지 않는다. 음성 전사, AI 사회자의 발언과 글 대화를 기존 메시지 데이터에서 보여 준다. 현재 실제 방은 기존 조회 제한에 따라 **최근 60개 메시지**를 표시하며 이전 기록 페이지 기능은 추가하지 않았다.

읽기 위해 열면 패널에 키보드 포커스를 두고, 글로 이야기하기는 입력창으로 이동한다. 닫기나 Esc로 접고 열었던 버튼으로 돌아간다. 패널을 접어도 작성 중인 글은 유지하고 새 메시지는 열린 기록 안에서 아래로 스크롤한다. 패널은 비모달 영역이므로 배경 대화 기능을 계속 사용할 수 있다. DB와 음성 연결·과금 경로는 변경하지 않으며 추가 SQL 실행이 필요 없다.

## 확인

프로덕션 빌드와 변경 파일 ESLint를 통과했다. Chrome에서 320·390·768·1024·1440px 및 1~6자리, 여섯 풍경을 확인했다. 오른쪽 탭의 기록 표시, 풍경 폭·스크롤 유지, 화면 안에 들어오는 패널, 키보드 포커스·Esc·초안 유지·반복 글 대화를 검증했다. 미리보기 검사는 유료 API를 호출하지 않았다. 실제 여러 사용자 음성 대화는 이번 디자인 검사에 포함하지 않았다.

[메인 화면](./lounge-club-home-desktop.png) · [PC 기록 패널](./lounge-records-desktop.png) · [모바일 기록 패널](./lounge-records-mobile.png)

## 생성 자산과 전체 프롬프트

기본 제공 `image_gen` 도구로 생성했다. 원본 PNG를 내용이나 해상도 변경 없이 WebP로 인코딩하여 **`public/lounge/lounge-club-hero-v1.webp`**(1536×1024, 306,066바이트)에 저장했다.

```text
Use case: photorealistic-natural. Asset type: landscape editorial photograph for the right side of a premium conversation lounge website hero, 3:2 aspect ratio. Primary request: an elegant intimate members' lounge club where a small group could sit and have a thoughtful conversation. Scene: richly textured warm cognac leather and muted olive velvet lounge chairs arranged around a low round dark walnut table, a refined brass table lamp and soft sculptural pendant lights, a small stack of books, understated greenery, beautiful dark walnut paneling, large windows revealing soft evening city lights. A sophisticated hospitality interior with cinematic depth, warm amber light against deep charcoal and forest tones, refined and welcoming rather than ostentatious. View slightly above seat height, balanced wide composition, foreground seating and depth into the room, premium architectural lifestyle photography, realistic materials and natural light falloff. No people, no faces, no champagne or alcohol props, no coffee cup centerpiece, no text, logos or watermark. The seating arrangement should feel like a private conversation club, quiet and warm, not a nightclub.
```
