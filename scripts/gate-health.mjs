/**
 * The rule behind the meta-gate, as a parser rather than a substring search.
 *
 * `gate-health.test.mts` asserted that every gate had been shown to fail by checking that the word
 * MUTATION appeared somewhere in its test file. `// NOTE: add a MUTATION proof` satisfied that, and
 * so did a doc block that merely used the word. The rule that makes every claim in this repository
 * credible — a gate that has only ever printed a tick has not been shown to be looking at anything —
 * was enforced by grep, which is F-20 for the fourth time and in the most consequential place: the
 * check that certifies every other check.
 *
 * So this asks the question structurally: is there a test case NAMED as a mutation proof whose body
 * actually CALLS something the gate exports? A comment cannot satisfy that, and neither can a
 * mutation case that has quietly stopped invoking the rule it claims to exercise.
 *
 * It is not a proof that the assertion inside is meaningful — nothing static can be — but it moves
 * the floor from "somebody typed a word" to "the gate's own code runs inside a case that says it
 * makes the gate fail".
 */
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';

const parse = (source, name = 'test.mts') =>
  ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** @param {ts.Node} node @param {(n: ts.Node) => void} visit */
function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/**
 * Identifiers imported into `source` from the gate module.
 * @param {string} source @param {string} gateFile e.g. "check-locale.mjs"
 * @returns {Set<string>}
 */
export function gateImports(source, gateFile) {
  const names = new Set();
  walk(parse(source), (n) => {
    if (!ts.isImportDeclaration(n) || !ts.isStringLiteral(n.moduleSpecifier)) return;
    if (!n.moduleSpecifier.text.endsWith(gateFile)) return;
    const bindings = n.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) names.add(el.name.text);
    }
    if (n.importClause?.name) names.add(n.importClause.name.text);
  });
  return names;
}

/** The string a `it(...)` / `test(...)` call is named with, if it is one. */
function caseName(node) {
  if (!ts.isCallExpression(node)) return null;
  let head = node.expression;
  // `it.each(table)('name', fn)` — the callee is itself a call, so unwrap one level.
  if (ts.isCallExpression(head)) head = head.expression;
  while (ts.isPropertyAccessExpression(head)) head = head.expression; // it.only / it.each
  if (!ts.isIdentifier(head) || !['it', 'test'].includes(head.text)) return null;
  const first = node.arguments[0];
  if (!first) return null;
  if (ts.isStringLiteralLike(first)) return first.text;
  if (ts.isTemplateExpression(first)) return first.head.text;
  return null;
}

/**
 * Names that REACH the gate: what the file imports from it, plus any local binding whose own body
 * calls something already in the set, to a fixpoint.
 *
 * Without this the rule reads a direct call and nothing else, and a test file that wraps its subject
 * once -- `const build = (over) => render({ ...base, ...over })`, which is the ordinary way to write
 * a table of variations -- looks like it never touches the module. Measured on the real
 * `battlecard.test.mts`: three cases named MUTATION, all of them genuinely exercising `render`
 * through `build`, reported as none. A rule this strict does not fail safe; it condemns working
 * proofs, and the repair someone reaches for is to rewrite the tests.
 *
 * @param {ts.SourceFile} tree @param {Set<string>} imported @returns {Set<string>}
 */
function namesReaching(tree, imported) {
  const reaching = new Set(imported);
  /** @type {Array<{name: string, node: ts.Node}>} */
  const locals = [];
  walk(tree, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      locals.push({ name: n.name.text, node: n.initializer });
    }
    if (ts.isFunctionDeclaration(n) && n.name && n.body) {
      locals.push({ name: n.name.text, node: n.body });
    }
  });
  // Fixpoint: a helper that calls a helper that calls the gate reaches the gate too.
  for (let changed = true; changed;) {
    changed = false;
    for (const { name, node } of locals) {
      if (reaching.has(name)) continue;
      let hit = false;
      walk(node, (n) => {
        if (
          ts.isCallExpression(n) &&
          ts.isIdentifier(n.expression) &&
          reaching.has(n.expression.text)
        )
          hit = true;
      });
      if (hit) {
        reaching.add(name);
        changed = true;
      }
    }
  }
  return reaching;
}

/**
 * The scripts `npm run check` actually reaches, derived by following the string literals it spawns
 * from `check.mjs` outward -- what is PRODUCED, not what is named like a gate (F-41).
 *
 * The list was `readdirSync('scripts').filter(f => f.startsWith('check-'))`, which is a statement
 * about filenames. `access-matrix.mjs` refuses the build on an unexplained access concern and
 * `battlecard.mjs` refuses to render a citation that does not resolve; both enforce rules, neither
 * is named like a gate, and so neither was ever required to prove it could fail. A gate that is not
 * in the list is not exempt from being wrong -- only from being checked.
 *
 * @param {Record<string, string>} [sources] basename -> source, for the proofs; read from disk otherwise
 * @returns {string[]}
 */
