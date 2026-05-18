# Product Hunt launch

## Name

cvfile

## Tagline (60 char max)

`.cv` is one resume file that opens for humans and AI alike

Backup tagline options (pick the most readable on the PH card):

1. One resume file. PDF, Markdown, HTML, embeddings, all inside.
2. The resume file format that opens in any PDF reader.
3. Resume as a single file your recruiter AND the ATS can read.

## Topics

Developer Tools, Open Source, Productivity, Artificial Intelligence

## Thumbnail / gallery

* Thumbnail: the `.cv` mark on a deep navy background, 1024 × 1024.
* Gallery 1: hero of cvfile.org (the persona split).
* Gallery 2: screenshot of cvfile.org/view/ with the sample loaded, PDF tab visible.
* Gallery 3: screenshot of cvfile.org/create/ with PDF + Markdown dropped and the "Build .cv" button.
* Gallery 4: code snippet (`pack({ pdf, markdown, html })` → bytes).
* Gallery 5: the comparison table from the landing page.

## Description (~260 chars on the card)

A `.cv` file is your resume in every shape your audience needs at once. The PDF a recruiter prints. The Markdown an ATS parses. The HTML a website embeds. The vectors an AI agent searches. All four inside one file that opens with a double click in any PDF reader.



## Maker comment (first comment on the launch page)

Hey Product Hunt 👋

I built `.cv` because I got tired of maintaining four versions of my own resume that drifted apart within weeks. A PDF for recruiters. A Markdown copy for ATS forms. An HTML version on my personal site. A plain text fallback for old systems. Update one, forget the others, send a stale copy to the wrong audience.

`.cv` is one file. You author it once. Recruiters open it visually (it is a valid PDF/A-3u, opens in Preview, Adobe Reader, Chrome on day one). ATS systems and AI assistants read the Markdown copy that travels inside the same file. Personal sites embed it with one `<cv-embed src="resume.cv">` tag. RAG pipelines read the precomputed BGE-M3 embeddings and skip the re-embedding step entirely.

It is an open standard. Apache 2.0 code. CC BY 4.0 spec. SDKs for JavaScript, Python, Go. CLI via Homebrew, Scoop, WinGet. Web component on the CDN. HTTP middleware for seven frameworks. RAG integrations on PyPI for LangChain, LlamaIndex, Haystack. A 200 line reference sniffer for crawler vendors who want `.cv` awareness without adopting an SDK. IANA registration of `application/vnd.cv+pdf` is submitted.

Two things you can try right now in your browser, no install, no signup:

1. Build your own `.cv` at https://cvfile.org/create/ (drop a PDF, paste Markdown, get a `.cv`).
2. Open one at https://cvfile.org/view/ (drag and drop, or load the sample).

I would love your feedback, especially from anyone who runs careers pages, recruits at scale, builds ATS tooling, or runs RAG over candidate corpora. Spec, SDKs, sample fixtures, and the comparison vs JSON Resume / FRESH / Europass / HR XML are all on the site.

Repo: https://github.com/cvfile/cv

## Notes for posting

* Schedule for 12:01 am Pacific on a Tuesday or Wednesday. Avoid Monday (low traffic) and Friday (drop off into the weekend).
* Post the maker comment within the first 5 minutes of going live.
* Have the team plus three to five hand picked beta users ready to upvote in the first hour. Do not solicit votes from anyone who has not actually used the product. PH detects vote rings.
* Reply to every comment within 10 minutes for the first 6 hours.
* Cross post a short thread to X / Bluesky / LinkedIn at 9 am Pacific with a link to the PH page. Include the gallery 3 screenshot inline.
* Do not run PH the same week as the Show HN. Stagger by 7 days so each one gets a clean attention day.
