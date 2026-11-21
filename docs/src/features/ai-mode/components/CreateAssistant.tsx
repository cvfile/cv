// The draft assistant inline in step 02 of /create/: it reads the dropped PDF in the page and writes the
// Markdown copy into the editor below it, on the visitor's own AI.

import { useMemo, useState } from 'react';
import { AiChatInline, AiConnectProvider } from '@tensorpass/aiconnect-react';
import '@tensorpass/aiconnect-react/styles.css';
import '../aiMode.css';
import { aiClient } from '../aiClient.ts';
import { ASSISTANTS } from '../assistants.ts';
import { chatPolicy, TOOL_LABELS } from '../chatPolicy.mjs';
import { renderCards } from './cards/renderCards.tsx';

const config = ASSISTANTS.create;

export default function CreateAssistant() {
  const [client] = useState(aiClient);
  const tools = useMemo(() => config.createTools(), []);
  return (
    <AiConnectProvider client={client}>
      <AiChatInline
        className="ai-inline"
        system={config.system}
        tools={tools}
        guards={chatPolicy}
        title={config.title}
        intro={config.intro}
        placeholder={config.placeholder}
        suggestions={config.suggestions}
        toolLabels={TOOL_LABELS}
        renderToolResults={renderCards}
      />
    </AiConnectProvider>
  );
}
