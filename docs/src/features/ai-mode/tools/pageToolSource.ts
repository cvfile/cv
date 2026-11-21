// One tool source for a page: the tools that run in the page on the file the visitor dropped, then the docs
// tools of the site's MCP server. The page tools never reach the server, so the dropped file stays in the
// browser.

import { McpToolSource } from '@tensorpass/aiconnect';
import type { ToolDefinition, ToolSource } from '@tensorpass/aiconnect';

export const MCP_PATH = '/api/mcp';
const CLIENT_NAME = 'cvfile.org';

export interface PageTool {
  definition: ToolDefinition;
  // Returns the result the model reads, as JSON. A thrown error reaches the model as a tool error.
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export class PageToolSource implements ToolSource {
  private readonly pageTools: Map<string, PageTool>;
  private readonly server: ToolSource;

  constructor(pageTools: PageTool[], server: ToolSource = new McpToolSource(MCP_PATH, CLIENT_NAME)) {
    this.pageTools = new Map(pageTools.map((tool) => [tool.definition.name, tool]));
    this.server = server;
  }

  async listTools(): Promise<ToolDefinition[]> {
    const local = [...this.pageTools.values()].map((tool) => tool.definition);
    return [...local, ...await this.server.listTools()];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.pageTools.get(name);
    return tool ? JSON.stringify(await tool.run(args)) : this.server.callTool(name, args);
  }
}
