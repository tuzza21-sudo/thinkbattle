# ThinkBattle

## LiveKit 1:1 음성 토론

토론 개설 화면에서 `사람과 토론`을 선택하면 공유 가능한 LiveKit 방이 생성됩니다.

- 마이크 버튼을 누르는 동안 상대방에게 음성이 실시간 전달됩니다.
- 발언 종료 시 로컬 임시 녹음이 Gemini로 전사됩니다.
- 완성된 전사문과 직접 작성한 텍스트는 LiveKit 데이터 채널로 양쪽 화면에 동기화됩니다.
- 음성 파일은 서버나 스토리지에 저장하지 않습니다.

LiveKit Cloud 프로젝트를 만든 뒤 아래 서버 환경변수를 로컬 `.env.local`과 Vercel 프로젝트에 설정하세요.

```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

기존 Supabase 및 Gemini 환경변수도 필요합니다. 전체 키 목록은 `.env.example`을 참고하세요. `LIVEKIT_API_SECRET`은 절대 `VITE_` 접두사로 노출하지 마세요. 접속 토큰은 로그인 세션을 검증한 `/api/livekit-token` 서버 함수에서만 발급됩니다.

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
