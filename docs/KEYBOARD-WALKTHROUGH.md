# The keyboard walkthrough — B-7's other half

B-7's evidence is "an automated axe pass in CI **plus a manual keyboard walkthrough per surface**".
The automated half runs on every push (`e2e/journeys/accessibility.spec.ts`). This is the half a
machine cannot do, and memo 17 is why it is the larger half: automation finds roughly **57% of issues
by volume** and only about **20–30% of the success criteria**. Most of what is left is operability,
and operability is a person with a keyboard.

**This file is the protocol and the record.** The protocol is written so running it is thirty minutes
rather than a design problem. Until the record at the bottom is filled in, SPEC-015 AC-5 is `planned`
and B-7 is claimed on its smaller half — which the bar says in its own words rather than rounding up.

---

## Before you start

```bash
supabase start
npm run build && npx next start -p 3000
```

You need a signed-in session and an organization with a project, or three of the six states below
cannot be reached. The fastest honest route is the product's own: sign in at `/en/login` with the
magic link, create an organization, and create a project — which also means the walkthrough begins by
exercising the flow a real person meets.

**Put the mouse away.** Not as a discipline exercise: a pointer used once mid-walk invalidates the
surface it was used on, because the question is whether the keyboard alone is sufficient, and you
cannot un-know that a control exists once you have clicked it.

---

## The six states

Five rendered surfaces, and the invitation page renders two genuinely different pages depending on
whether you have a session. The automated pass scans both for the same reason.

| #   | State                             | How to reach it                                   | What is interactive                                                                                                            |
| --- | --------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `/en` — home                      | open it                                           | a link, a submit button                                                                                                        |
| 2   | `/en/login`                       | open it                                           | email field, submit, any OAuth buttons                                                                                         |
| 3   | `/en/orgs`                        | signed in                                         | org switcher (`select`), member buttons, invite form (input, role `select`, two buttons), create-org form (two inputs, button) |
| 4   | `/en/projects`                    | signed in                                         | name input, create button, the project list                                                                                    |
| 5   | `/en/invite/<token>` — no session | mint an invite, open the link in a private window | the offer text; **no accept button, by design**                                                                                |
| 6   | `/en/invite/<token>` — signed in  | same link, signed in as the invitee               | accept button                                                                                                                  |

## What to do on each state

Five passes. They take a couple of minutes each.

1. **Tab to the end.** Press `Tab` until focus returns to the browser chrome. Write down the order
   you reached things in.
2. **Look at focus the whole way.** At every stop, can you _see_ where you are without hunting?
3. **Try to get stuck.** Anywhere focus will not move on, or moves somewhere invisible, is a trap.
4. **Operate everything.** `Enter` on links and buttons, `Space` on buttons, arrows on the `select`
   elements. Submit each form from the keyboard.
5. **Shift-Tab back.** Reverse order should be the mirror. Somewhere it is not is worth writing down.

## The rules, and the second one is the one people break

**Record, do not fix.** If something is wrong, write it down and keep going. Fixing mid-walk means
the next surface is walked by somebody who has just been thinking about focus rings, and that person
is not the one the bar is about.

**Do not consult the code.** Not while walking. The question is whether the interface is operable,
not whether you can remember what it renders — and you wrote it, which is this walkthrough's main
weakness rather than its strength.

**Write what happened, not what it means.** "Tab skipped the role dropdown and landed on Invite" is
evidence. "Focus order is broken" is a conclusion, and it discards the thing somebody would need to
reproduce it.

---

## The record

**Not yet run.** When it is, replace this paragraph with the table below filled in, set SPEC-015
AC-5's evidence to point here, and flip `SPEC-015` out of `$noDocumentation` in
`docs/content/MANIFEST.json` — the content gate will ask.

| Field                                                             |     |
| ----------------------------------------------------------------- | --- |
| Who walked it, and whether they wrote the interface               |     |
| Commit sha                                                        |     |
| Browser and platform                                              |     |
| Date                                                              |     |
| **Per state: the tab order, written out**                         |     |
| **Per state: anything unreachable by keyboard**                   |     |
| **Per state: anything whose focus was invisible or hard to find** |     |
| **Per state: anything that trapped focus**                        |     |
| **Anything that worked by mouse and not by keyboard**             |     |
| Their own words about anything that felt wrong — quoted           |     |

### What this will and will not close

It closes **SPEC-015 AC-5**, and with it the last open criterion on that spec.

**It does not make B-7 a proven bar on its own.** The walker here wrote the interface, and somebody
who knows where a control is will find it with a keyboard more easily than somebody who does not.
That is a real limit and it belongs in the record rather than in a caveat nobody reads. The version
of this with independence is DEF-024's trial, which is a different question — whether a stranger can
pick the repository up — and a separate person.

**It does not close the axe half's coverage gap either.** Roughly a fifth to a third of success
criteria are machine-checkable; a keyboard walk covers operability, not contrast, not language, not
structure. A surface can pass both halves and still fail a criterion neither looked at. The honest
sentence names the two methods and the gap, which is what B-7 now does.
