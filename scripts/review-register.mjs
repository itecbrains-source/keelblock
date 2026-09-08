/**
 * An external review is a dated RECORD. Its dispositions are LIVE STATE. Keeping them in one file
 * is how a review goes stale: either the record gets rewritten — falsifying what was found on the
 * day — or the state ossifies and says "open" about something fixed weeks ago.
 *
 * So they are separated, and only the state is checked:
 *
 *   docs/review/*.md         frozen. Excluded from the stale-count gate for the same reason.
 *   docs/review/DISPOSITIONS.md   live. One row per finding, and this module enforces it.
 *
 * The review is CLOSED when every finding it raised is implemented, refuted or deferred. That is not
 * asserted anywhere — asserting it is what would go stale. It is computed here, printed by
 * `npm run status`, and required by `npm run check`.
 *
 * Four ways this refuses to rot, each of which has actually happened to a register somewhere:
 *
 *   1. a finding with no row FAILS — you cannot add one to the audit and leave it unanswered;
 *   2. a row for an id the audit does not raise FAILS — a disposition cannot outlive its finding;
 *   3. `implemented` and `refuted` must cite files that EXIST — delete the fix, the claim goes red;
 *   4. `deferred` must cite an OPEN deferral — the day DEF-003 closes, R-13 must be re-answered
 *      rather than sitting here saying "deferred" about work that shipped.
 */

/** Findings, read from the audit itself rather than a list someone maintains alongside it. */
export function parseFindings(markdown) {
  return [...markdown.matchAll(/^##\s+(R-\d+)\s+·\s+([A-Z]+)\s+—\s+(.+)$/gm)].map(
    ([, id, severity, title]) => ({ id, severity, title: title.trim() }),
  );
}

const DISPOSITIONS = ['implemented', 'refuted', 'deferred'];

/** `| R-1 | implemented | `path`, `path` | note |` -> its cells. */
export function parseDispositions(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    const m = /^\s*\|(.+)\|\s*$/.exec(line);
    if (!m) continue;
    const cells = m[1].split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const id = /^(R-\d+)$/.exec(cells[0])?.[1];
    if (!id) continue;
    rows.push({
      id,
      disposition: cells[1].replace(/\*/g, '').trim().toLowerCase(),
      evidence: cells[2],
      note: cells[3],
      paths: [...cells[2].matchAll(/`([^`]+)`/g)].map((x) => x[1].trim()),
      defs: [...cells[2].matchAll(/\bDEF-\d+\b/g)].map((x) => x[0]),
    });
  }
  return rows;
}

/**
 * @param {ReturnType<typeof parseFindings>} findings
 * @param {ReturnType<typeof parseDispositions>} rows
 * @param {{exists: (p: string) => boolean, openDefs: string[], allDefs: string[]}} deps
 * @returns {string[]}
 */
export function checkRegister(findings, rows, { exists, openDefs, allDefs }) {
  const problems = [];
  const seen = new Map();

  for (const row of rows) {
    if (seen.has(row.id)) problems.push(`${row.id} has two dispositions — there can be only one`);
    seen.set(row.id, row);

    if (!findings.some((f) => f.id === row.id)) {
      problems.push(
        `${row.id} is dispositioned but the audit raises no such finding. A disposition that ` +
          `outlives its finding is an answer to a question nobody asked — remove the row.`,
      );
      continue;
    }
    if (!DISPOSITIONS.includes(row.disposition)) {
      problems.push(
        `${row.id} has disposition "${row.disposition}". It must be one of: ${DISPOSITIONS.join(', ')}.`,
      );
      continue;
    }
    if (!row.note || row.note.length < 24) {
      problems.push(
        `${row.id} carries no reasoning. An answer nobody can disagree with is not one.`,
      );
    }

    if (row.disposition === 'deferred') {
      if (!row.defs.length) {
        problems.push(
          `${row.id} is deferred and names no DEF-*. Deferred means tracked somewhere that can ` +
            `fire, not "later".`,
        );
        continue;
      }
      for (const def of row.defs) {
        if (!allDefs.includes(def)) {
          problems.push(`${row.id} defers to ${def}, which is not in the deferral registry`);
        } else if (!openDefs.includes(def)) {
          problems.push(
            `${row.id} says "deferred" and ${def} is CLOSED. The work it was waiting for has ` +
              `landed — re-answer ${row.id} as implemented, with the evidence.`,
          );
        }
      }
      continue;
    }

    if (!row.paths.length) {
      problems.push(
        `${row.id} is "${row.disposition}" and cites nothing checkable. Name the file that ` +
          `carries the answer, in backticks.`,
      );
    }
    for (const p of row.paths.filter((p) => !exists(p))) {
      problems.push(
        `${row.id} is "${row.disposition}" and cites \`${p}\`, which does not exist. ` +
          `The fix was moved or removed and this register did not notice.`,
      );
    }
  }

  for (const f of findings.filter((f) => !seen.has(f.id))) {
    problems.push(
      `${f.id} (${f.severity}) has no disposition. Every finding is implemented, refuted or ` +
        `deferred — an external review with an unanswered finding is one nobody finished reading.`,
    );
  }
  return problems;
}

/** What the state IS, computed. Nothing writes this down. */
export function summarize(findings, rows) {
  const by = (d) => rows.filter((r) => r.disposition === d && findings.some((f) => f.id === r.id));
  const answered = new Set(rows.map((r) => r.id));
  return {
    total: findings.length,
    implemented: by('implemented').length,
    refuted: by('refuted').length,
    deferred: by('deferred').length,
    open: findings.filter((f) => !answered.has(f.id)).map((f) => f.id),
    closed: findings.length > 0 && findings.every((f) => answered.has(f.id)),
  };
}
