// The assistant docked at the page's edge, on the visitor's own AI, under cvfile.org's guards, with the
// site's cards under each answer.

import { useMemo } from 'react';
import { AiChatPanel } from '@tensorpass/aiconnect-react';
import { ASSISTANTS } from '../assistants.ts';
import type { AssistantName } from '../assistants.ts';
import { chatPolicy, TOOL_LABELS } from '../chatPolicy.mjs';
import { renderCards } from './cards/renderCards.tsx';
import { TensorPassCredit } from './TensorPassCredit.tsx';

interface AssistantPanelProps {
  assistant: AssistantName;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AssistantPanel({ assistant, open, onOpenChange }: AssistantPanelProps) {
  const config = ASSISTANTS[assistant];
  const tools = useMemo(() => config.createTools(), [config]);
  return (
    <AiChatPanel
      open={open}
      onOpenChange={onOpenChange}
      hideLauncher
      system={config.system}
      tools={tools}
      guards={chatPolicy}
      title={config.title}
      intro={config.intro}
      placeholder={config.placeholder}
      suggestions={config.suggestions}
      toolLabels={TOOL_LABELS}
      renderToolResults={renderCards}
      footer={<TensorPassCredit />}
    />
  );
}
