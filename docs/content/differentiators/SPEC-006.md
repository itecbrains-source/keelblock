Every kit in this category can invite a teammate. Two questions separate them, and neither is
answered by a screenshot of an invite form.

**The first is what a stranger can reach.** An invitation is the one row in a multi-tenant schema
that somebody outside the tenant must be able to read — they have no account yet, so requiring one to
see who invited them inverts the flow. The usual answer is a policy that admits `anon` and an
application-side filter on the token. That is the same two-step shape the isolation argument turns
on: the row is selected, is in memory, and is in the log if anything logs the query, before anything
decides the caller was entitled to it. keelblock takes the exception in exactly one place, as one
`SECURITY DEFINER` function whose return type is a **named composite of two columns** — the
organization's name and the offered role. Widening it is an `ALTER TYPE` in a migration, which is a
reviewable event, rather than an edit to a `select` list during a refactor. And spent, revoked,
expired and invented tokens all return zero rows from the same call, so the endpoint cannot be used
as an oracle for which guesses were once good.

**The second is how long a removed person keeps their access, and it is the one worth asking a
vendor.** SPEC-005 made the argument: keelblock reads membership from the table inside the policy on
every request rather than stamping it into a token, so revocation lands immediately. Until there was
a membership to revoke, that was an argument.

It is now a test that runs on every push. Bob is signed in and looking at Acme. Alice removes him
through her own screen. Bob reloads and Acme is gone — his session untouched and still perfectly
valid, because what changed is a row, and the row is what the policy reads. The common alternative
cannot do this: a JWT claim is a photograph of the database taken when the token was issued, the
server consults nothing to trust it, and this project's own `jwt_expiry` is `3600`. **Ask how long
their revoked admin stays an admin, and ask to watch.**

That test is mutation-proven, which is the part that makes it evidence rather than decoration:
deleting the removal step makes it fail. A green journey that would also be green if the feature
were absent proves nothing, and this repository has now caught several of its own checks in exactly
that state — including, while this spec was being built, a generated suite that reported coverage of
three tables while one file existed on disk.
