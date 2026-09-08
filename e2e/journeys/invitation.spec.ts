import { test, expect } from '../fixtures/auth';
import { signIn } from '../fixtures/auth';
import { OrgsPage, InvitePage } from '../pages';

/**
 * SPEC-006 AC-7 and AC-8 — the two things about invitations that only a browser can prove.
 *
 * The intent suite already establishes what the database does: the token is stored hashed, a spent
 * one is answered exactly like an invented one, a non-admin cannot mint into somebody else's
 * organization. None of that says whether the link a person is actually sent works, or whether
 * losing your membership takes effect before your access token happens to expire — and the second
 * of those is the claim on the battlecard, so it is the one worth executing rather than asserting.
 */
test.describe('invitations', () => {
  test('an invitation is minted, sent, opened by a stranger, and accepted', async ({
    page,
    browser,
    seed,
  }) => {
    const alice = await seed.createUser('alice');
    const bob = await seed.createUser('bob');
    await seed.createOrg(alice, 'Acme');

    // Alice, in her own browser, invites Bob and is shown the link exactly once.
    await signIn(page.context(), alice.email);
    const orgs = new OrgsPage(page);
    await orgs.goto();
    await orgs.invite(bob.email, 'member');

    await expect(orgs.invitationLink()).toBeVisible();
    const link = (await orgs.invitationLink().textContent()) ?? '';
    const token = link.match(/\/invite\/([0-9a-f]{64})/)?.[1];
    expect(token, 'the form printed a usable link').toBeTruthy();

    // A DIFFERENT browser, carrying no session — the state the person opening the email is in.
    const strangerContext = await browser.newContext();
    const stranger = await strangerContext.newPage();
    const invite = new InvitePage(stranger);
    await invite.goto(token!);

    // REQ-2: what a stranger learns is the organization's name and the role offered. Nothing about
    // who else is in it, and nothing that names the tenant to the URL bar beyond the token itself.
    await expect(invite.offer('Acme', 'member')).toBeVisible();
    await expect(invite.accept(), 'no identity yet, so nothing to bind to').toHaveCount(0);

    await signIn(strangerContext, bob.email);
    await invite.goto(token!);
    await invite.accept().click();

    // He lands where a member lands, and the organization is his now.
    const bobOrgs = new OrgsPage(stranger);
    await expect(bobOrgs.membersHeading('Acme')).toBeVisible();

    // REQ-4: the same link, a second time, is answered exactly as an invented one would be.
    await invite.goto(token!);
    await expect(invite.refusal()).toBeVisible();
    await expect(invite.accept()).toHaveCount(0);

    await strangerContext.close();
  });

  /**
   * AC-4 · two people race for one token, and exactly one gets in.
   *
   * A browser cannot stage this and neither can pgTAP, which has one session and therefore no
   * concurrency to speak of. It belongs in this layer because this is the layer with real
   * connections: two clients, one token, `Promise.all`, and the database left to arbitrate.
   *
   * The realistic story is a forwarded link. The guard is that acceptance claims the row with an
   * `update ... where accepted_at is null ... returning`, so the second transaction blocks on the
   * row lock, wakes to find it spent, and matches nothing -- rather than reading first and writing
   * after, which is the same bug in every check-then-act.
   */
  test('two people race for one invitation, and exactly one of them gets in', async ({ seed }) => {
    const alice = await seed.createUser('alice');
    const first = await seed.createUser('first');
    const second = await seed.createUser('second');
    const acme = await seed.createOrg(alice, 'Acme');

    const minted = await alice.client.rpc('invite_member', {
      org: acme,
      invitee_email: first.email,
      invited_role: 'member',
    });
    expect(minted.error).toBeNull();

    const outcomes = await Promise.all([
      first.client.rpc('accept_invitation', { token: minted.data }),
      second.client.rpc('accept_invitation', { token: minted.data }),
    ]);

    expect(
      outcomes.filter((o) => !o.error),
      'exactly one acceptance succeeds',
    ).toHaveLength(1);
    expect(
      outcomes.filter((o) => o.error),
      'the loser is refused, not silently ignored',
    ).toHaveLength(1);

    // And the durable consequence: one new member, not two. Asserted as the owner, under RLS.
    const { data: members } = await alice.client
      .from('organization_member')
      .select('user_id')
      .eq('organization_id', acme);
    expect(members, 'the owner plus exactly one invitee').toHaveLength(2);
  });

  /**
   * THE ONE THAT MATTERS.
   *
   * Bob is signed in and looking at Acme. Alice removes him. He reloads and Acme is gone — not in a
   * minute, not when his access token expires, on his very next request.
   *
   * That is a consequence of where the decision lives. Membership is read from the table inside the
   * policy on every query, so revoking it is a DELETE and the next statement sees it. The common
   * alternative — stamping the organization and role into the JWT at sign-in — is faster and cannot
   * do this: the token is signed, the server does not consult anything to trust it, and a removed
   * member keeps whatever it says until it expires. Supabase's default access token lasts an hour,
   * which is the window this test exists to prove keelblock does not have.
   *
   * It is a browser test rather than a SQL one on purpose. In SQL, "the next request" is a fiction —
   * every statement re-reads the table because there is no session to be stale. The staleness being
   * ruled out only exists once there is a real cookie, a real running server, and a page that was
   * rendered before the change and re-rendered after it.
   */
  test('a member removed while signed in loses access on the next request, not at token expiry', async ({
    page,
    browser,
    seed,
  }) => {
    const alice = await seed.createUser('alice');
    const bob = await seed.createUser('bob');
    const acme = await seed.createOrg(alice, 'Acme');
    await seed.invite(alice, acme, bob, 'member');

    // Bob is in, and looking at it.
    await signIn(page.context(), bob.email);
    const bobOrgs = new OrgsPage(page);
    await bobOrgs.goto();
    await expect(bobOrgs.membersHeading('Acme')).toBeVisible();

    // Alice removes him — through her own screen, as the product does it.
    const aliceContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();
    await signIn(aliceContext, alice.email);
    const aliceOrgs = new OrgsPage(alicePage);
    await aliceOrgs.goto();
    await alicePage.getByRole('button', { name: 'Remove' }).first().click();
    await expect(alicePage.getByText(bob.id)).toHaveCount(0);

    // Bob's session is untouched and still perfectly valid — he is still signed in. What changed is
    // a row, and the row is what the policy reads.
    await page.reload();
    await expect(bobOrgs.membersHeading('Acme')).toHaveCount(0);
    await expect(
      page.getByText('You do not belong to an organization yet.', { exact: false }),
      'the read returns nothing because the policy no longer matches him',
    ).toBeVisible();

    await aliceContext.close();
  });
});
