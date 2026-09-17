import { describe, expect, it } from 'vitest';
import {
  handleEvent,
  type EventDeps,
  type StripeEventLike,
  type SubscriptionStatus,
} from './events';

/**
 * SPEC-007 AC-5 (REQ-5) and AC-3 (REQ-3).
 *
 * Both properties are about refusing to trust a delivery, and both are asserted against a subscriber
 * whose state CHANGES underneath the handler — because a fake that always answers the same thing
 * cannot tell an order-independent handler from an order-dependent one.
 */

/** A world whose subscription status can be moved between deliveries, recording what was written. */
function world(initial: SubscriptionStatus = 'active') {
  const seen = new Set<string>();
  const state = { status: initial };
  const writes: { organizationId: string; status: string }[] = [];
  const processed: string[] = [];
  let reads = 0;

  const deps: EventDeps = {
    claim: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
    readSubscription: async () => {
      reads += 1;
      return { status: state.status, customerId: 'cus_A' };
    },
    findOrganizationByCustomer: async () => 'org-a',
    writeEntitlement: async ({ organizationId, status }) => {
      writes.push({ organizationId, status });
    },
    markProcessed: async (id) => {
      processed.push(id);
    },
  };
  return { deps, state, writes, processed, reads: () => reads };
}

/**
 * A real payload carries a status. **This one carries a WRONG one, on purpose** — `active` while the
 * subscription the fake returns is `canceled`. Any handler that reads the payload writes `active`
 * and fails the assertions below.
 */
const event = (id: string, type = 'customer.subscription.updated'): StripeEventLike => ({
  id,
  type,
  data: { object: { id: 'sub_1', object: 'subscription', status: 'active' } },
});

describe('AC-5 · the same event id delivered twice changes the entitlement once', () => {
  it('a duplicate does nothing at all — not a second write, not a second read', async () => {
    const w = world('active');

    expect(await handleEvent(event('evt_1'), w.deps)).toEqual({
      action: 'applied',
      organizationId: 'org-a',
      status: 'active',
    });
    expect(await handleEvent(event('evt_1'), w.deps)).toEqual({ action: 'duplicate' });

    expect(w.writes).toHaveLength(1);
    // The read matters as much as the write. Claiming FIRST is what makes the whole handler
    // idempotent rather than just its last step, so a duplicate must not even reach Stripe.
    expect(w.reads()).toBe(1);
    expect(w.processed).toEqual(['evt_1']);
  });

  it('MUTATION: a different event id is not a duplicate', async () => {
    // Without this the test above passes against a handler that treats everything as seen.
    const w = world('active');
    await handleEvent(event('evt_1'), w.deps);
    expect(await handleEvent(event('evt_2'), w.deps)).toMatchObject({ action: 'applied' });
    expect(w.writes).toHaveLength(2);
  });
});

describe('AC-3 · two events in reverse order leave the same entitlement as forwards', () => {
  /**
   * The scenario Stripe warns about: a `deleted` generated after an `updated` arrives before it.
   * The subscription's true state at the time of processing is `canceled` in both runs — that is
   * what "the authoritative current state" means — so both orders must end `canceled`.
   */
  const forwards = [event('evt_updated'), event('evt_deleted', 'customer.subscription.deleted')];
  const backwards = [...forwards].reverse();

  it('forwards and backwards end at the same entitlement', async () => {
    const run = async (order: StripeEventLike[]) => {
      const w = world('canceled');
      for (const e of order) await handleEvent(e, w.deps);
      return w.writes.at(-1);
    };

    const a = await run(forwards);
    const b = await run(backwards);
    expect(a).toEqual(b);
    expect(a).toEqual({ organizationId: 'org-a', status: 'canceled' });
  });

  it('the payload contributes the subscription ID and nothing else', async () => {
    // The mechanism, isolated. The event above carries `status: 'active'`; the subscription is
    // `canceled`. A handler that applied the payload would write `active` and would be
    // order-dependent by construction — this is the assertion that catches that, and it catches it
    // in ONE delivery rather than needing two orders to disagree.
    const w = world('canceled');
    await handleEvent(event('evt_1'), w.deps);
    expect(w.writes).toEqual([{ organizationId: 'org-a', status: 'canceled' }]);
  });

  it('a status that moves between deliveries is followed, not remembered', async () => {
    const w = world('active');
    await handleEvent(event('evt_1'), w.deps);
    w.state.status = 'past_due';
    await handleEvent(event('evt_2'), w.deps);
    expect(w.writes.map((x) => x.status)).toEqual(['active', 'past_due']);
  });
});

describe('what the handler declines to do', () => {
  it('records an unrecognised event type and takes no action', async () => {
    const w = world();
    const out = await handleEvent(event('evt_x', 'invoice.payment_succeeded'), w.deps);
    expect(out).toMatchObject({ action: 'ignored' });
    expect(w.writes).toEqual([]);
    expect(w.processed).toEqual(['evt_x']);
  });

  it('an unlinked customer is recorded rather than treated as an error', async () => {
    const w = world();
    const deps = { ...w.deps, findOrganizationByCustomer: async () => null };
    expect(await handleEvent(event('evt_1'), deps)).toEqual({
      action: 'unlinked',
      customerId: 'cus_A',
    });
    expect(w.writes).toEqual([]);
  });

  it('marks processed LAST, so a crash mid-flight leaves work the reconcile can find', async () => {
    const w = world();
    const order: string[] = [];
    const deps: EventDeps = {
      ...w.deps,
      writeEntitlement: async () => {
        order.push('write');
      },
      markProcessed: async () => {
        order.push('mark');
      },
    };
    await handleEvent(event('evt_1'), deps);
    expect(order).toEqual(['write', 'mark']);
  });
});
