**The hard part is not writing tests, it is knowing they can fail.** A passing suite is compatible
with a wrong policy, and that is measured here rather than argued: the leading generated RLS suite
confirmed a **total cross-tenant leak as green**, because it proves enforcement matches declaration
and cannot know intent. Its own documentation says so; the demonstration is what makes the argument.

That is why there are two policy layers rather than one, and why every gate ships a mutation proof —
a test that restores the real defect and asserts the gate goes red. Without that, a green run is
agreement rather than evidence, and this repository has now caught two of its own checks passing
while inspecting nothing.

**The closest thing to a counter-example, named rather than omitted.**
[Basejump](https://github.com/usebasejump/basejump) is free, MIT, Supabase-native, RLS-based, and it
ships a real pgTAP suite — 13 files, **42 `throws_ok` denial assertions** across eight identities,
asserting the exact refusal text for anonymous and cross-user attempts. It even published its test
helpers as a separate package for other projects. Any claim here that began "nobody tests tenant
isolation" would be false, and a reader who knew that would be right to stop reading.

The distinction that survives is narrower and is the one this project is actually built on:
**shipping runnable tests is not publishing a result, and a passing suite is not a suite shown able
to fail.** To learn whether Basejump's isolation holds you clone it, install its helpers, start a
stack and run it — and a green line is what you get: no per-table × command × identity matrix, no
published run, and the string `mutation` appears nowhere in the repository, so nothing establishes
those 42 assertions were ever capable of going red. Its CI runs on pull requests only, so a direct
push to `main` is unverified, and it pins the Supabase CLI at `latest` — the unpinned-generator
problem this repository has a dated deferral for.

Counted from a clone on 2026-09-08, not from a comparison article. The other Supabase-native kit,
[Supajump](https://github.com/supajump/supajump), carries **72 `create policy` statements and zero
tests of any kind** — and no licence file at all, which for a starter kit means the default is all
rights reserved.
