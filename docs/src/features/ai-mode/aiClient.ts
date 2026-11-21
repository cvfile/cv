// The visitor's AI for the whole page: one AiConnect client shared by every island, which answers through
// the AI Wallet extension, or without it through a web sign in (OpenRouter, or the TensorPass plan with
// cvfile.org's public site key) that returns to /aiconnect/callback/.

import { AiConnect } from '@tensorpass/aiconnect';
import { PUBLIC_TENSORPASS_SITE_KEY } from 'astro:env/client';

export const SIGN_IN_CALLBACK = '/aiconnect/callback/';

let client: AiConnect | null = null;

export function aiClient(): AiConnect {
  client ??= new AiConnect({ siteKey: PUBLIC_TENSORPASS_SITE_KEY, signInCallback: SIGN_IN_CALLBACK });
  return client;
}
