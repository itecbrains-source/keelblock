Read the order rather than the code:

```ts
// models/apiKey.ts — fetch by id, unscoped
export const getApiKeyById = async (id: string) =>
  prisma.apiKey.findUnique({ where: { id }, select: { id: true, teamId: true } });

// lib/guards/team-apiKey.ts — then compare, in application code
export const throwIfNoAccessToApiKey = async (apiKeyId: string, teamId: string) => {
  const apiKey = await getApiKeyById(apiKeyId);
  if (teamId !== apiKey.teamId) throw new ApiError(403, '…');
};
```

That is disciplined, readable code. It is also **two steps**, and the order is the whole point: the
row — any tenant's row, by id alone — is in the process, in memory, and in the log if anything logs
the query, before anything decides the caller was not entitled to it. Under row-level security the
row is never selected; the predicate is inside the query plan, and there is no second step to forget.

**This is architecture, not an oversight.** `grep -r "create policy"` across their schema and lib
returns **zero matches**, so application code is the only thing that can refuse. The failure mode is
forgetting, which no amount of care removes and no code review reliably catches on a Friday.
