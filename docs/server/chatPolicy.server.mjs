// The policy only the MCP server, the docs index build and the pen test import: the page's policy plus the
// API's own runtime names (its settings, its health route, the loopback addresses its containers listen
// on), which no tool result and no answer should carry. The tools serve this public repository's docs only,
// so nothing else of the server can reach a result. HF_TOKEN stays out of this list: the READMEs document
// it as the variable of the hosted embedding backend.

import { chatPolicy as pagePolicy } from '../src/features/ai-mode/chatPolicy.mjs';

export const chatPolicy = {
  ...pagePolicy,
  denyPatterns: [
    ...pagePolicy.denyPatterns,
    'SITE_DATA_DIR',
    'SITE_ORIGINS',
    '/healthz',
    '127\\.0\\.0\\.1:\\d+',
  ],
};
