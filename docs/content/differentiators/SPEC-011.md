Every kit in this category is a **copy**, so the interesting question is not how fast you get one —
it is what the copy remembers about where it came from. Almost nothing, is the usual answer, and it
is the answer by design.

`degit`, the tool the ecosystem reaches for, sells the forgetting as the feature: it downloads a
tarball _"because you're not downloading the entire git history"_. `create-next-app` initialises a
fresh repository — the documented flag is `--disable-git`, so a new repo is the default — and its
CLI reference contains **no guidance at all** on upgrading a generated project afterwards. That
silence is the category norm: the relationship ends at generation.

keelblock's scaffolder records where the project came from, in a file, naming both the release and the
exact commit, and configures the remote that makes those objects reachable. It does not fetch them —
that would spend the five-minute budget on something a buyer may never use — so the upgrade is two
commands, and the scaffolder prints them.

That is not a design preference. It was **measured**, because the first version would have got it
wrong. Three scaffold shapes were built and asked to take a later release:

| Scaffold                                                  | Result                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| tarball copy with a fresh git repo — the category default | **`fatal: bad object`** — the upgrade path dies on its first command |
| the same copy, plus a remote pointing home                | 52 upstream-owned files taken, migrations applied, 50 left alone     |

The second thing worth asking a vendor is how long "five minutes" takes. Here it is a CI job with a
budget: scaffold, install, and run the full proof suite, and the job fails if it goes over. B-10 —
upgradability — is proven the same way, by a job that scaffolds a synthetic buyer at the previous
release and runs today's suite against them. A number that cannot go red is a slogan.
