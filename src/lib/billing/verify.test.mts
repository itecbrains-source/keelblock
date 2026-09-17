import { describe, expect, it } from 'vitest';
import { signForTest, verifyDelivery } from './verify';

/**
 * SPEC-007 AC-7 (REQ-8): an unsigned and a stale-timestamp request are both refused.
 *
 * The endpoint this protects is the first in the repository that receives unauthenticated external
 * traffic, and the only thing standing between it and anyone on the internet is this function. So
 * the cases are written as attacks rather than as branches: no signature, a forged one, a valid
 * signature for a DIFFERENT body, one made with the wrong secret, and a real signature replayed
 * after its tolerance has passed.
 */

const SECRET = 'whsec_test_0123456789abcdef';
const body = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated', data: {} });

describe('AC-7 · a delivery that cannot prove itself is refused', () => {
  it('accepts a correctly signed body — the control, or every refusal below is vacuous', () => {
    const header = signForTest({ rawBody: body, webhookSecret: SECRET });
    const event = verifyDelivery({ rawBody: body, signatureHeader: header, webhookSecret: SECRET });
    expect(event.id).toBe('evt_1');
    expect(event.type).toBe('customer.subscription.updated');
  });

  it('MUTATION: an unsigned delivery is refused', () => {
    expect(() =>
      verifyDelivery({ rawBody: body, signatureHeader: '', webhookSecret: SECRET }),
    ).toThrow();
  });

  it('MUTATION: a forged signature is refused', () => {
    expect(() =>
      verifyDelivery({
        rawBody: body,
        signatureHeader: `t=${Math.floor(Date.now() / 1000)},v1=deadbeef`,
        webhookSecret: SECRET,
      }),
    ).toThrow();
  });

  it('MUTATION: a STALE delivery is refused even though its signature is valid', () => {
    // The replay case, and the reason a signature alone is not enough: this header is genuinely
    // correct for this body and this secret. What disqualifies it is only its age.
    const hourOld = Math.floor(Date.now() / 1000) - 3600;
    const header = signForTest({ rawBody: body, webhookSecret: SECRET, timestampSeconds: hourOld });

    expect(() =>
      verifyDelivery({
        rawBody: body,
        signatureHeader: header,
        webhookSecret: SECRET,
        toleranceSeconds: 300,
      }),
    ).toThrow();

    // And the same header inside a tolerance that admits it, so the test above is about AGE rather
    // than about the header being malformed.
    expect(
      verifyDelivery({
        rawBody: body,
        signatureHeader: header,
        webhookSecret: SECRET,
        toleranceSeconds: 7200,
      }).id,
    ).toBe('evt_1');
  });

  it('MUTATION: a signature valid for a DIFFERENT body is refused', () => {
    // The shape that survives a naive "does the header parse" check, and the reason the route reads
    // `request.text()` rather than `request.json()`: re-serialising changes the bytes the signature
    // covers, and every delivery would fail for a reason nobody could find.
    const header = signForTest({ rawBody: body, webhookSecret: SECRET });
    const tampered = JSON.stringify({
      id: 'evt_1',
      type: 'customer.subscription.deleted',
      data: {},
    });
    expect(() =>
      verifyDelivery({ rawBody: tampered, signatureHeader: header, webhookSecret: SECRET }),
    ).toThrow();
  });

  it('MUTATION: a signature made with the wrong secret is refused', () => {
    const header = signForTest({ rawBody: body, webhookSecret: 'whsec_somebody_elses_secret' });
    expect(() =>
      verifyDelivery({ rawBody: body, signatureHeader: header, webhookSecret: SECRET }),
    ).toThrow();
  });

  it('every refusal is the same kind, so the endpoint is not an oracle', () => {
    // The route returns one 400 for all of these. If the verifier distinguished them by type a
    // future maintainer could reasonably surface the difference, which would tell a caller who
    // cannot sign which half of the check they failed.
    const attacks = [
      { rawBody: body, signatureHeader: '', webhookSecret: SECRET },
      { rawBody: body, signatureHeader: 't=1,v1=deadbeef', webhookSecret: SECRET },
      {
        rawBody: body,
        signatureHeader: signForTest({ rawBody: body, webhookSecret: 'whsec_other' }),
        webhookSecret: SECRET,
      },
    ];
    const names = attacks.map((a) => {
      try {
        verifyDelivery(a);
        return 'ACCEPTED';
      } catch (e) {
        return (e as Error).constructor.name;
      }
    });
    expect(new Set(names).size, `refusals differed: ${names.join(', ')}`).toBe(1);
    expect(names[0]).not.toBe('ACCEPTED');
  });
});
