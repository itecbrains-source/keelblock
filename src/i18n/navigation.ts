import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware navigation. **Import `Link` from here, never from `next/link`** — that substitution
 * is why adding a second language stays a configuration change instead of an audit of every link in
 * the app.
 *
 * `createNavigation` also returns `redirect`, `usePathname` and `getPathname`. They are deliberately
 * not re-exported until something calls them: an unused export is an orphan by this project's own
 * rule, and `knip` says so out loud. `useRouter` earned its export when SPEC-006's acceptance form
 * needed to send the invitee to `/orgs` after a successful accept -- a locale-aware push, so the
 * user does not lose their language on the one navigation that follows joining an organization.
 */
export const { Link, useRouter } = createNavigation(routing);
