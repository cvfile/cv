// The two anonymous counters of the builder's AI draft, posted to /api/events with no identifier, no cookie
// and no text: `draft_filled` when the assistant writes a draft into the editor, `cv_built` when the visitor
// builds the file after it. A counter that fails to post is lost, and the page goes on.

type SiteEvent = 'draft_filled' | 'cv_built';

let draftFilled = false;

function post(event: SiteEvent) {
  void fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
    credentials: 'omit',
    keepalive: true,
  }).catch(() => undefined);
}

export function countDraftFilled() {
  draftFilled = true;
  post('draft_filled');
}

// Counted only for a build that follows an AI draft in the same tab.
export function countBuildAfterDraft() {
  if (draftFilled) {
    post('cv_built');
  }
}
