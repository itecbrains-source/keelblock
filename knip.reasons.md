# Why each `knip` exemption exists

knip reports genuinely dead code. Every entry below is therefore a **claim that something is not dead
yet**, and each must name what will make it live. An exemption with no expiry is how dead code becomes
permanent while looking supervised.

**This list may only shrink**, and a test asserts it matches `knip.json` exactly.

| Exemption | Why | Removed when |
|---|---|---|
| `src/lib/supabase/**` | The three clients are written and **imported by nothing** — genuinely orphaned by the project's own no-orphan-stubs rule. They are the substrate SPEC-004 (auth) consumes, and deleting them to re-add them next week is churn. Tracked as **DEF-004**, whose trigger fires when SPEC-004 is done. | SPEC-004 wires them |
| `@supabase/ssr`, `@supabase/supabase-js` | Imported only by those clients. Same DEF-004. | SPEC-004 |
| `stripe`, `zod` | Declared ahead of SPEC-007 (billing) and the first validated form. Same class. | SPEC-007 |
| `@testing-library/react`, `@testing-library/jest-dom` | No component tests yet — there are barely any components. Listed individually rather than as a glob: a justification table that matches by wildcard can cover something nobody read. | the first `.dom.test.tsx` |
| `server-only` | A build-time guard, not a runtime import graph knip can trace: it exists to make importing the service-role client from a client component a **build error**. Removing it would silently remove that boundary. | never — it is load-bearing |
| `dotenv` | Used by tooling that reads `.env.local` outside the Next runtime. | — |
| `tailwindcss` | **False positive.** Consumed through `postcss.config.mjs`, which knip does not trace. | knip learns PostCSS configs |
| `psql`, `supabase` (binaries) | Real **system** prerequisites, not npm packages — knip cannot see them. Their absence is now a documented prerequisite, and `check` fails with an actionable message rather than a stack trace. | — |
