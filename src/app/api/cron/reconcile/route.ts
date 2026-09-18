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
      `confirmed ${report.confirmed}, unreadable ${report.unreadable}, ` +
      `stale ${report.measured ? report.stale : 'not measured'}`,
  );

  const body = {
    examined: report.examined,
    corrected: report.corrected,
    confirmed: report.confirmed,
    unreadable: report.unreadable,
    stale: report.stale,
    oldestAgeSeconds: report.oldestAgeSeconds,
    measured: report.measured,
  };

  // **AC-11's alert, and it reuses the only alerting this project has: the scheduler's own.** There
  // is no notification infrastructure here and building one for a single signal would be a second
  // system to keep alive. A non-2xx on a cron invocation is what the platform already reports.
  //
  // `report.stale` is measured BEFORE this pass wrote anything, so it describes how well the
  // PREVIOUS runs did — which is the question REQ-7 asks. A count taken afterwards would be zero by
  // construction.
  //
  // **A non-200 here carries two different meanings, and for alerting both mean LOOK:**
  //   · "I could not run"      — this handler threw, or the platform never invoked it
  //   · "I ran and found stale rows" — the bound in keelblock.billing.json was crossed
  // They are distinguishable in the body and in the log; they are deliberately not distinguishable
  // in the status code, because the action is the same.
  //
  // **What this cannot do, stated rather than left to be discovered: the reconcile cannot detect its
  // own absence.** If the job never runs, nothing counts anything and no status code is returned at
  // all. The platform's "job failed / did not run" notification is what covers that case, which
  // means this non-200 does less work than it looks like.
  if (report.measured && report.stale > 0) {
    return NextResponse.json(
      { ...body, error: 'entitlements past the staleness bound' },
      {
        status: 503,
      },
    );
  }

  return NextResponse.json(body);
}
