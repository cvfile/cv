# ChatGPT prompt to generate the Product Hunt thumbnail

Paste the block below into ChatGPT (or any image model with reasonable typography). The thumbnail target is **1024 × 1024 PNG**, sRGB, no transparency.

---

Generate a 1024 by 1024 square image that will be used as the thumbnail card for a developer tool on Product Hunt.

**Concept.** A single file extension mark, the literal four characters `.cv`, presented as a wordmark on a calm dark background. Treat it like a typographic logo, not an illustration. The mark should feel like a serious open standard, not a SaaS product.

**Composition.**
* Square 1024 by 1024 canvas.
* Solid deep navy background. Use the color `#0B1220` filling the whole canvas, no gradient, no texture, no noise.
* In the dead center of the canvas, render the four characters `.cv` as a single horizontal wordmark. The dot and the letters `c` and `v` are part of the same mark, no separation, no leading or trailing punctuation.
* The mark color is a soft warm off white, approximately `#F4F1EA`. Slightly warm, not pure white.
* Typeface: a clean modern geometric sans serif with confident weight, similar to Inter SemiBold, GT America Medium, or Söhne Halbfett. Letters are lowercase. The dot before `cv` is a circular round dot, not a small square. The dot is part of the same baseline alignment as the letters.
* Optical size: the mark fills roughly 70 percent of the canvas width. Centered on both axes.
* Faint accent: a single thin one pixel hairline beneath the mark, 18 percent canvas width, the same off white color, opacity 25 percent. Sits 24 pixels below the baseline. Nothing else. No second line of text. No tagline. No version. No URL.

**Strict constraints, do not violate.**
* No people, no faces, no hands.
* No paper, no document, no resume mockup, no PDF page rendering, no scanned page.
* No icons, no badges, no shields, no checkmarks, no sparkles, no AI brain motifs, no abstract circuit lines.
* No drop shadows, no glow, no gradients, no neon, no chrome.
* No noise, no film grain, no halftone.
* No second copy of the mark in the corner.
* No watermarks, no signatures, no AI generator marks.
* No emoji.
* The dot in `.cv` must be a single round dot, not a star, not a square, not a logo.
* Do not invent additional letters. The mark contains exactly three glyphs: `.`, `c`, `v`. Do not render `.CV`, `cv`, `cv.`, `CV.`, only `.cv` lowercase.

**Output.** A single 1024 by 1024 PNG. No frame, no border, no rounded corners (Product Hunt rounds the thumbnail itself).

If your model misrenders the dot, regenerate. The most common failure is the dot drifting up to the height of the `c` so it reads like the letter `o`. The dot must sit on the baseline of the lowercase `c` and `v`, the same baseline they share with each other.

---

## After you have the PNG

1. Open in Preview or any image tool, confirm the canvas is exactly 1024 × 1024. If not, re-export at that size.
2. Confirm the file is under 2 MB (Product Hunt limit is 4 MB but smaller is better).
3. Save to `launch/screenshots/thumbnail.png` in this repo before posting.