export function producedGates(sources) {
  const read =
    sources ??
    Object.fromEntries(
      readdirSync('scripts')
        .filter((f) => f.endsWith('.mjs'))
        .map((f) => [f, readFileSync(`scripts/${f}`, 'utf8')]),
    );
  const seen = new Set(['check.mjs']);
  const queue = ['check.mjs'];
  while (queue.length) {
    const current = queue.shift();
    const src = read[current];
    if (!src) continue;
    walk(parse(src, current), (n) => {
      // A parsed string literal, never a pattern over the file's text: a path inside a comment or a
      // message is not something this script runs.
      if (!ts.isStringLiteralLike(n)) return;
      const m = /^scripts\/([\w-]+\.mjs)$/.exec(n.text);
      if (!m || seen.has(m[1])) return;
      seen.add(m[1]);
      queue.push(m[1]);
    });
  }
  seen.delete('check.mjs');
  return [...seen].sort();
}

/**
 * Every external executable the claim-producing gates invoke — ADR-009's anti-degradation rule made
 * checkable.
 *
 * The ADR promises keelblock's full claim "must hold with zero paid components present" and says the
 * rule is "mechanized, not promised". Checking that nothing paid is INSTALLED would be a rule that
 * cannot fail: this repository has never held one, so it would pass on the day a gate started
 * shelling out to the paid CLI and every day after. What can fail is the reach — a gate spawning
 * something nobody declared.
 *
 * Constants are resolved, not only literals: `check-policies.mjs` spawns `RLSA`, and a rule reading
 * string arguments alone would report the four tools every laptop already has and miss the one that
 * has to be installed.
 *
 * @param {Record<string, string>} [sources] basename -> source, for the proofs; read from disk otherwise
 * @returns {string[]} sorted, unique
 */
export function externalTools(sources) {
  const read =
    sources ??
    Object.fromEntries(
      readdirSync('scripts')
        .filter((f) => f.endsWith('.mjs'))
        .map((f) => [f, readFileSync(`scripts/${f}`, 'utf8')]),
    );
  const gates = producedGates(sources);
  const tools = new Set();

  for (const gate of gates) {
    const src = read[gate];
    if (!src) continue;
    const tree = parse(src, gate);

    // const NAME = 'literal' — the indirection real gates use.
    const constants = new Map();
    walk(tree, (n) => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.initializer &&
        ts.isStringLiteralLike(n.initializer)
      ) {
        constants.set(n.name.text, n.initializer.text);
      }
    });

    walk(tree, (n) => {
      if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return;
      if (!['spawnSync', 'execFileSync', 'execSync', 'spawn'].includes(n.expression.text)) return;
      const first = n.arguments[0];
      if (!first) return;
      if (ts.isStringLiteralLike(first)) tools.add(first.text);
      else if (ts.isIdentifier(first) && constants.has(first.text))
        tools.add(constants.get(first.text));
    });
  }
  return [...tools].sort();
}

/**
 * @param {string} source the gate's test file
 * @param {string} gateFile e.g. "check-locale.mjs"
 * @returns {{ok: boolean, reason: string}}
 */
export function mutationProof(source, gateFile) {
  const exported = gateImports(source, gateFile);
  if (exported.size === 0) {
    return { ok: false, reason: `imports nothing from ./${gateFile}, so it cannot exercise it` };
  }

  const named = [];
  walk(parse(source), (n) => {
    const name = caseName(n);
    if (name && /MUTATION/.test(name)) named.push(n);
  });
  if (named.length === 0) {
    return {
      ok: false,
      reason:
        'has no test case NAMED as a mutation proof. The word appearing in a comment is not a proof',
    };
  }

  const reaching = namesReaching(parse(source), exported);
  for (const call of named) {
    let exercises = false;
    walk(call, (n) => {
      if (!ts.isCallExpression(n)) return;
      const callee = n.expression;
      if (ts.isIdentifier(callee) && reaching.has(callee.text)) exercises = true;
    });
    if (exercises) return { ok: true, reason: '' };
  }
  return {
    ok: false,
    reason:
      `has ${named.length} case(s) named MUTATION, and none calls anything exported by ` +
      `./${gateFile} (${[...exported].join(', ')}). A mutation proof that no longer invokes the ` +
      `rule proves nothing, and says so nowhere`,
  };
}
