/**
 * Prose is not code, and a gate that cannot tell the difference reports on documentation.
 *
 * F-64 produced this by accident: a docblock written to EXPLAIN the new locale rule quoted a
 * `t('key')` call as its example, and the gate immediately reported a use of a key that does not
 * exist. The extractor was reading the file rather than the code. Probing the rest of the gates
 * found the same shape in four of them, and two counterexamples that show the way out:
 *
 *   · `check-boundaries` resolves imports through the TypeScript AST, so a quoted import in a
 *     comment is invisible to it — it never sees text at all.
 *   · `check-policies` reads TAP output rather than `.sql` files, and says why in as many words:
 *     "a commented-out assertion is still in the source".
 *
 * Both dodge the problem by reading something that is already structured. Where a gate genuinely
 * must match source text, these two helpers give it the same footing: remove the regions that are
 * display rather than instruction, and leave everything else exactly where it was.
 *
 * **Both are position-preserving.** Removed regions become spaces and blank lines rather than
 * disappearing, so byte offsets and — the part that matters — LINE NUMBERS survive. A gate that
 * reports `file:12` must still be right about 12 after stripping.
 */
import ts from 'typescript';

/**
 * Blank every comment in TypeScript/TSX source, preserving every other character position.
 *
 * Uses the compiler's own scanner rather than a regular expression, for the reason
 * `route-protection.test.mts` already gives about the proxy matcher: a parser answers this exactly
 * where a pattern would merely usually agree. The pattern version is not hypothetical — the obvious
 * `/\/\*[\s\S]*?\*\//g` treats the `'/*'` inside a string literal as a comment opening and blanks
 * real code until the next `*​/`, which turns a false positive into a silent false negative. The
 * scanner knows what a string is.
 *
 * Not for `check-deferrals`: its markers LIVE in comments by design, so stripping them would blind
 * it completely. See that gate's own note.
 */
export function stripComments(source) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    ts.LanguageVariant.JSX,
    source,
  );
  const out = [...source];
  let token;
  while ((token = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia &&
      token !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      continue;
    }
    for (let i = scanner.getTokenStart(); i < scanner.getTokenEnd(); i++) {
      if (out[i] !== '\n') out[i] = ' ';
    }
  }
  return out.join('');
}

/**
 * Blank every `/* … *​/` comment in CSS, preserving every other character position.
 *
 * Added because the defect recurred immediately, in a third medium, in the commit that fixed the
 * first two. `src/theme.test.mts` forbids the string `&:is(.dark *)` — shadcn's class-based dark
 * variant — and the stylesheet's own comment, written to explain WHY that string is refused, made
 * the rule fail on the file it was protecting. Exactly the shape of F-64 and of every row in F-66.
 *
 * The lesson is not "add a third stripper". It is that **a text-matching rule needs this on the day
 * it is written, not after it misfires** — the misfire is not a rare edge, it is what happens the
 * first time someone documents the rule. Whatever medium comes next needs its own entry here.
 *
 * Quote-aware, because a CSS string may legitimately contain the characters that open a comment —
 * `content: "/*"` is valid CSS. Blanking from there to the next `*​/` would eat real declarations,
 * which is the same false-negative trade `stripComments` uses the compiler's scanner to avoid.
 */
export function stripCssComments(source) {
  const out = [...source];
  let quote = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (let j = i; j < stop; j++) if (out[j] !== '\n') out[j] = ' ';
      i = stop - 1;
    }
  }
  return out.join('');
}

/**
 * Blank every fenced code block in markdown, preserving line numbers.
 *
 * Fenced content is a picture of a thing, never the thing: a document that shows the acceptance-bar
 * table format, or an example AC row, or how to cite an answer, is documenting the format — and
 * three gates read those examples as live rows and failed on them. Inline code spans are left
 * alone, deliberately: the gates read backticked paths as real citations, and that is correct.
 *
 * The closing fence must be at least as long as the opening one and use the same character, which
 * is how a ```` ``` ```` block can contain a ``` line without ending early.
 */
export function stripFences(markdown) {
  let open = null;
  return markdown
    .split('\n')
    .map((line) => {
      const fence = /^\s*(`{3,}|~{3,})/.exec(line);
      if (open === null) {
        if (fence) {
          open = fence[1];
          return '';
        }
        return line;
      }
      // Inside a block: only a fence of the same character and at least the same length closes it.
      if (fence && fence[1][0] === open[0] && fence[1].length >= open.length) open = null;
      return '';
    })
    .join('\n');
}
