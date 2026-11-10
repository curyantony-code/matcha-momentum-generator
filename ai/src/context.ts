// What the script writer reads, without what can't help it: empty "{{to fill}}" lines, HTML comments, runs of blank
// lines, and the sections of brand.md / framework.md that are for people or for research, not for writing a script.
// Fewer tokens on every script and idea, the same instructions.

const DROP_SECTIONS: Record<'brand' | 'framework', RegExp> = {
  brand: /^## (Bio options|Taglines to choose from|Open questions[^\n]*|How it shows on screen)$/,
  framework: /^## 8\. Studying a reference[^\n]*$/,
};

/** Drops HTML comments, bullet or table lines that are only a {{placeholder}}, and blank-line runs. */
export function compact(text: string): string {
  return (text ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((l) => !/^\s*(?:[-*]\s*|\|\s*)?(?:[^|{]*:\s*)?\{\{[^}]*\}\}\s*\|?\s*$/.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** brand.md or framework.md without the sections a script writer doesn't use. */
export function forWriting(text: string, kind: 'brand' | 'framework'): string {
  const out: string[] = [];
  let skip = false;
  for (const line of (text ?? '').split('\n')) {
    if (/^## /.test(line)) skip = DROP_SECTIONS[kind].test(line.trim());
    if (!skip) out.push(line);
  }
  return compact(out.join('\n'));
}
