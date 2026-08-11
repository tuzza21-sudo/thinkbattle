# ThinkBattle

## LiveKit 사람 간 음성 토론

토론 개설 화면에서 `사람과 토론`을 선택하면 공유 가능한 LiveKit 방이 생성됩니다.

- 마이크 버튼을 누르는 동안 상대방에게 음성이 실시간 전달됩니다.
- 발언 종료 시 로컬 임시 녹음이 Gemini로 전사됩니다.
- 음성 모드에서는 전사문을 기본으로 숨기며, 참가자가 `텍스트 보기`를 선택한 경우에만 표시합니다.
- 완성된 전사문은 Supabase에 저장되고 LiveKit 데이터 채널로 동기화되며, 종료 후 토론 기록에서 다시 확인할 수 있습니다.

LiveKit Cloud 프로젝트를 만든 뒤 아래 서버 환경변수를 로컬 `.env.local`과 Vercel 프로젝트에 설정하세요.

```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

기존 Supabase 및 Gemini 환경변수도 필요합니다. 전체 키 목록은 `.env.example`을 참고하세요. `LIVEKIT_API_SECRET`은 절대 `VITE_` 접두사로 노출하지 마세요. 접속 토큰은 로그인 세션을 검증한 `/api/livekit-token` 서버 함수에서만 발급됩니다.

Gemini 프록시는 로그인 토큰과 Supabase 쿼터 RPC를 모두 검증합니다. Vercel에는 `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_ORIGIN`을 서버 환경변수로 설정하세요. `APP_ORIGIN`에는 실제 서비스 주소를 넣고 여러 도메인을 허용할 때는 쉼표로 구분합니다.

기관 전용 주제와 B2C 공개 주제의 조회 권한, 공개 주제 라이브러리, 토론방 브리핑 저장 기능을 배포하려면 기존 B2B/실시간 토론 마이그레이션 다음에 `supabase_topic_visibility_migration.sql`을 Supabase SQL Editor에서 실행하세요.

슈퍼 관리자가 기관 게시판을 개설하고 가입 회원을 소유자로 지정하려면 갱신된 `supabase_super_admin_migration.sql`을 다시 실행하세요. 소유자 이메일은 먼저 ThinkFit 회원가입을 완료한 계정이어야 합니다.

사람 전용 토론과 단계별 담당 배정을 배포하려면 갱신된 `supabase_live_debate_rooms_migration.sql`을 Supabase SQL Editor에서 다시 실행해야 합니다. 이 마이그레이션이 `phase_ids`와 단계 배정 RPC를 추가하고 사람 토론방의 AI 참가를 차단합니다.

마지막으로 `supabase_production_hardening_migration.sql`을 실행하세요. 이 마이그레이션은 AI 사용자별 쿼터, 평가 저장 권한, 대기실 heartbeat, 공개 주제 검토 대기 정책을 적용합니다. 기존에 공개된 사용자 생성 주제는 자동 비공개 처리하지 않으므로 운영자가 한 번 검토해야 합니다.

### 배포 순서

1. 기존 기본·인증·B2B·슈퍼 관리자 마이그레이션 적용
2. 갱신된 `supabase_live_debate_rooms_migration.sql` 적용
3. `supabase_topic_visibility_migration.sql` 적용
4. `supabase_production_hardening_migration.sql` 적용
5. Vercel 환경변수 입력 후 `npm run lint`와 `npm run build` 실행
6. `npm run test:livekit`으로 임시 방 생성·토큰·정리를 확인
7. 서로 다른 두 계정과 두 브라우저로 음성 토론, 전사, 종료 평가, 기록 저장 확인

### 기관 계정 개설

1. 기관 담당자가 ThinkFit에 먼저 회원가입합니다.
2. 슈퍼 관리자가 `/super-admin`에서 기관명과 담당자 이메일을 입력해 기관 게시판을 개설합니다.
3. 담당자에게 `owner` 권한이 자동 부여됩니다. 담당자는 새로고침하거나 다시 로그인한 뒤 메인의 `기관 관리`에서 주제·학생·그룹을 관리할 수 있습니다.
4. 공동 운영자가 필요하면 슈퍼 관리자 화면의 `기존 기관 소유자 추가`에서 가입 이메일을 추가합니다.


`npm run dev`에서도 Vite 개발 미들웨어가 동일한 토큰 함수를 실행하므로 LiveKit 키만 설정하면 바로 두 브라우저에서 테스트할 수 있습니다.

## React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
