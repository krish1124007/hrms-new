// ESLint flat config for the backend (TypeScript, ESM, Node 22).
//
// `npm run lint` must exit 0. Rules the existing code breaks are set to
// "warn" so new code is nudged without blocking on old code; tighten them to
// "error" once their warnings are gone (`npx eslint src --rule '{"<rule>": "error"}'`
// lists what is left).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // `_name` marks a deliberately unused binding (Express handler args, rest siblings).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // Logs go through config/logger (pino); CLI scripts opt out per file.
      'no-console': 'warn',
      // Sequential awaits are usually deliberate here (ordered writes, no transactions);
      // the warning asks for a second look.
      'no-await-in-loop': 'warn',

      // Existing violations — warnings until cleaned up.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      // Deliberate: file-name sanitisers strip \x00–\x1f.
      'no-control-regex': 'warn',
      'no-useless-escape': 'warn',
    },
  },
);
