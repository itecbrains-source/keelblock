Ask a vendor what their accessibility claim covers. The interesting answer is the part they leave
out.

The field ships accessible component libraries, and that is genuinely useful — Base UI and Radix have
done the hard parts of focus management and label association, upstream, once, properly. But **an
accessible primitive says nothing about the page assembled from it.** A correct input inside a form
with no landmark, a dialog opened by a button with no accessible name, a page that never streams its
content — none of those is the library's fault and none of them is caught by choosing it. Of the
public kits examined on 2026-09-18, none runs an automated accessibility pass over its own rendered
surfaces in CI. That says nothing about the paid kits, whose CI is not public.

Adding the tool is an afternoon. It is not the differentiator, and claiming it as one would be the
same overstatement this section is about.

**The differentiator is what the check says about itself.** Three properties, and the third is the
one that costs something:

**The surface list is derived, not typed.** `e2e/journeys/accessibility.spec.ts` walks `src/app` for
rendered routes and compares that to a declared map of how each is reached. A page added tomorrow
fails the suite until somebody says how to visit it — and an entry naming a page that no longer
exists fails too. A hand-written list of URLs is correct on the day it is written and silently
incomplete afterwards, which is precisely how the surface count here grew past its evidence once
already (F-90).

**The scan proves it looked at the page.** Every session-dependent region in this application renders
inside `<Suspense>`, so the shell arrives before the content. The first version of this suite waited
for a heading — which is in the shell — and reported every surface clean while scanning empty pages.
It was caught by planting the same defect twice: an image with no `alt` failed on the static sign-in
page and **passed** on the streamed one, and a rule that fires where markup is static and not where it
streams is being asked about a different document than the one on screen (F-91). Each scan now names
something inside the boundary and refuses to run until it is visible.

**And the bar states its own coverage instead of implying it.** Deque's study, over 13,000+ pages and
nearly 300,000 issues, puts automated testing at roughly **57% of issues by volume** — and Deque are
explicit that this figure was redefined away from the older question, the share of WCAG success
criteria a machine can test at all, **traditionally cited at 20–30%**. Those are different
denominators, and a conformance claim depends on the smaller one.

So "axe-clean" is not written here as "accessible". The keyboard walkthrough is not a courtesy
appended to the automated pass; by that arithmetic it is the majority of the work, and until it has
been performed this bar says so rather than rounding up.

**What this does not claim.** No screen-reader conformance testing — a different method and a cost
nobody here has paid. No Core Web Vitals: they are defined at the 75th percentile of real user data
over a 28-day window, and a project with no users has no such data, so any speed number produced here
is a lab measurement and is labelled as one. The standard itself is moving: EN 301 549 v4.1.1,
published 2 September 2026, adopts WCAG 2.2, and until the European Commission cites it in the
Official Journal the legal reference remains WCAG 2.1 AA — which is what the shipped ruleset targets,
deliberately, with the change waiting on that event rather than on a date somebody guessed.
