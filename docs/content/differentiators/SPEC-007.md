**This fragment claims less than its siblings, deliberately.** SPEC-001's argument quotes a
competitor's actual code, because somebody read it. **No competitor's billing implementation was
read for this one.** What follows is an argument about two shapes and a measurement of keelblock's,
and it is written that way because a comparison nobody performed is the thing this project exists to
not publish.

Ask a kit where the entitlement is read, and how long a cancellation takes to bite.

There are two shapes. In the first, the entitlement is resolved when the session is created and
carried in the token or the session object; a request checks the claim it is holding. In the second
it is a row, read by a policy, on every request.

The difference is not style, it is a duration — and the duration is measurable. Memo 08 measured it
here: **a Supabase access token lives up to an hour.** Under the first shape that is the window in
which a cancelled customer keeps a paid feature, and — the half that is easier to forget — the window
in which a customer who has just _upgraded_ is refused something they have already paid for. Under
the second there is no window: the next request reads the current row.

```sql
-- supabase/migrations/20260914120000_entitlement.sql
create policy organization_entitlement_select on public.organization_entitlement
  for select to authenticated using (public.is_org_member(organization_id));

grant select on public.organization_entitlement to authenticated;
```

That second line is the part worth stopping on. **There is no write grant at all** — not an
`INSERT` policy that says no, not an `UPDATE` policy that checks a role. An organization cannot write
the row that decides what it may do, so every other guarantee here is not a statement about a value
its subject controls. ADR-006 puts it as a split: Stripe bills, the database entitles.

It is checkable rather than asserted. From the generated access matrix, which is produced by probing
the live catalog as each identity rather than by reading the schema:

| Identity                               | SELECT | INSERT | UPDATE | DELETE |
| -------------------------------------- | ------ | ------ | ------ | ------ |
| Authenticated · different organization | ·      | –      | –      | –      |
| Authenticated · member                 | ✓      | –      | ·      | ·      |

And the test asks the database directly, in the same session and with the same token: flip the status
to `canceled` and the very next read of `is_org_entitled` answers false. Not at token expiry — on the
next request.

One decision inside it is Stripe's rather than keelblock's, and saying so is the point. `past_due`
**entitles**: it is the grace period, the interval in which Stripe is still retrying the card. Their
guidance is to provision on `trialing` and to revoke on `unpaid`, "because payments were already
attempted and retried while `past_due`". A kit that revokes on the first failed charge has invented a
stricter policy than the payment processor recommends and will lock out customers whose card
succeeded on the second attempt.

The map has no default. A status Stripe adds later raises rather than returning `true` or `false`,
because both silent answers are a decision about money and access that nobody made.
