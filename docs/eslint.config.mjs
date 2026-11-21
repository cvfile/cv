// ESLint for cvfile.org: the site's scripts and React islands, the API and the build scripts. The repository
// root's config ignores docs/, so this one stands alone. .astro files are checked by `astro check`.
import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'server/dist/**', 'public/**', '.astro/**', '.tmp/**', 'node_modules/**', '**/*.d.ts'],
  },
  {
    files: ['**/*.{ts,tsx,mjs}'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: {
        console: 'readonly', process: 'readonly', document: 'readonly', window: 'readonly', fetch: 'readonly',
        URL: 'readonly', Blob: 'readonly', Event: 'readonly', navigator: 'readonly', setTimeout: 'readonly',
        Buffer: 'readonly', HTMLElement: 'readonly', HTMLInputElement: 'readonly', HTMLButtonElement: 'readonly',
        HTMLTextAreaElement: 'readonly', File: 'readonly', localStorage: 'readonly',
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
    },
  },
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
