**The hard part is not writing tests, it is knowing they can fail.** A passing suite is compatible
with a wrong policy, and that is measured here rather than argued: the leading generated RLS suite
confirmed a **total cross-tenant leak as green**, because it proves enforcement matches declaration
and cannot know intent. Its own documentation says so; the demonstration is what makes the argument.

That is why there are two policy layers rather than one, and why every gate ships a mutation proof —
a test that restores the real defect and asserts the gate goes red. Without that, a green run is
agreement rather than evidence, and this repository has now caught two of its own checks passing
while inspecting nothing.
