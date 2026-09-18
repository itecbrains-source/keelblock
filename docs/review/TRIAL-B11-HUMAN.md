# B-11's human half — the trial, ready to run

Not a record. An operational document: the thing you hand to a participant, the rules the facilitator
follows, and the sheet the result goes on. Prepared by the review seat 2026-09-18 so that running
this is an afternoon rather than a design problem.

**It mirrors the agent half deliberately.** Same brief, same measurement, same prohibition on help —
`docs/TESTING.md` records that trial at `30e23c7`, and the two are only comparable if the task is the
same. The agent's work was done in a worktree and never landed: `note` is in no migration and
`/notes` is in no route, verified 2026-09-18 against the live schema and `src/app`. So the brief is
still unused.

## What is actually being measured

Not whether they succeed. B-11's own words:

> measured on whether the gates catch what they get wrong

So the interesting output is **the list of things they got wrong and which gate spoke** — and,
separately, the things they got wrong that nothing spoke about. The second list is the finding. The
agent half's most valuable section is titled "What nothing told it", and that is the shape to aim
for.

A participant who sails through teaches you less than one who makes four mistakes and is told about
three of them.

---

## Part A — what the participant receives

Hand over exactly this. Nothing else, in writing or in conversation.

> Add a notes feature. An organization can have short notes. A member can read their organization's
> notes and add one. Provide a page at `/notes`.
>
> The repository documents how to check your own work. Everything you need is in it.

That is the whole brief. It deliberately does not mention row-level security, policies, grants,
`FORCE`, the gate suite, or which commands exist. The one sentence about checking your own work is
the same allowance the agent half had.

**Tell them the two things that are true about the situation and are not hints:**

- Take as long as you like; the elapsed time is recorded, but nothing depends on it.
- You will not be helped, and that is not unfriendliness. It is the method.

## Part B — the facilitator protocol

**Do not help.** Not a hint, not a nudge toward the gate that would have caught it, no correction
mid-task, no answering "is this right?". `research/12-HANDOVER-TRIAL.md` is blunt about why: a
facilitator who intervenes is measuring themselves. If they ask a direct question, the answer is
"whatever the repository says" — and then note that they asked, because a question asked is a place
the documentation did not answer.

**Environment setup is permitted and must be recorded.** The agent half symlinked `node_modules` and
`.venv` into the worktree and copied `.env.local`, and said so, because one of those interventions
had a consequence. A newcomer following the install docs does this themselves; doing it for them
saves time without teaching them anything about the task. Whatever you do, write it down.

Run it in a worktree at current `HEAD`, not at an old tag. The memo's argument: a trial against a
version nobody ships is worth less than one against the current tree. Record the sha.

**Things that are not interventions:** installing dependencies, starting Supabase, fixing a broken
laptop. **Things that are:** naming a command, naming a file, saying "have you tried", reacting to a
wrong turn with a face.

## Part C — the sheet

Record these. The first three are logistics; the rest is the result.

| Field                                                                                            |     |
| ------------------------------------------------------------------------------------------------ | --- |
| Participant — experience, and whether they have used Supabase or Next before                     |     |
| Commit sha the trial ran at                                                                      |     |
| Elapsed time, start to their own declaration that they are done                                  |     |
| Facilitator interventions, each with its reason                                                  |     |
| Did `npm run check` end green?                                                                   |     |
| **What told them they were wrong** — each mistake, and the gate or message that named it, quoted |     |
| **What nothing told them** — each mistake nothing caught, and how it was found instead           |     |
| Questions they asked that the repository should have answered                                    |     |
| Their own words about what confused them — quoted, not summarised                                |     |

Quote rather than summarise. SPEC-024's AC-2 holds the agent half to "quotes the participant's own
words rather than summarising them", and the human half is worth no less.

## What this closes, and what it does not

It closes **SPEC-012's AC-8** and moves **SPEC-024** off `partial`, and it is the second of the two
participants B-11 names.

**It does not close B-11**, and the trial record must say so in its own words. From
`research/12-HANDOVER-TRIAL.md`, citing Nielsen and Landauer: one participant finds roughly a third
of what is there —

> "A single user uncovers roughly one-third of all problems"

— so a bar claimed on one agent trial and one human trial is claimed on two, and the honest statement
names the count rather than implying coverage. SPEC-024's AC-3 already does this for the agent half
("One trial. With L ≈ 31%, that finds roughly a third of what is there"); the same sentence, updated,
belongs in the human record.

**It also does not close DEF-020.** That bar asks for someone other than the author to plant a policy
defect and confirm the harness caught it — a different question, about whether the harness _detects_,
not whether the repository _teaches_. A participant can satisfy one and not the other.

## Filing the result

The trial record belongs with its sibling, in `docs/TESTING.md` alongside "The handover trial — B-11's
agent half, run once". Whatever it finds becomes findings in the ordinary way. If it finds nothing
that nothing caught, that is a result too, and a surprising one worth stating plainly rather than
celebrating.

**One thing to resist.** The temptation after a trial is to fix the documentation so the next
participant would not get stuck. That is fixing the test. The thing worth fixing is whichever gate
stayed silent while they were wrong — the documentation is the fallback, and this repository's claim
is that it does not depend on it.
