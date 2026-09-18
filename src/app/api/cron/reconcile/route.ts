import { NextResponse, type NextRequest } from 'next/server';
import { reconcile } from '@/lib/billing/reconcile';
import { reconcileDeps } from '@/lib/billing/server-only/deps';
import { constantTimeEquals } from '@/lib/billing/constant-time';

/**
 * The scheduled reconcile — SPEC-007 REQ-6, AC-6.
 *
 * The other half of the webhook's pair. REQ-8 returns a `2xx` before doing the work, so a failure
 * inside `after()` is never retried by Stripe — it has already been told the delivery succeeded.
 * Three days of Stripe retries is also three days in which nothing may arrive. This is what closes
 * both gaps, and without it the system is correct only when the network was.
 *
 * **It authorizes with a shared secret, not a session.** There is no user here: the caller is a
 * scheduler. A cron endpoint reachable by anyone is a way to make this application hammer Stripe on
 * demand, so an unauthenticated request is refused before any work happens.
 *
 * Compared with `timingSafeEqual` over fixed-length digests rather than with `===`. A plain string
 * comparison returns as soon as two bytes differ, which leaks the position of the first mismatch to
 * anyone who can measure the response — the shape of attack this project refuses elsewhere by
 * answering every invalid webhook signature identically.
 *
 * **Not on a user's request path**, which is what keeps it inside REQ-2: nothing here answers "is
 * this organization entitled" for a rendered page. It reads what we hold, asks Stripe what is true,
 * and writes. The two `boundaries` allowances this file needs are declared with that reason.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Refuse rather than run unauthenticated. An endpoint that works without its secret is one that
    // will be deployed without it and nobody will notice until it is being used by someone else.
    console.error('reconcile: CRON_SECRET is not set; refusing to run');
    return new NextResponse('not configured', { status: 500 });
  }

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const presented = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!constantTimeEquals(presented, expected)) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const report = await reconcile(reconcileDeps());

  // Logged as well as returned: the scheduler keeps the response, but the log is what a person reads
  // at the moment they are wondering whether reconciliation has been running at all.
  console.info(
    `reconcile: examined ${report.examined}, corrected ${report.corrected}, ` +
      `confirmed ${report.confirmed}, unreadable ${report.unreadable}`,
  );

  return NextResponse.json({
    examined: report.examined,
    corrected: report.corrected,
    confirmed: report.confirmed,
    unreadable: report.unreadable,
  });
}
