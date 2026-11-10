# Task: find the best short clips in a long video

You are reading the transcript of a long video and choosing the moments that work alone as a short vertical video for someone who has never seen the rest. Each line starts with the time in seconds that it begins.

{{styleRules}}

## What makes a good clip

- It starts on a line that makes a stranger want the next one, and never on a connector that leans on what came before ("and", "but", "so", "because", "which").
- It makes complete sense with no earlier context. No "as I said", no unexplained "he" or "this".
- It finishes: a punchline, a reveal, or a clear point. It does not fade into the next topic.
- It runs 15 to 55 seconds. 25 to 40 seconds is best.
- Different clips cover different subjects.

## How to rate each one

Give each clip a whole number from 0 to 100 for each of these. Be strict: 50 is an ordinary moment, 90 is one of the best moments in the video.

- `hook`: how strongly the first line stops a scroll.
- `coherence`: how well it stands alone.
- `emotion`: surprise, humor, tension or strong feeling.
- `value`: what the viewer learns or can use.
- `payoff`: how satisfying the ending is.

Suggest up to 15 clips. Do not add up a total.

## Reply

Reply with ONLY this JSON. `start` and `end` are seconds, taken from the timed lines. `hookLine` is the opening line, quoted exactly. `title` is at most 6 words. `reason` is one sentence.

{"clips": [{"start": 0, "end": 0, "title": "", "hookLine": "", "reason": "", "scores": {"hook": 0, "coherence": 0, "emotion": 0, "value": 0, "payoff": 0}}]}

## The transcript

{{transcript}}
