import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { Prompts } from '../src/prompts';
import { speakerBlock, isSpeakerKind } from '../src/speaker';

const prompts = new Prompts(path.join(__dirname, '..', 'prompts'));

describe('who is talking: a person or a company brand', () => {
  it('a person speaks for themselves; a company speaks as the brand, with proof only from its file', () => {
    expect(speakerBlock('person')).toMatch(/first person/);
    expect(speakerBlock('person')).toMatch(/like Alex/);
    expect(speakerBlock('company')).toMatch(/like Nike/);
    expect(speakerBlock('company')).toMatch(/never invent customers/);
    expect(speakerBlock('company')).toMatch(/climb belongs to the customer/);
    expect(speakerBlock(undefined)).toBe(speakerBlock('person'));
    expect(isSpeakerKind('company')).toBe(true);
    expect(isSpeakerKind('brand')).toBe(false);
  });

  it('every writing prompt has the section, and nothing is left unfilled', () => {
    for (const name of ['writeScript', 'ideas', 'draftCarousel', 'draftStory'] as const) {
      expect(prompts.raw(name), name).toContain('{{speaker}}');
      expect(prompts.render(name, { speaker: speakerBlock('company') }), name).toContain('A COMPANY BRAND (like Nike)');
    }
  });
});
