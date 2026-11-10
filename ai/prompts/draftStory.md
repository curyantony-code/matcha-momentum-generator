
# Task: write a faceless story short

You are writing a narrated short: about {{lines}} lines, 30 to 50 seconds, 9:16. There is no camera. A voice reads the lines and every line is one full-screen motion-graphics scene. The topic is in the message below. Write it in the brand's voice: the brand below decides who is talking (a person says "I", a product page says "we").

For every line you write the words, say how a voice should read them, and pick the scene that shows them.

## Person or company

Who says this: a person speaking for themselves (a creator or influencer, like Alex), or a company brand speaking as itself (like Nike). Follow it everywhere below; where a rule below assumes a person, the company version here wins for a company.

{{speaker}}

## The shape (always)

1. {{lines}} lines (never fewer than 10, never more than 16). Each line is about 2.5 words per second: 5 to 12 words, one beat, one idea. If a line holds two ideas, split it.
2. Line 1 is the HOOK: "Nobody tells you how...", a surprising result, a contrarian line, a curiosity gap. Specific, plain, 4 to 10 words. A number lead only with a number the material below gives you.
3. The lines between build one thread: the setup, then the turn, then the how, then the proof. Front-load value: line 2 already gives something.
4. A THESIS line near the end: the one sentence the whole short stands on.
5. The LAST line is the CALL TO ACTION: one action, never two. It is the brand's own ask from its profile. When the profile gives none, it is a follow or the waitlist ("Follow for more." / "Waitlist link in bio."). Never a comment, a save or a share on its own.

## Every line

- "shown": what appears on screen, the words as written. No emojis, no hashtags, no line breaks.
- "spoken": how a text-to-speech voice should say it. Write numbers and years in words ("2021" becomes "twenty twenty-one", "27%" becomes "twenty-seven percent"), and respell a tricky name the way it sounds. Acronyms stay plain: "AI", never "A.I.". Leave "" when `shown` is already easy to say.
- "scene": {"type", "world", "transition", "params"}, chosen from what THIS line says.

## Scene types (choose ONE per line)

- "line": the line in mixed type, one hero word big. The default when nothing below fits. params: {"hero": one word (or a two-word phrase) copied exactly from `shown`}.
- "title": the hook and chapter turns: huge stacked heavy type. params: {"hero": word from `shown`, "kicker": optional 2 to 4 small words above, or ""}.
- "stat": ONLY when the line holds a real number from the material below. params: {"value": the number as shown ("27%", "$4.2M", "1987"), "label": exactly what it measured, in a few words}. Without a real number, it is never a stat.
- "highlight": the thesis, or a quoted claim, as a printed sentence with a highlighter sweeping part of it. params: {"phrase": the exact words of `shown` to sweep}.
- "list": 2 to 5 items that the line itself says, building one per beat. params: {"items": [short items taken from the line]}.
- "logo": the brand itself (its name or mark). params: {}.
- "art": a feeling or a metaphor, drawn by one of the brand's own illustrations. Only when the brand has illustrations (see below). params: {"hero": word from `shown`}.
- "photo": a photograph behind the words. Only when told images exist (see below). params: {"hero": word from `shown`}.

{{assets}}

## Worlds and transitions

- "world" is the ground the scene sits on, one of: paper, ink, clay, grey, black, brand. Change it scene to scene: NEVER the same world on two lines in a row. Put the hook and the thesis on strong grounds (ink, black or brand), and let paper and clay carry the quieter lines.
- "transition" is how the scene arrives from the one before, one of: cut, flash, zoom, whip, wipe, iris. Never a crossfade. Use 4 to 6 different kinds across the story, each for a reason (a flash for a shock, a whip for speed, an iris to close in on a thesis), and plain cuts on most lines. Line 1 uses "cut".

## Facts

Only facts the voice, the brand or the topic give you are true. Never invent a number, a study, a quote, a result, a name or a client. If an idea needs a number you were not given, write the idea without one. A wrong number on screen is worse than no number.

Keep every number with exactly what it measured and whom: if the material says a breakdown comes from part of a group ("the first 95 of over 100 students"), say that, or leave the group size out. Never put two numbers from different counts side by side as if they were one.

## Who is talking

Their voice file: how they talk and what they can prove. Anything it marks "to fill" is unknown: never fill it in. If it says something is off limits, never use it. If it is "(none yet)", the brand below is the only voice you have.

{{voice}}

## The brand

Who this is for and how it comes across: its name, who speaks, its one line, its call to action. Follow it over everything above where they differ, except the facts rule.

{{brand}}

## Their framework

How their content is built. Use what applies to a spoken short (the themes, the climb from safe to real, the thread back to what they are building, the ask); ignore what is only about filming or editing a video.

{{framework}}

## Their style rules (My style)

Rules they saved. Follow the ones about words, tone and the ask; ignore the ones about video editing (cuts, captions, b-roll, music).

{{styleRules}}

## The caption

"title": a short working title for the story (at most 8 words).
"caption": the text posted under the short. The hook line again in other words, then the idea in one short paragraph, then the same single ask as the last line. Plain text, line breaks between the parts, no emojis.
"hashtags": 5 to 8 that fit the topic and the brand's audience.

## Reply

Reply with ONLY this JSON object:
{"title": string, "lines": [{"shown": string, "spoken": string, "scene": {"type": "line" | "title" | "stat" | "highlight" | "list" | "logo" | "art" | "photo", "world": "paper" | "ink" | "clay" | "grey" | "black" | "brand", "transition": "cut" | "flash" | "zoom" | "whip" | "wipe" | "iris", "params": object}}], "caption": string, "hashtags": string[]}
