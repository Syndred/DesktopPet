QA011 chat close-up clipping: source fix 46e6473.

Only conversations/styles.css changes product behavior. The actual canonical
ResourcePortrait keeps its original viewBox, frame and slice policy. Both SVG
dimensions now preserve their intrinsic ratio inside the centered chat scene.

Run: node apps/pc-app/runtime/features/conversations/tests/portrait-layout.acceptance.cjs
Requires an existing headless Chromium; optional LINGJING_QA_BROWSER_PATH.
No dependency installation, visible native app, user profile, database or model.

24 headless component cases passed: 8 actual canonical resources x 3 slots.
The wide 407.4x225 slot replays 09's native measurement; smaller slots exercise
both bounding constraints. verification.json preserves the exact renderer run.
index.json records source, harness, asset and screenshot provenance.
Its harness/verification text hashes bind the original LF run bytes and Git
blobs; normalize a Windows CRLF checkout to LF when comparing those text files.
Screenshots show actual decoded canonical pixels; they are component evidence.
Rounded corner styling is retained; alpha coverage uses rectangular viewports.

The earlier 312 native screenshot and geometry stay in 09's original round.
Native acceptance was pending at this source delivery; see the follow-up below.

Follow-up: native-e875.json records 09's four actual e875 fox captures and
geometry at chat/AI settings, 2048x1151 and 1340x920, DPR1.25. QA-011 is verified
for that tested scope, with at least 99.9944% visible content. The 8-character
gallery remains component evidence; this does not claim eight native passes or
complete application acceptance. Original failure/source-run evidence is kept.
