**Why a rival cannot simply copy the rule.** Two reasons, and the second is the durable one.

It needs a single named place where authorization happens. An application that authorizes ad hoc in
each route has nothing for a gate to look for — which is why this is a consequence of the
architecture rather than a script anyone can drop in.

And it has to be a **per-action** question. The first version of this rule asked whether the _module_
reached an authorizer. It passed. Then a `signOut` action, which legitimately reads the caller,
landed in the same file as two unauthenticated sign-in actions and made all three look authorized.
The rule had quietly become "does this file contain authorization anywhere", which any growing file
eventually satisfies.

What caught it was one line inside the rule's own test — empty the allowlist, and the gate must still
complain, or it has stopped looking. **A check that cannot fail is indistinguishable from a check
that passes**, and that is the sharpest thing this project has learned about its own machinery.
