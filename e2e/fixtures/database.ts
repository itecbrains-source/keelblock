import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

/**
 * The journey layer owns its data, and cannot be pointed at anything that matters.
 *
 * **Structural because a habit already failed.** The SPEC-005 two-account walk was run by hand
 * against the development stack, left two organizations and fourteen users behind, and broke the
 * policy gate's mutation proof — which counts rows.
 *
 * Three rules, in order of how much they matter:
 *
 *   1. **It refuses to run against anything but a loopback database**, before a single row is
 *      written. The cost of getting that wrong once is somebody's production data, and care is not
 *      a control.
 *
 *   2. **It seeds through the product's own paths, as ordinary users.** The first version of this
 *      reached for `service_role` and was refused `42501` — because `20260908150000` deliberately
 *      revoked everything from it: *"service_role holds NOTHING on tenant tables until something
 *      needs it… a grant to it is a deliberate act tied to a real consumer."* Granting it so a
 *      fixture could seed would arm the most powerful role in the system for a test, which is
 *      precisely what that migration refuses. So the fixture creates auth users — the one thing
 *      service_role legitimately does — and everything after that happens as the user it belongs
 *      to, through the same RPC and the same policies the application uses. The seeding exercises
 *      the product rather than going behind it.
 *
 *   2b. **Nothing is fabricated that the system can derive.** The fixture supplies only what a test
 *      genuinely chooses — how many people, how many organizations, and labels the assertions look
 *      for (a project named "Alice secret plan" exists so its ABSENCE from Bob's page is
 *      meaningful). Everything else is computed by the thing under test: identifiers by the
 *      database, the owner membership row by `create_organization`, the invariants by their
 *      triggers, timestamps by `now()`. No value is invented to stand in for something the product
 *      would work out — which is also why the fixture cannot insert behind the policies: rule 2
 *      makes that impossible, and this is the reason it is a virtue rather than an inconvenience.
 *
 *   3. **Every row it creates is removed**, whatever the test did. Organizations are deleted by
 *      their owner (the only identity a policy permits), which cascades to members and projects
 *      (SPEC-001 REQ-10); the users go last, via the admin API.
 */

const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

export type SeededUser = { id: string; email: string; client: SupabaseClient };

/**
 * The statuses a journey may put an organization into. Deliberately the two ends of REQ-7's map
 * rather than all eight — `007-entitlement.test.sql` owns the totality of the map, and a journey
 * that could set any status would invite a browser test to re-prove what pgTAP already proves
 * against `enum_range`.
 */
export type EntitlementStatus = 'active' | 'canceled';

export type Seeded = {
  runId: string;
  createUser: (label: string) => Promise<SeededUser>;
  createOrg: (owner: SeededUser, name: string) => Promise<string>;
  createProject: (owner: SeededUser, orgId: string, name: string) => Promise<void>;
  entitle: (
    orgId: string,
    status?: EntitlementStatus,
    opts?: { subscriptionId?: string; confirmedSecondsAgo?: number },
  ) => Promise<void>;
  invite: (
    admin: SeededUser,
    orgId: string,
    invitee: SeededUser,
    role: 'owner' | 'admin' | 'member',
    opts?: { accept?: boolean },
  ) => Promise<string>;
  cleanup: () => Promise<void>;
};

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`The journey layer needs ${name}. See .env.example.`);
  return value;
}

