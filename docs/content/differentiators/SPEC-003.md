**This is not theoretical, and the receipt is unpleasant.** The first CI run this project ever had
failed on exactly this. An assertion that had been green on every local run went red because the
Postgres image moved from `17.6.1.140` to `17.6.1.167`, and the newer image's default ACL grants
`anon` DML on public tables again.

Row-level security still held — every policy is `to authenticated`, so an `anon` read returned
nothing. What disappeared is the layer _before_ that one, the privilege check, and with it the
property actually claimed: that an unauthenticated role cannot reach a tenant table at all, whatever
any policy happens to say. **Defence in depth is precisely the thing you cannot notice losing.**

The fix from an earlier finding, which was _written down_ rather than inherited, survived the same
image change intact. Same repository, same class of protection, two outcomes, and the only
difference is whether someone stated it.
