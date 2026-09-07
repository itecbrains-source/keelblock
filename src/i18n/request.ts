import * as rootParams from 'next/root-params';
import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { routing } from './routing';

/**
 * Reads the locale from the route's own `[locale]` segment via `next/root-params`, not from request
 * headers.
 *
 * That distinction is the reason this works under Cache Components: the URL segment is statically
 * known at prerender time, whereas a header is runtime data and blocks prerendering — the same rule
 * ADR-004 records for cookies. `setRequestLocale` is the deprecated predecessor of this.
 */
export default getRequestConfig(async () => {
  const value = await rootParams.locale();
  if (!hasLocale(routing.locales, value)) notFound();

  return {
    locale: value,
    messages: (await import(`../../messages/${value}.json`)).default,
  };
});
