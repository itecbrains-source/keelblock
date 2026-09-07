import { defineRouting } from 'next-intl/routing';

/**
 * The locale list. **Adding a language is a message file and one entry here** — that is the whole
 * point of paying this cost while the app has one page. Retrofitting the `[locale]` segment later
 * means moving every route and making every internal link locale-aware.
 */
export const routing = defineRouting({
  locales: ['en'],
  defaultLocale: 'en',
  // With one locale, `as-needed` keeps URLs clean: `/settings`, not `/en/settings`. The segment
  // still exists in the tree, so a second locale changes routing config, never file layout.
  localePrefix: 'as-needed',
});
