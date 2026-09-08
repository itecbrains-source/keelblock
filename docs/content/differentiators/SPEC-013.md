Ask a vendor what happens when they fix a security bug and you cloned their kit in March. The two
paid kits in this category answer in their own documentation, and you should read both before
believing anyone's roadmap.

**MakerKit** documents adding an `upstream` remote and running `git pull upstream main`, advising you
to "run this regularly". The page does not mention merge conflicts at all; the only failure it warns
about is forgetting to install dependencies afterwards.

**supastarter** is more honest, and its sentence is the best description of the problem anyone in this
category has published:

> "with every change you make to your application, it will become harder to update your code base,
> because you are essentially rebasing your code on top of the latest supastarter code with Git … If
> you have any merge conflicts, you will have to resolve them manually."

That is a vendor writing down that its upgrade path degrades in proportion to how much you used the
product. It is not a criticism of them — it is the structural problem, admitted, and nobody else in
the field admits it.

**keelblock's answer starts by testing its own.** The strategy was chosen in an ADR that rested on one
empirical claim: a security fix ships as a new migration, and _"new files never conflict — a project
pulls it in and applies it, however much it has diverged."_ The first time a synthetic buyer was
scaffolded at a tag, given their own later migration, and handed a real security fix, the answer was:

```
Found local migration files to be inserted before the last migration on remote database.
```

True about text, false about behaviour, and the ordinary case rather than an edge one — because a
buyer keeps working after they clone, so their migrations are always dated after a fix authored
before that work. The correction is one flag. The reasoning was wrong, it is written down as wrong in
the ADR, and it took ten minutes to find because somebody ran it (F-45).

**What is different is not a command, it is where the boundary lives.** Which files an upgrade may
take is a list in code with a mutation proof that it never takes a path under `src/` — so an upgrade
cannot reach into product code, which is precisely the reach that makes supastarter's warning true.
Two things fall out that no kit's documentation addresses: schema is cumulative and adopted whole
while product code is never touched (the acceptance bar and the ADR contradicted each other on this
until someone satisfied the bar literally — F-46); and a generated artifact **cannot be delivered at
all**, because upstream's copy describes upstream's schema and the buyer has tables upstream has never
heard of.

**What is not yet proven, stated because the rest of this page is only worth reading if this line is
here:** the CI job that scaffolds at the previous tag and runs today's suite against the upgraded
project is written and has not yet had its first green run on the runner. B-10 is **not claimed**
until it does — the spec says `partial` and its AC-8 is open. The experiment above was run by hand,
once, on a synthetic buyer; keelblock has no users and nobody has upgraded anything.
