import { describe, expect, it } from 'vitest';
import {
  handleEvent,
  type EventDeps,
  type StripeEventLike,
  type SubscriptionStatus,
  SUBSCRIPTION_EVENTS,
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

/**
 * AC-4 (REQ-4) · the truncated summary is never treated as complete.
 *
 * MEASURED (memo 11, quoting Stripe): the summary event's `entitlements.data` array holds **at most
 * ten**, and a customer with more has the remainder behind `entitlements.url`. A handler that takes
 * the array as the whole set revokes everything past the tenth — expensively, on the biggest
 * customers, while looking like it works.
 *
 * **The property asserted here is stronger than "nothing was revoked".** It is that the array is
 * NEVER READ. A test that only checked the outcome would pass vacuously, because this handler writes
 * nothing for an event type it does not recognise — it would be green for a handler that read the
 * array and happened not to act on it, and green again the day someone made it act. So the payload
 * below records access, and the eleventh entitlement's absence from it is what a naive handler would
 * revoke.
 */
describe('AC-4 · a summary payload of eleven entitlements does not revoke the eleventh', () => {
  /** The eleven a customer actually holds. Stripe will only ever show ten of them. */
  const ELEVEN = Array.from({ length: 11 }, (_, i) => ({
    id: `ent_${i + 1}`,
    lookup_key: `feature_${i + 1}`,
  }));

  /**
   * A real truncated summary: ten entries, `has_more`, and a `url` for the rest. The eleventh is
   * NOT in the payload — that is the whole defect. It cannot be found by reading more carefully.
   *
   * `entitlements` is a getter so that reading it at all is observable. This is the only way to
   * assert "never consulted" rather than "consulted harmlessly".
   */
  function summaryEvent(id = 'evt_summary') {
    let read = false;
    const event: StripeEventLike = {
      id,
      type: 'entitlements.active_entitlement_summary.updated',
      data: {
        object: {
          id: 'cus_A',
          object: 'entitlement_summary',
          customer: 'cus_A',
          get entitlements() {
            read = true;
            return {
              object: 'list',
              data: ELEVEN.slice(0, 10),
              has_more: true,
              url: '/v1/entitlements/active_entitlements?customer=cus_A',
            };
          },
        },
      },
    };
    return { event, wasRead: () => read };
  }

  it('the handler never reads the truncated array at all', async () => {
    const w = world('active');
    const { event: summary, wasRead } = summaryEvent();

    const outcome = await handleEvent(summary, w.deps);

    expect(wasRead(), 'entitlements.data was consulted — REQ-4 says it never is').toBe(false);
    expect(outcome.action).toBe('ignored');
    expect(w.writes, 'nothing was revoked, because nothing was derived from the payload').toEqual(
      [],
    );
  });

  it('the delivery is still RECORDED, so an ignored event is not a lost one', async () => {
    // REQ-5's rule does not stop applying because REQ-4's does. An event the handler declines to act
    // on is still an event that arrived, and the reconcile must be able to see that it was seen.
    const w = world('active');
    const { event: summary } = summaryEvent('evt_summary_1');
    await handleEvent(summary, w.deps);
    expect(w.processed).toEqual(['evt_summary_1']);
  });

  it('MUTATION: a handler that DOES read the array revokes the eleventh — the trap is real', async () => {
    // Not a test of keelblock's handler: a test of the FIXTURE. If the payload above did not
    // actually contain the trap, the assertions above would be green for the wrong reason. This is
    // the naive handler REQ-4 is about, written out, and it loses `feature_11`.
    const { event: summary, wasRead } = summaryEvent();
    const entitlements = (
      summary.data.object as unknown as {
        entitlements: { data: { lookup_key: string }[]; has_more: boolean };
      }
    ).entitlements;

    const granted = new Set(entitlements.data.map((e) => e.lookup_key));

    expect(wasRead(), 'the getter is what makes "never read" observable').toBe(true);
    expect(granted.size, 'Stripe shows at most ten, whatever the customer holds').toBe(10);
    expect(
      granted.has('feature_11'),
      'the eleventh is invisible in the payload — a handler trusting it revokes a paid feature',
    ).toBe(false);
    expect(entitlements.has_more, 'and the only warning is a flag the naive handler ignores').toBe(
      true,
    );
  });

  it('the summary event type is not in the consumed set, and adding it must be deliberate', () => {
    // The decision, pinned. REQ-7 made entitlement a function of subscription status alone, which is
    // what makes the truncation unable to bite. Someone adding this type to SUBSCRIPTION_EVENTS
    // would be reintroducing the trap, and it should cost them a red test rather than nothing.
    expect(SUBSCRIPTION_EVENTS.has('entitlements.active_entitlement_summary.updated')).toBe(false);
    expect([...SUBSCRIPTION_EVENTS].every((t) => t.startsWith('customer.subscription.'))).toBe(
      true,
    );
  });
});
