import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'supabase/tests/rls/**']),
  {
    // Playwright's fixture API takes a callback whose second argument is named `use`, and the React
    // Hooks rule reads that as a hook called outside a component. It is a browser test, not a
    // component; the rule is switched off exactly here rather than weakened everywhere.
    files: ['e2e/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  // Last, so it switches off every stylistic rule that would argue with Prettier. Formatting is
  // Prettier's job and correctness is ESLint's; a project where both have opinions about quotes
  // spends its review budget on quotes.
  prettier,
]);

export default eslintConfig;
