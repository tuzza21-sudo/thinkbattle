# 검색(SEO)·AI 답변(GEO) 최적화 (2026-11-14)

목표 검색어: **AI 컴패니언, 음성 컴패니언, 음성 채팅, 캐릭터 채팅, AI 전화, AI 통화**. 네이버·구글과 ChatGPT·Claude·Perplexity 같은 AI 검색이 사석을 읽고 인용하게 한다.

## 어떻게 동작하나

사석은 React 단일 페이지 앱이라 스크립트를 실행하지 않는 크롤러(대부분의 AI 크롤러, 네이버 일부 수집)는 빈 화면만 본다. 그래서 빌드할 때 공개 주소마다 **본문이 들어 있는 정적 HTML**을 만든다.

- 글의 원본: `src/lib/seoContent.ts` (키워드 안내 4쪽, 홈 FAQ, 캐릭터 소개). 요금·통화 시간·사진 수는 `loungePlans.ts`에서 읽는다.
- 헤드 태그와 구조화 데이터(JSON-LD): `src/lib/seo.ts`. 브라우저에서는 `applySeo`가, 빌드에서는 `scripts/seo-build.mjs`가 같은 함수를 쓴다.
- 빌드: `npm run build` 끝에 `scripts/prerender-seo.mjs`가 `dist/`에 아래를 쓴다.
  - `dist/<주소>/index.html` 18쪽 (홈 `/lounge`, `/ai-companion`, `/ai-call`, `/voice-chat`, `/character-chat`, 캐릭터 10쪽, 약관·개인정보·계정삭제). 루트 `dist/index.html`도 홈 내용.
  - `sitemap.xml` (캐릭터 사진 포함, 날짜는 빌드한 날), `llms.txt`, `llms-full.txt`
- 사람이 볼 때: 정적 본문은 `.js #seo-static{display:none}`으로 숨겨지고 앱이 그 자리에 뜬다. 키워드 4쪽은 앱 안에서도 `SeoGuidePage`가 같은 글을 보여 준다(`/ai-call` 등 라우트).
- `public/sitemap.xml`은 없앴다(빌드가 만든다). 새 캐릭터를 추가하면 sitemap, llms, 정적 페이지에 자동으로 들어간다(`loungeCharacters` 기준).

## 글을 고칠 때

- 키워드 쪽 문구는 `seoContent.ts`의 `seoGuides`만 고친다. 설명은 110자 이하, 제목은 쪽마다 달라야 한다(테스트가 확인).
- 사실이 바뀌면(요금, 통화 시간, 기능) 함께 고친다. 요금·통화 분·사진 수는 코드에서 읽어 오므로 따로 고칠 필요 없다.
- 캐릭터는 항상 "AI로 만든 가상의 인물"로 쓴다. 구조화 데이터에서도 `Person`으로 표시하지 않는다(테스트가 확인).
- 성인 모드 관련 표현은 검색용 글에 쓰지 않는다. 서비스는 만 18세 이상이라고만 밝힌다.

## 직접 해야 하는 등록 (코드로는 안 됨)

1. **네이버 서치어드바이저** (searchadvisor.naver.com): 사이트 등록 → 소유 확인(HTML 태그 방식이면 `<meta name="naver-site-verification" content="...">`를 알려 주면 `index.html`에 넣는다) → 사이트맵 제출 `https://saseok.kr/sitemap.xml` → 웹페이지 수집 요청으로 `/lounge`, `/ai-call`, `/ai-companion`, `/voice-chat`, `/character-chat` 요청.
2. **구글 서치 콘솔** (search.google.com/search-console): 도메인 또는 URL 접두어 등록 → 사이트맵 제출 → URL 검사에서 색인 생성 요청. HTML 태그 방식이면 `google-site-verification` 메타를 같은 방식으로 넣는다.
3. (선택) 다음(카카오) 웹마스터도구, 빙 웹마스터 도구에 같은 사이트맵을 제출한다.
4. 배포 뒤 확인: `https://saseok.kr/ai-call`을 "소스 보기"로 열어 `<h1>`과 본문이 보이는지, `https://saseok.kr/llms.txt`와 `/sitemap.xml`이 열리는지.

## 한계와 다음 할 일

- 검색 순위는 코드로 정해지지 않는다. 색인에는 며칠~몇 주가 걸린다.
- 콘텐츠가 얇으면 순위가 안 오른다. 키워드 쪽에 실제 대화 예시, 사용 후기(실제 것만), 사용법 스크린샷을 더하는 것이 다음 단계다. 후기·평점 구조화 데이터는 실제 데이터가 있을 때만 넣는다.
- 앱 안의 로그인 화면(대화방, 설정)은 색인되지 않는다. `robots.txt`와 `X-Robots-Tag`로 막혀 있다.
- Vercel에서 `/ai-call`(슬래시 없음)이 `ai-call/index.html`로 열리는지는 배포 후 확인한다.
