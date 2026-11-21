// The header island of every page: the "Ask the spec" button and, from its first click, the assistant panel
// docked at the page's edge. On /view/ the panel is the file assistant, opened by this button or by the
// page's "Ask about this file" button. The panel and its tools load on the first open only.
//
// The panel and the connect window render at the end of the body: the sticky header blurs what passes
// under it (backdrop-filter), which makes it the box any fixed layer inside it is placed in.

import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AiConnectProvider } from '@tensorpass/aiconnect-react';
import '@tensorpass/aiconnect-react/styles.css';
import '../aiMode.css';
import { aiClient } from '../aiClient.ts';
import type { AssistantName } from '../assistants.ts';
import { onOpenAssistant } from '../openAssistant.ts';

const AssistantPanel = lazy(() => import('./AssistantPanel.tsx'));

const LAUNCH_LABEL = 'Ask the spec';

export default function AiModeRoot({ assistant }: { assistant: Exclude<AssistantName, 'create'> }) {
  const [client] = useState(aiClient);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => onOpenAssistant(() => {
    setMounted(true);
    setOpen(true);
  }), []);

  const toggle = () => {
    setMounted(true);
    setOpen((current) => !current);
  };

  return (
    <>
      <button type="button" className="theme-toggle ai-launch" aria-expanded={open} onClick={toggle}>
        {LAUNCH_LABEL}
      </button>
      {createPortal(
        <AiConnectProvider client={client}>
          {mounted ? (
            <Suspense fallback={null}>
              <AssistantPanel assistant={assistant} open={open} onOpenChange={setOpen} />
            </Suspense>
          ) : null}
        </AiConnectProvider>,
        document.body,
      )}
    </>
  );
}
