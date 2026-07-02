#!/usr/bin/env node
/**
 * stdio entry point: `npx @cvfile/mcp` (or the `cvfile-mcp` bin) runs the
 * server for MCP clients like Claude Desktop, Claude Code, and Cursor.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createCvMcpServer } from './server.js';

const server = createCvMcpServer(
  process.env.CVFILE_MCP_MODEL ? { model: process.env.CVFILE_MCP_MODEL } : {},
);

await server.connect(new StdioServerTransport());
