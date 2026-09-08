import { test, expect } from '../fixtures/auth';
import { signIn } from '../fixtures/auth';
import { OrgsPage } from '../pages';

/**
 * The two-account isolation walk — the product's central claim, performed end to end.
 *
 * It was recorded by hand in SPEC-005 as a verification record, which made it a demonstration
 * rather than a test: true on the day someone ran it and unprotected from that moment on. This is
 * the same walk, executed on every run.
 */
test.describe('two accounts, two organizations', () => {
  test('neither can read the other, and a borrowed organization id changes nothing', async ({
    page,
    seed,
  }) => {
    const alice = await seed.createUser('alice');
    const bob = await seed.createUser('bob');
    const acme = await seed.createOrg(alice, 'Acme');
    const beta = await seed.createOrg(bob, 'Beta');
    await seed.createProject(alice, acme, 'Alice secret plan');
    await seed.createProject(bob, beta, 'Bob secret plan');

    await signIn(page.context(), alice.email);
    const orgs = new OrgsPage(page);
    await orgs.goto();

    // What Alice sees.
    await expect(orgs.membersHeading('Acme')).toBeVisible();
    await expect(page.getByText('Beta')).toHaveCount(0);
    await expect(page.getByText('Bob secret plan')).toHaveCount(0);

    // THE CASE THAT MATTERS. Alice puts Bob's organization id in her own cookie — the exact attack
    // the design makes pointless, because the switcher was never a boundary. She is not a member of
    // Beta, so the resolver falls back to a membership she actually holds.
    await page.context().addCookies([{ name: 'keelblock_org', value: beta, url: page.url() }]);
    await page.reload();

    await expect(orgs.membersHeading('Acme'), 'falls back to her own organization').toBeVisible();
    await expect(page.getByText('Beta')).toHaveCount(0);
    await expect(page.getByText('Bob secret plan')).toHaveCount(0);
  });

  test('a member of two organizations switches between them, and sees one at a time', async ({
    page,
    seed,
  }) => {
    const carol = await seed.createUser('carol');
    const first = await seed.createOrg(carol, 'Northwind');
    const second = await seed.createOrg(carol, 'Southgate');
    await seed.createProject(carol, first, 'Northwind roadmap');
    await seed.createProject(carol, second, 'Southgate roadmap');

    await signIn(page.context(), carol.email);
    const orgs = new OrgsPage(page);
    await orgs.goto();

    await expect(orgs.switcher()).toBeVisible();
    await orgs.switcher().selectOption(second);
    await expect(orgs.membersHeading('Southgate')).toBeVisible();
    await expect(orgs.membersHeading('Northwind')).toHaveCount(0);

    await orgs.switcher().selectOption(first);
    await expect(orgs.membersHeading('Northwind')).toBeVisible();
  });
});
