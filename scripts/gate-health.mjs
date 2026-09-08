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

  for (const call of named) {
    let exercises = false;
    walk(call, (n) => {
      if (!ts.isCallExpression(n)) return;
      const callee = n.expression;
      if (ts.isIdentifier(callee) && exported.has(callee.text)) exercises = true;
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
