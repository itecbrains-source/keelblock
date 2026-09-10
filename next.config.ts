import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  cacheComponents: true,
  /**
   * F-65. `next dev` serves its own resources — the HMR socket and the dev runtime — only to the
   * origin it advertises, which is `localhost`. It treats `127.0.0.1` as a different origin and
   * refuses them, logging one line the browser never sees:
   *
   *     ⚠ Blocked cross-origin request to Next.js dev resource /_next/hmr from "127.0.0.1"
   *
   * The page still renders, because the HTML is server-rendered and complete. It just never
   * hydrates: no React renderer mounts, and every control that needs JavaScript is inert. Nothing
   * throws, the console shows only a failed WebSocket, and forms keep working because a Server
   * Action form posts natively without JavaScript. So the visible symptom is one dead button, which
   * is exactly how this arrived — "the provider button does not respond to clicks".
   *
   * This is keelblock's problem and not the framework's, because keelblock is what sends people to
   * `127.0.0.1`: `supabase status` prints `http://127.0.0.1:54721`, the OAuth redirect URIs are
   * registered against that host, and the getting-started page uses it throughout. Following our own
   * instructions is what breaks development, so the fix belongs here rather than in a note telling
   * people to type `localhost` instead.
   *
   * Both hosts, deliberately: whichever one a reader ends up on, development works.
   */
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default withNextIntl(nextConfig);
