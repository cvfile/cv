# Launch runbook — July 2026

Last reviewed 2026-05-18. All times are Pacific.

Schedule note: another product launch from the same maker account is on Product Hunt on 2026-06-16. cvfile is held until 2026-07-22 so the two launches do not compete for the same audience and the maker account does not look like it is spraying launches.

## Show HN — Tue 2026-07-14, 08:00 PT

### T minus 7 days (Tue 2026-07-07)
* Confirm IANA registration status. If approved, add a one liner to the first comment.
* Re read `launch/hn-show.md`. Update the "What is in flight" section to match reality.
* Confirm cvfile.org, cvfile.org/view/, cvfile.org/create/, cvfile.org/install/, cvfile.org/spec/ all return 200.
* Pin a Twitter/X and Bluesky post draft. Do not publish until launch day.

### T minus 1 day (Mon 2026-07-13)
* Final read of the first comment. Verify every link 200s.
* Verify the GitHub repo README renders correctly above the fold.
* Sanity check the live `/create/` flow with a real PDF + Markdown. Build, download, open.
* Make sure you can answer "is `.cv` really PDF/A-3u conformant" with a one liner pointing to the veraPDF gate in CI.

### Launch morning (Tue 2026-07-14)
* 07:50 PT. Coffee. Open hn.algolia.com to confirm no clashing Show HN already on the front page.
* 08:00 PT exactly. Submit at https://news.ycombinator.com/submit
  * Title: `Show HN: .cv, a single file that carries your resume as PDF, Markdown, HTML`
  * URL: `https://cvfile.org`
  * Text: leave blank. The first comment goes in as a child reply.
* 08:01 PT. Post the first comment from `launch/hn-show.md` as a top level reply to your own submission.
* 08:05 PT. Post the short version (one sentence + link) on Twitter/X and Bluesky.
* 08:15 PT onward. Reply to every top level comment within 15 minutes. Stay on for at least 6 hours.
* If by 09:30 PT the post is not on the front page but has 5+ points and is climbing, hold steady. Do not ask anyone to upvote. HN detects vote rings and the penalty is fatal.

### After the dust settles (Wed 2026-07-15)
* Save the final HN URL into this file under "Post mortem".
* Take notes on the three most common criticisms. They feed the FAQ section on the landing page.

---

## Product Hunt — Wed 2026-07-22, 00:01 PT

### T minus 14 days (Wed 2026-07-08)
* Sign up the maker account at https://www.producthunt.com if it does not exist yet.
* Comment thoughtfully on three or four products in the week leading up to launch. Account warmup matters for ranking.
* If you want a hunter, DM Chris Messina (@chrismessina on X) with a one paragraph preview and a private PH preview link. Optional.

### T minus 7 days (Wed 2026-07-15)
* Generate the thumbnail using `launch/thumbnail-prompt.md`. Save to `launch/screenshots/thumbnail.png` and commit.
* Open https://www.producthunt.com/launches to draft the listing.
* Fill from `launch/product-hunt.md`:
  * Name: `cvfile`
  * Tagline (60 char): `.cv is one resume file that opens for humans and AI alike`
  * Topics: Developer Tools, Open Source, Productivity, Artificial Intelligence
  * Thumbnail: `launch/screenshots/thumbnail.png`
  * Gallery: `01-hero.png`, `02-view-markdown.png`, `03-create-empty.png`, `04-install-code.png`, `05-comparison.png`
  * Description: copy from `launch/product-hunt.md`
* Set launch date to **2026-07-22** and confirm timezone is Pacific.
* Save as draft. PH will email you when the listing is approved (24 hours typical).

### T minus 1 day (Tue 2026-07-21)
* Confirm the listing is approved and scheduled.
* Verify every link in the description and maker comment 200s.
* Have the maker comment ready in your clipboard.

### Launch morning (Wed 2026-07-22)
* 00:01 PT. Listing goes live automatically. You do nothing.
* 00:05 PT. Post the maker comment from `launch/product-hunt.md` as the first comment.
* 00:10 PT. Post the launch tweet on X and Bluesky with the PH URL. Include `screenshots/03-create-empty.png` inline.
* 09:00 PT. LinkedIn post with the PH URL.
* All day. Reply to every comment within 10 minutes for the first 6 hours. After 6 hours, reply within an hour.
* Do not ask for upvotes. PH detects vote rings.

### After (Thu 2026-07-23)
* Save the final PH URL and rank into this file under "Post mortem".

---

## Post mortem

* Show HN URL: _(fill in 2026-07-14 evening)_
* Show HN final rank, peak rank, comment count: _(fill in 2026-07-15)_
* PH URL: _(fill in 2026-07-22 evening)_
* PH final rank of the day, vote count, comment count: _(fill in 2026-07-23)_
* Top three criticisms across both: _(fill in)_
* Top three feature requests: _(fill in)_

---

## Hard constraints

* Do not post the same content to HN and PH on the same day. PH the week after.
* Do not solicit upvotes. Ever. On either platform.
* Do not link to unsigned desktop binaries. Until Apple Dev ID + Windows cert land, the desktop viewer stays out of launch copy.
* Do not promise IANA approval. Phrase it as "submitted, 2 to 6 week timeline".
* Do not promise native ChatGPT or Claude integration. Phrase it as "vendor outreach in progress, the realistic delivery path today is HTTP content negotiation".
