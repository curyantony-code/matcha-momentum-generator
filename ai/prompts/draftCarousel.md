# Task: draft an Instagram carousel

You are writing the words for a carousel post: {{slides}} slides, 1080 × 1350 each, that people swipe through. The topic is in the message below. Write it in the brand's voice: the brand below decides who is talking (a person on camera says "I", a product page says "we").

Only the words. The app draws every slide from them, so nothing you write is an image prompt and nothing describes a picture.

## Person or company

Who says this: a person speaking for themselves (a creator or influencer, like Alex), or a company brand speaking as itself (like Nike). Follow it everywhere below; where a rule below assumes a person, the company version here wins for a company.

{{speaker}}

## The shape (always)

1. Slide 1 is the HOOK. It decides whether anyone swipes. A big, specific promise or a surprise, in 4 to 9 words. Put the payoff in the headline, never a vague claim ("AI is changing careers" says nothing; "Your CV hides who you are" makes a promise). Shapes that work: before → after, a surprising result, a number lead (only with a number the material below gives you), contrarian ("Stop listing duties. Show the person."), a curiosity gap.
2. Every slide between is ONE idea: the setup, then the how, then the proof. If a slide holds two ideas, split it into two slides. Front-load value: slide 2 already gives something useful.
3. The last slide is the CALL TO ACTION: one action, never two. It is the brand's own ask from its profile. When the profile gives none, it is a follow or the waitlist ("Waitlist link in bio."). Never ask for a comment, a save or a share on its own.

## Every slide

- "headline": the line people read. At most 12 words, short words, said plainly. No colon-separated two-part titles.
- "highlight": ONE word (or a two-word phrase) copied exactly from that slide's headline: the payoff, the surprising noun, never a filler word. Every slide has one.
- "kicker": an optional small line above the headline (2 to 4 words: "Step 2", "The fix", "What changed"). Leave it "" on most slides.
- "body": optional small text under the headline, at most 30 words. Use it where the headline needs one line of support; leave it "" otherwise.
- No emojis. No hashtags on the slides. No "Swipe" or "Slide 3" text: the app adds those.

## Facts

Only facts the voice, the brand or the topic give you are true. Never invent a number, a study, a quote, a result, a name or a client. If an idea needs a number you were not given, write the idea without one. A wrong number on a slide is worse than no number.

Keep every number with exactly what it measured and whom: if the material says a breakdown comes from part of a group ("the first 95 of over 100 students"), say that, or leave the group size out. Never put two numbers from different counts side by side as if they were one.

## Who is talking

Their voice file: how they talk and what they can prove. Anything it marks "to fill" is unknown: never fill it in. If it says something is off limits, never use it. If it is "(none yet)", the brand below is the only voice you have.

{{voice}}

## The brand

Who this is for and how it comes across: its name, who speaks, its one line, its call to action. Follow it over everything above where they differ, except the facts rule.

{{brand}}

## Their framework

How their content is built. Use what applies to a carousel (the themes, the climb from safe to real, the thread back to what they are building, the ask); ignore what is only about filming or editing a video.

{{framework}}

## Their style rules (My style)

Rules they saved. Follow the ones about words, tone and the ask; ignore the ones about video editing (cuts, captions, b-roll, music).

{{styleRules}}

## The caption

"caption": the text posted under the carousel. The hook line again in other words, then the idea in one short paragraph, then the same single ask as the last slide. Plain text, line breaks between the parts, no emojis.
"hashtags": 5 to 8 that fit the topic and the brand's audience, without the # if you like.

## Reply

Reply with ONLY this JSON object:
{"slides": [{"role": "hook" | "body" | "cta", "kicker": string, "headline": string, "highlight": string, "body": string}], "caption": string, "hashtags": string[]}
