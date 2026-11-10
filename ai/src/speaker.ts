// Who a script is said by: a person (a creator or influencer, like Alex) or a company brand (like Nike). The writing
// prompts read this as their "Who is talking" section ({{speaker}}), so the same idea comes out as Alex's own story
// or as Nike's brand voice. The brand profile says which ("- kind: person" or "- kind: company").

export type SpeakerKind = 'person' | 'company';
export const SPEAKER_KINDS: readonly SpeakerKind[] = ['person', 'company'];

export const isSpeakerKind = (v: unknown): v is SpeakerKind => v === 'person' || v === 'company';

const PERSON = `A PERSON: a creator or influencer (like Alex), speaking for themselves.
- Said by them, to camera, in the first person ("I"). Their face is on screen most of the time.
- What carries it: their own story, their numbers, what it cost them, a confession over a résumé.
- The L.I.F.E. climb is theirs: Safe, Real, Raw are about their own life, and Raw is a truth about them.
- Companies and products they mention are guests in their story, never the hero.
- The ask: a follow, or their own link.`;

const COMPANY = `A COMPANY BRAND (like Nike), speaking as the brand.
- Said as the brand: "we", or by a named person on screen (an athlete, a customer, someone from the team), never as if that person were the brand. Often faceless: the product, the place, the customer on screen.
- What carries it: the customer's problem, the product as the answer, proof. Not a person's life story.
- The L.I.F.E. climb belongs to the customer: Safe is what everyone in the audience sees, Real is what the problem costs them, Raw is the uncomfortable truth about the category or the habit (never a made-up confession by the brand), Purpose is what the brand does about it, Why is the change for the viewer.
- Proof only from the brand file: never invent customers, results, prices, quotes or partnerships. A claim with no proof is said as a belief ("we think"), or left out.
- The logo or product name appears only on the words that name it, never in the hook's first 8 seconds.
- The ask: the one the brand file names (the product, the shop, the waitlist), once.`;

/** The "Who is talking" section for the writing prompts; a person when the profile doesn't say. */
export function speakerBlock(kind: SpeakerKind | undefined): string {
  return kind === 'company' ? COMPANY : PERSON;
}
