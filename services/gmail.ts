/**
 * Gmail service — list, read, send, search, and modify emails.
 */

import type { PluginContext, Tool, ToolResult } from 'cortex/plugins';
import { computeDuration, googleFetch } from '../auth.ts';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** Decode a Gmail base64url-encoded message body to UTF-8 text. */
function decodeBase64Url(encoded: string): string {
  // Restore standard base64 padding/characters
  let safe = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (safe.length % 4) safe += '=';
  try {
    const bytes = Uint8Array.from(atob(safe), (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return `[Unable to decode body: ${encoded.slice(0, 60)}…]`;
  }
}

/** Extract plain text from a Gmail message payload recursively. */
function extractTextFromPayload(payload: Record<string, unknown>): string {
  // If this part has a body with data, decode it
  const body = payload.body as Record<string, unknown> | undefined;
  if (body?.data && typeof body.data === 'string') {
    return decodeBase64Url(body.data);
  }
  // Otherwise recurse into parts
  const parts = payload.parts as Record<string, unknown>[] | undefined;
  if (parts && Array.isArray(parts)) {
    return parts.map((p) => extractTextFromPayload(p)).join('\n');
  }
  return '';
}

export const gmailListTool: Tool = {
  definition: {
    name: 'gmail_list',
    description: 'List Gmail messages with optional filters',
    params: [
      { name: 'query', type: 'string', description: 'Gmail search query', required: false },
      { name: 'maxResults', type: 'number', description: 'Max messages (1-500)', required: false },
      {
        name: 'labelIds',
        type: 'string',
        description: 'Comma-separated label IDs',
        required: false,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const maxResults = Math.min(
        Math.max(typeof args.maxResults === 'number' ? args.maxResults : 20, 1),
        500,
      );
      const query = typeof args.query === 'string' ? args.query : undefined;
      const labelIds = typeof args.labelIds === 'string'
        ? args.labelIds.split(',').map((s) => s.trim())
        : undefined;

      const params = new URLSearchParams({ maxResults: String(maxResults) });
      if (query) params.set('q', query);
      if (labelIds?.length) {
        labelIds.forEach((id) => params.append('labelIds', id));
      }

      const url = `${GMAIL_BASE}/messages?${params.toString()}`;
      const response = await googleFetch(url, { method: 'GET' }, ctx);

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'gmail_list',
          success: false,
          output: '',
          error: `Gmail API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const data = await response.json() as {
        messages?: { id: string; threadId: string }[];
        resultSizeEstimate?: number;
      };
      const messages = data.messages ?? [];

      // Fetch a summary for each message
      const summaries = await Promise.all(
        messages.map(async (msg) => {
          try {
            const metaUrl =
              `${GMAIL_BASE}/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
            const metaRes = await googleFetch(metaUrl, { method: 'GET' }, ctx);
            if (!metaRes.ok) return { id: msg.id, error: 'Failed to fetch metadata' };
            const meta = await metaRes.json() as {
              id: string;
              threadId?: string;
              labelIds?: string[];
              payload?: { headers?: { name: string; value: string }[] };
            };
            const headers = meta.payload?.headers ?? [];
            const getHeader = (name: string) =>
              headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
            return {
              id: meta.id,
              threadId: meta.threadId,
              from: getHeader('From'),
              subject: getHeader('Subject'),
              date: getHeader('Date'),
              labels: meta.labelIds ?? [],
            };
          } catch {
            return { id: msg.id, error: 'Failed to fetch metadata' };
          }
        }),
      );

      return {
        toolName: 'gmail_list',
        success: true,
        output: JSON.stringify(
          { messages: summaries, totalEstimate: data.resultSizeEstimate ?? 0 },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'gmail_list',
        success: false,
        output: '',
        error: `Gmail list failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const gmailGetTool: Tool = {
  definition: {
    name: 'gmail_get',
    description: 'Get full content of a Gmail message by ID',
    params: [
      { name: 'messageId', type: 'string', description: 'Gmail message ID', required: true },
      {
        name: 'format',
        type: 'string',
        description: 'Format: full, raw, minimal, metadata',
        required: false,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const messageId = args.messageId;
      if (!messageId || typeof messageId !== 'string') {
        return {
          toolName: 'gmail_get',
          success: false,
          output: '',
          error: 'messageId must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      const format = typeof args.format === 'string' ? args.format : 'full';
      if (!['full', 'raw', 'minimal', 'metadata'].includes(format)) {
        return {
          toolName: 'gmail_get',
          success: false,
          output: '',
          error: `Invalid format '${format}'. Must be one of: full, raw, minimal, metadata`,
          durationMs: computeDuration(start),
        };
      }

      const url = `${GMAIL_BASE}/messages/${encodeURIComponent(messageId)}?format=${format}`;
      const response = await googleFetch(url, { method: 'GET' }, ctx);

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'gmail_get',
          success: false,
          output: '',
          error: `Gmail API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const raw = await response.json() as Record<string, unknown>;
      const payload = raw.payload as Record<string, unknown> | undefined;

      // Extract and decode body text for 'full' format
      let bodyText = '';
      if (payload) {
        bodyText = extractTextFromPayload(payload);
      }

      const result: Record<string, unknown> = {
        id: raw.id,
        threadId: raw.threadId,
        labelIds: raw.labelIds,
        snippet: raw.snippet,
        internalDate: raw.internalDate,
        bodyPreview: bodyText.slice(0, 5000),
      };

      // Include headers
      const headers = payload?.headers as { name: string; value: string }[] | undefined;
      if (headers) {
        const headerMap: Record<string, string> = {};
        headers.forEach((h) => {
          headerMap[h.name] = h.value;
        });
        result.headers = headerMap;
      }

      return {
        toolName: 'gmail_get',
        success: true,
        output: JSON.stringify(result, null, 2),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'gmail_get',
        success: false,
        output: '',
        error: `Gmail get failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const gmailSendTool: Tool = {
  definition: {
    name: 'gmail_send',
    description: 'Send an email via Gmail',
    params: [
      { name: 'to', type: 'string', description: 'Recipient(s)', required: true },
      { name: 'subject', type: 'string', description: 'Subject', required: true },
      { name: 'body', type: 'string', description: 'Email body', required: true },
      { name: 'cc', type: 'string', description: 'CC recipients', required: false },
      { name: 'bcc', type: 'string', description: 'BCC recipients', required: false },
      { name: 'isHtml', type: 'boolean', description: 'Body is HTML', required: false },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const to = args.to;
      const subject = args.subject;
      const body = args.body;
      if (!to || typeof to !== 'string') {
        return {
          toolName: 'gmail_send',
          success: false,
          output: '',
          error: 'to must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }
      if (!subject || typeof subject !== 'string') {
        return {
          toolName: 'gmail_send',
          success: false,
          output: '',
          error: 'subject must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }
      if (!body || typeof body !== 'string') {
        return {
          toolName: 'gmail_send',
          success: false,
          output: '',
          error: 'body must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      const cc = typeof args.cc === 'string' ? args.cc : '';
      const bcc = typeof args.bcc === 'string' ? args.bcc : '';
      const isHtml = args.isHtml === true;
      const contentType = isHtml ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';

      // Build RFC 2822 email string
      let rawEmail =
        `To: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: ${contentType}\r\n`;
      if (cc) rawEmail += `Cc: ${cc}\r\n`;
      if (bcc) rawEmail += `Bcc: ${bcc}\r\n`;
      rawEmail += `\r\n${body}`;

      // Base64url encode
      const encoded = btoa(rawEmail).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const response = await googleFetch(
        `${GMAIL_BASE}/messages/send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: encoded }),
        },
        ctx,
      );

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'gmail_send',
          success: false,
          output: '',
          error: `Gmail API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const result = await response.json() as { id: string; threadId?: string };
      return {
        toolName: 'gmail_send',
        success: true,
        output: JSON.stringify({ id: result.id, threadId: result.threadId ?? result.id }, null, 2),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'gmail_send',
        success: false,
        output: '',
        error: `Gmail send failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const gmailSearchTool: Tool = {
  definition: {
    name: 'gmail_search',
    description: 'Search Gmail messages using Gmail search syntax',
    params: [
      { name: 'query', type: 'string', description: 'Gmail search query', required: true },
      { name: 'maxResults', type: 'number', description: 'Max results (1-500)', required: false },
    ],
    capabilities: ['network:fetch'],
  },
  execute: (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    // Reuses gmail_list with the query parameter
    return gmailListTool.execute(
      { query: args.query, maxResults: args.maxResults ?? 20 },
      ctx,
    );
  },
};

export const gmailModifyTool: Tool = {
  definition: {
    name: 'gmail_modify',
    description: 'Modify Gmail message labels (mark read, archive, trash, etc.)',
    params: [
      { name: 'messageId', type: 'string', description: 'Gmail message ID', required: true },
      {
        name: 'addLabelIds',
        type: 'string',
        description: 'Comma-separated labels to add',
        required: false,
      },
      {
        name: 'removeLabelIds',
        type: 'string',
        description: 'Comma-separated labels to remove',
        required: false,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const messageId = args.messageId;
      if (!messageId || typeof messageId !== 'string') {
        return {
          toolName: 'gmail_modify',
          success: false,
          output: '',
          error: 'messageId must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      const addLabels = typeof args.addLabelIds === 'string'
        ? args.addLabelIds.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const removeLabels = typeof args.removeLabelIds === 'string'
        ? args.removeLabelIds.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      if (addLabels.length === 0 && removeLabels.length === 0) {
        return {
          toolName: 'gmail_modify',
          success: false,
          output: '',
          error: 'Provide at least one label to add or remove',
          durationMs: computeDuration(start),
        };
      }

      const response = await googleFetch(
        `${GMAIL_BASE}/messages/${encodeURIComponent(messageId)}/modify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            addLabelIds: addLabels,
            removeLabelIds: removeLabels,
          }),
        },
        ctx,
      );

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'gmail_modify',
          success: false,
          output: '',
          error: `Gmail API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const result = await response.json() as { id: string; labelIds?: string[] };
      return {
        toolName: 'gmail_modify',
        success: true,
        output: JSON.stringify({ id: result.id, labelIds: result.labelIds }, null, 2),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'gmail_modify',
        success: false,
        output: '',
        error: `Gmail modify failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const gmailListLabelsTool: Tool = {
  definition: {
    name: 'gmail_list_labels',
    description: 'List all Gmail labels for the authenticated account',
    params: [],
    capabilities: ['network:fetch'],
  },
  execute: async (_args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const response = await googleFetch(`${GMAIL_BASE}/labels`, { method: 'GET' }, ctx);

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'gmail_list_labels',
          success: false,
          output: '',
          error: `Gmail API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const data = await response.json() as {
        labels?: {
          id: string;
          name: string;
          type: string;
          messageListVisibility?: string;
          labelListVisibility?: string;
        }[];
      };
      return {
        toolName: 'gmail_list_labels',
        success: true,
        output: JSON.stringify({ labels: data.labels ?? [] }, null, 2),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'gmail_list_labels',
        success: false,
        output: '',
        error: `Failed to list labels: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const gmailTools: Tool[] = [
  gmailListTool,
  gmailGetTool,
  gmailSendTool,
  gmailSearchTool,
  gmailModifyTool,
  gmailListLabelsTool,
];
