// Minimal flat ESLint config for the JS packages' sources. Deliberately not
// type-checked so `turbo run lint` stays fast; type soundness is covered by
// the separate `typecheck` task. Each package runs `eslint .` and resolves
// this root config through ESLint 9's ancestor lookup.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/dist-demo/**', '**/node_modules/**', 'docs/**', '**/*.d.ts'],
  },
  {
    files: ['packages/*/src/**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
  },
);
