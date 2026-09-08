import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'supabase/tests/rls/**']),
  // Last, so it switches off every stylistic rule that would argue with Prettier. Formatting is
  // Prettier's job and correctness is ESLint's; a project where both have opinions about quotes
  // spends its review budget on quotes.
  prettier,
]);

export default eslintConfig;
