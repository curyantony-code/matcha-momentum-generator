// The niche research the script writer builds on: the "## Concepts" section of the person's swipe.md, written by
// /studio-script viral from outliers scored against each account's own median.

const NICHE_LIMIT = 4_000;

/** The Concepts section of swipe.md, '' when the file has none; capped so it cannot crowd out the prompt. */
export function nicheConcepts(swipe: string): string {
  const m = /^## Concepts[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(swipe ?? '');
  const body = m?.[1]?.trim() ?? '';
  return body.length > NICHE_LIMIT ? `${body.slice(0, NICHE_LIMIT).replace(/\s+\S*$/, '')}\n(...)` : body;
}