function adminClient(): SupabaseClient {
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  if (!LOOPBACK.test(new URL(url).origin)) {
    throw new Error(
      `Refusing to seed ${new URL(url).origin}. The journey layer creates and DELETES users and ` +
        'organizations, and may only ever do that against a loopback database. Testing a deployed ' +
        'environment is a different suite with a fixture that writes nothing.',
    );
  }
  return createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function seeder(): Seeded {
  const admin = adminClient();
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const anon = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const runId = randomUUID().slice(0, 8);
  const users: SeededUser[] = [];
  const orgs: { id: string; owner: SeededUser }[] = [];

  return {
    runId,

    async createUser(label) {
      const email = `e2e-${runId}-${label}@example.test`;
      // A password, used only to obtain a session server-side. NOT because keelblock has password
      // sign-in — it does not — but because the alternative sends mail. MEASURED: seeding with
      // `generateLink` trips the per-address throttle, so a later form sign-in in the same test is
      // refused `429 "you can only request this after 0 seconds"` and no email is ever sent. It
      // took a while to see because the action swallowed that error (F-39).
      const password = `e2e-${randomUUID()}`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error('no user created');

      const client = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // From here the fixture has exactly the authority a signed-in person has, and nothing more.
      const session = await client.auth.signInWithPassword({ email, password });
      if (session.error) throw session.error;

      const user = { id: data.user.id, email, client };
      users.push(user);
      return user;
    },

    async createOrg(owner, name) {
      // The same RPC the Create form calls, with the same authority. It makes the caller an owner
      // atomically, so the fixture cannot produce an organization nobody administers.
      const { data, error } = await owner.client.rpc('create_organization', {
        org_name: name,
        org_slug: `e2e-${runId}-${name.toLowerCase()}`,
      });
      if (error) throw error;
      orgs.push({ id: data, owner });
      return data;
    },

    async createProject(owner, orgId, name) {
      const { error } = await owner.client.from('project').insert({ organization_id: orgId, name });
      if (error) throw error;
    },

    /**
     * Put an organization on a plan, or take it off one — SPEC-007 AC-8.
     *
     * **This is the one seed that cannot go through a product path, and that is the product
     * working.** Rule 2 above says the fixture seeds as an ordinary user; here there is no ordinary
     * user who can. ADR-006's thesis is that Stripe bills and the database entitles, and
     * `007-entitlement.test.sql` asserts the consequence directly: a member cannot INSERT, UPDATE or
     * DELETE their own entitlement row, refused at the GRANT before any policy is consulted. An
     * organization that could write this row would be granting itself a plan. So a fixture that
     * could seed it as a user would be evidence that the spec's central claim is false.
     *
     * It therefore stands in for STRIPE, exactly as `invite` stands in for the email keelblock does
     * not send. Same category, same justification.
     *
     * **Not through `service_role`, and this is the part worth being explicit about.** The obvious
     * move is to grant the admin client a write here — and F-81 is the record of what that costs.
     * `service_role` holds nothing on any tenant table by deliberate policy (20260908150000), and a
     * single premature grant made it a probed identity on every tenant table, returning five suites'
     * worth of `UNRELIABLE` because a `BYPASSRLS` role cannot demonstrate that a policy works.
     * Arming the most powerful role in the system so a browser test could seed a row is precisely
     * what that migration refuses. The grant it is waiting for lands with the webhook handler that
     * needs it (AC-6), not with this.
     *
     * So it connects as the database owner, which is the only role holding a write here, and it does
     * that over the same loopback-only guarantee as everything else in this file. `psql` is already a
     * declared prerequisite of this repository (`REQUIRED_BINARIES`), so this adds no dependency.
     *
     * The values are passed as psql variables and interpolated with `:'name'`, which quotes them as
     * literals rather than splicing them into the statement text.
     */
    /**
     * `opts.subscriptionId` links the row to a subscription, which is what makes it visible to
     * `entitlements_to_reconcile` — that function returns only rows naming one. `confirmedSecondsAgo`
     * back-dates `entitlement_synced_at`, which is the only way to exercise REQ-7's bound without
     * waiting six hours for it.
     */
    async entitle(orgId, status = 'active', opts = {}) {
      const dbUrl =
        process.env.KEELBLOCK_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54722/postgres';
      const host = new URL(dbUrl).hostname;
      if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
        throw new Error(
          `Refusing to write an entitlement to ${host}. This fixture stands in for Stripe and ` +
            'writes as the database owner; it may only ever do that against a loopback database.',
        );
      }
      // Fed on STDIN rather than with `-c`. MEASURED: psql performs variable interpolation for
      // input read from a file or standard input and NOT for a `-c` command string, which fails as
      // `syntax error at or near ":"`. Since the quoting is the whole reason the variables are
      // used, the delivery mechanism is not interchangeable.
      execFileSync(
        'psql',
        [
          dbUrl,
          '-q',
          '-v',
          'ON_ERROR_STOP=1',
          '-v',
          `org=${orgId}`,
          '-v',
          `st=${status}`,
          '-v',
          `sub=${opts.subscriptionId ?? ''}`,
          '-v',
          `age=${Math.max(0, Math.floor(opts.confirmedSecondsAgo ?? 0))}`,
          '-f',
          '-',
        ],
        {
          input: `insert into public.organization_entitlement
                    (organization_id, status, stripe_customer_id, stripe_subscription_id,
                     entitlement_synced_at)
                  values (:'org', :'st', 'cus_e2e', nullif(:'sub', ''),
                          now() - (:'age' || ' seconds')::interval)
                  on conflict (organization_id) do update
                    set status = excluded.status,
                        stripe_subscription_id = excluded.stripe_subscription_id,
                        entitlement_synced_at = excluded.entitlement_synced_at;`,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
    },

    /**
     * An invitation, minted and accepted through the same two functions the screens call. The token
     * is returned because the fixture is standing in for the email keelblock does not send -- it is
     * never read back out of the table, which holds only a hash (SPEC-006 REQ-3), so there is no
     * back door here that the product does not have.
     */
    /**
     * `opts.accept` defaults to true because every existing caller wants a member at the end of it.
     * Passing false leaves the invitation UNSPENT, which is the only state in which
     * `/invite/[token]` renders its offer — an accepted token renders a refusal instead, and
     * scanning that would be scanning a different surface than the one B-7 names.
     */
    async invite(adminUser, orgId, invitee, role, opts = {}) {
      const minted = await adminUser.client.rpc('invite_member', {
        org: orgId,
        invitee_email: invitee.email,
        invited_role: role,
      });
      if (minted.error) throw minted.error;
      if (opts.accept !== false) {
        const accepted = await invitee.client.rpc('accept_invitation', { token: minted.data });
        if (accepted.error) throw accepted.error;
      }
      return minted.data as string;
    },

    async cleanup() {
      // As the owner: `organization_delete` permits nobody else, and the cascade takes members and
      // projects with it. Deleting only the user would leave an organization nobody can administer
      // — the orphan F-10 is about.
      for (const { id, owner } of orgs) {
        const { error } = await owner.client.from('organization').delete().eq('id', id);
        if (error)
          throw new Error(`journey cleanup failed for organization ${id}: ${error.message}`);
      }
      for (const u of users) await admin.auth.admin.deleteUser(u.id);
      orgs.length = 0;
      users.length = 0;
    },
  };
}
