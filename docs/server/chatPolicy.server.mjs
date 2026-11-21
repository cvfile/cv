// The policy only the MCP server and the pen test import: the page's policy plus the names of the
// infrastructure behind cvfile.org, which no tool result and no answer should carry. HF_TOKEN stays out of
// this list: the READMEs document it as the variable of the hosted embedding backend.

import { chatPolicy as pagePolicy } from '../src/features/ai-mode/chatPolicy.mjs';

export const chatPolicy = {
  ...pagePolicy,
  denyPatterns: [
    ...pagePolicy.denyPatterns,
    'cvfile-site',
    'vps-automation',
    'deploy-app\\.sh',
    'hardened-service',
    '127\\.0\\.0\\.1:95\\d\\d',
    'markdown_twin',
    'edge_cloudflare_only',
  ],
};
