import { describe, it, expect } from 'vitest';
import { unshownLists } from '../src/tools';
import { Transcript, withDefaults } from '../src';

function tx(text: string): Transcript {
  const words = text.split(' ').map((w, i) => ({ id: `w${i}`, source: 's1', s: i * 0.4, e: i * 0.4 + 0.3, w, p: 0.99 }));
  return { words };
}
function proj(t: Transcript) {
  const p = withDefaults({ id: 'p', title: 't', slug: 's', sources: [{ id: 's1', path: 'x.mp4', duration: 60 }] } as any);
  p.cut.keep = [{ from: 'w0', to: t.words.at(-1)!.id }];
  return p;
}
const idOf = (t: Transcript, word: string, after = 0) => t.words.find((w, i) => i >= after && w.w.replace(/[^\p{L}]/gu, '') === word)!.id;

describe('lists said out loud', () => {
  const text = 'The bottom line is do one thing today. Rap in the shower, on your way to school, on your way to work. So no script, no checkbox. It is just what is in your head.';

  it('finds a list of three short items, and two items that start the same way', () => {
    const t = tx(text);
    const lists = unshownLists(proj(t), t);
    expect(lists.map((l) => l.items)).toEqual([
      ['Rap in the shower', 'on your way to school', 'on your way to work'],
      ['no script', 'no checkbox']
    ]);
    expect(lists[0]).toMatchObject({ cards: 0 });
  });

  it('leaves a sentence that is not a list alone', () => {
    const t = tx('Freestyling sounds like a joke, but making up bars on the spot is actually what interrupts the pattern.');
    expect(unshownLists(proj(t), t)).toEqual([]);
  });

  it('does not report a list that already has a card for each item, and counts the cards it has', () => {
    const t = tx(text);
    const p = proj(t);
    const card = (from: string, to: string, id: string) => ({ id, treatment: 'card-above-head', anchor: { from, to }, asset: 'x.jpg', params: {} } as any);
    p.broll = [card(idOf(t, 'Rap'), idOf(t, 'shower'), 'b1'), card(idOf(t, 'school'), idOf(t, 'school'), 'b2')];
    let lists = unshownLists(p, t);
    expect(lists[0]).toMatchObject({ items: ['Rap in the shower', 'on your way to school', 'on your way to work'], cards: 2 });
    p.broll = [...p.broll, card(idOf(t, 'work'), idOf(t, 'work'), 'b3')];
    lists = unshownLists(p, t);
    expect(lists.map((l) => l.items[0])).toEqual(['no script']);
  });

  it('ignores words that were cut', () => {
    const t = tx(text);
    const p = proj(t);
    p.cut.keep = [{ from: 'w0', to: idOf(t, 'today') }];
    expect(unshownLists(p, t)).toEqual([]);
  });
});

describe('filler is not an item', () => {
  it('drops "also", "you know", "I don\'t know" before deciding, so an intro or an aside is no list', () => {
    const t = tx("Also, if you're new here, I'm Sam. You could be talking about, I don't know, circles and shapes. Bell rings, you know, you get up, bell rings, you sit down.");
    const lists = unshownLists(proj(t), t);
    expect(lists.map((l) => l.items)).toEqual([['Bell rings', 'you get up', 'bell rings', 'you sit down']]);
  });
});
