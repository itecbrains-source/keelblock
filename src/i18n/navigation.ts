import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware navigation. **Import `Link` from here, never from `next/link`** — that substitution
 * is why adding a second language stays a configuration change instead of an audit of every link in
 * the app.
 *
 * `createNavigation` also returns `redirect`, `usePathname`, `useRouter` and `getPathname`. They are
 * deliberately not re-exported until something calls them: an unused export is an orphan by this
 * project's own rule, and `knip` says so out loud.
 */
export const { Link } = createNavigation(routing);
