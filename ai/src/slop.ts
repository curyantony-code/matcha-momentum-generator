// Phrases that make a spoken script sound written by AI, not said by a person: fake-candid openers, announcing
// instead of saying, stage directions to the viewer, chatbot leftovers and the usual AI words. The script writer
// checks every draft against this list and asks for one rewrite when a phrase is in it. Learned from the anti-slop
// and copywriting-hooks skills (MIT), restated in our own words (THIRD_PARTY.md).

interface SlopRule {
  /** How the rewrite request names it. */
  name: string;
  re: RegExp;
}

const phrase = (p: string): SlopRule => ({ name: p, re: new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]")}\\b`, 'i') });

const RULES: SlopRule[] = [
  // fake-candid: a pause before an ordinary point
  phrase("here's the thing"), phrase("let's be honest"), phrase('real talk'),
  { name: 'honestly?', re: /\bhonestly\?/i },
  // announcing what comes next instead of saying it
  phrase("let's dive in"), phrase('dive into'), phrase("here's what you need to know"), phrase('without further ado'), phrase('buckle up'),
  // stage directions telling the viewer how to feel
  phrase('let that sink in'), phrase('read that again'), phrase('the takeaway is simple'), phrase('the message is clear'),
  // openers nobody says out loud
  phrase('picture this'), phrase('what if i told you'), phrase('imagine a world where'), phrase("in today's fast-paced world"),
  phrase('have you ever wondered'), phrase("you're not alone"), phrase('in the realm of'), phrase('navigating the landscape'),
  // the formula "It's not just X, it's Y"
  { name: "it's not just x, it's y", re: /\bit['’]s not just\b[^.!?\n]{1,60}\bit['’]s\b/i },
  // chatbot leftovers and AI words
  phrase('i hope this helps'), phrase('in conclusion'), phrase('game-changer'), phrase('game changer'),
  phrase('leverage'), phrase('utilize'), phrase('unlock'), phrase('delve'),
];

/**
 * The AI phrases in `text`, by name, in the order of the list. A phrase that is in `voice` (their voice file: how they
 * really talk) is theirs, so it is never flagged.
 */
export function findSlop(text: string, voice = ''): string[] {
  return RULES.filter((r) => r.re.test(text) && !r.re.test(voice)).map((r) => r.name);
}
