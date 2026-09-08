Every kit in this category has an organization switcher. The question worth asking a vendor is what
happens when it is **wrong** — stale in a cookie, forged by hand, or pointing at an organization the
user was removed from ten minutes ago.

In the common design the switcher writes the active organization into the session or the JWT, and
policies read it back. That makes the switcher part of the boundary, and it inherits the boundary's
failure modes. A claim in a token is a photograph of the database taken when the token was issued:
Supabase's own sessions documentation puts access-token lifetime at "usually between 5 minutes and
1 hour", and this repository's `jwt_expiry` is `3600`. **Revoke an admin and they stay an admin
until their token turns over.**

Supabase's own RBAC guide reaches for exactly that pattern — an `authorize()` function reading
`auth.jwt() ->> 'user_role'` — and the research for this spec went looking for the staleness warning
on both that page and the custom-access-token-hook page and **found none on either**. The pattern
reads as the vendor-recommended default and its expiry window is invisible in every example.

keelblock's switcher decides nothing. Policies ask the database, per request, whether the caller is a
member; the selected organization is a filter the application adds — which is what Supabase's own
performance guidance recommends independently, measured there at 171ms → 9ms. So the switcher is
allowed to be wrong, and being wrong is uninteresting.

Executed against the running application with two real accounts:

```
4 · Alice's /orgs shows "Acme": true  ·  shows "Beta": false
5 · Alice with BOB'S organization id in her cookie sees "Beta": false
```

Line 5 is the whole argument. An attacker-controlled value is not a boundary because it was never
asked to be one, and a test asserts the same property at the database: with **no filter at all** — the
case where the application forgot — a two-organization member sees their own two and not the third.
A forgotten filter is a correctness bug here. Elsewhere it is a disclosure.
