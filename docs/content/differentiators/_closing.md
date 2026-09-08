## Where keelblock is behind, stated because a battlecard that only wins is marketing

| Axis                  | Field                                       | keelblock                                                           |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------- |
| Feature breadth       | Billing, teams, admin, email, storage, jobs | Tenancy, proofs, gates, auth. The rest is specified, not built.     |
| Frameworks            | Next / Nuxt / SvelteKit / TanStack / Expo   | Next only, by decision — that is what makes completeness affordable |
| Payment providers     | Up to five                                  | Stripe, specified, not yet built                                    |
| Maturity              | Years of production use across many teams   | Days old. One page, one locale, and now a login                     |
| Enterprise SSO / SCIM | Shipped (BoxyHQ, via Jackson)               | Deferred, with a reason: neither can be verified without an IdP     |

**The honest positioning.** If the requirement is a broad kit today, buy one of theirs. keelblock is
for the buyer whose first question is _how do I know a tenant cannot read another tenant's rows_ —
and who has noticed that nobody else answers it with anything they can run.
