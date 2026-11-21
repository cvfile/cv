// The tool results of one answer, read back from the turn as JSON for the cards. A tool error, or a result
// still running, gives nothing.

import type { ChatTurn } from '@tensorpass/aiconnect-react';

export function resultsOf<T>(turn: ChatTurn, tool: string): T[] {
  return turn.tools.flatMap((activity) => {
    if (activity.call.name !== tool || !activity.result) {
      return [];
    }
    try {
      return [JSON.parse(activity.result) as T];
    } catch {
      return [];
    }
  });
}
