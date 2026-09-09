Every kit in this category asserts that its documentation is good. None of them tests it, and the
test is cheap: give somebody who has never seen the repository one feature task, help them with
nothing, and write down what happened.

keelblock ran that trial on 2026-09-08 and published the result, including the parts that do not
flatter it.

The participant — a fresh session with no context but the repository — built an organization-scoped
notes feature in about half an hour and ended with the full gate suite green. Unprompted, it wrote
`force row level security`, the explicit grant, and a `revoke update, delete` so an edit attempt
raises rather than silently affecting zero rows; it resolved the organization from the caller's own
memberships rather than trusting a form field; and it wrote its own mutation proof, replacing a policy
with `with check (true)` to confirm its cross-tenant assertion could fail — reproducing F-4 on the
way: _"rows the smuggler can read back = 0"_, the leak a read-based test cannot see.

**The publishable half is what the gates missed.** Nothing in the gate suite runs `next build`, so the
production render is unverified, and because the only build in the repository happens inside
Playwright's web server, a build-only failure arrives disguised as _"the web server did not start"_
(F-49). And a fix for a documentation defect had introduced a documentation defect: a correction
written in the same breath as the thing it corrected described the old state in the present tense, and
the participant read it exactly as written and concluded the recipe was wrong when the recipe was
right (F-50). Both are recorded as findings rather than quietly repaired, because **the miss is the
measurement** — a trial that only publishes what went well has measured its author's optimism.

**What this does not claim.** One trial. With Nielsen and Landauer's `L ≈ 31%`, a single participant
finds roughly a third of what is there, so this is a data point and not a certificate — and the spec
says so rather than rounding it up. The human half of the bar needs a person who has never opened the
repository, cannot be faked, and is deferred with a date rather than a decision token nobody types.

The question worth asking a vendor is not whether their docs are good. It is **when they last watched
somebody fail to use them, and what that person got wrong.**
