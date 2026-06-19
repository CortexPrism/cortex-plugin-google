/**
 * Google Docs service — read, create, and update documents.
 */

import type { PluginContext, Tool, ToolResult } from 'cortex/plugins';
import { computeDuration, googleFetch } from '../auth.ts';

const DOCS_BASE = 'https://docs.googleapis.com/v1/documents';

export const docsGetTool: Tool = {
  definition: {
    name: 'docs_get',
    description: 'Read a Google Doc content by document ID',
    params: [
      {
        name: 'documentId',
        type: 'string',
        description: 'Google Docs document ID',
        required: true,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const documentId = args.documentId;
      if (!documentId || typeof documentId !== 'string') {
        return {
          toolName: 'docs_get',
          success: false,
          output: '',
          error: 'documentId must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      const url = `${DOCS_BASE}/${encodeURIComponent(documentId)}`;
      const response = await googleFetch(url, { method: 'GET' }, ctx);

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'docs_get',
          success: false,
          output: '',
          error: `Docs API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const data = await response.json() as Record<string, unknown>;

      // Extract text content from the document body
      const body = data.body as Record<string, unknown> | undefined;
      let textContent = '';
      if (body?.content && Array.isArray(body.content)) {
        textContent = extractTextFromDocContent(body.content as Record<string, unknown>[]);
      }

      const result = {
        documentId: data.documentId,
        title: data.title,
        revisionId: data.revisionId,
        suggestedViewStyle: data.suggestedViewStyle,
        textContent,
        textLength: textContent.length,
      };

      return {
        toolName: 'docs_get',
        success: true,
        output: JSON.stringify(result, null, 2),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'docs_get',
        success: false,
        output: '',
        error: `Docs get failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

/** Recursively extract text from Google Docs structural content. */
function extractTextFromDocContent(content: Record<string, unknown>[]): string {
  const parts: string[] = [];

  for (const element of content) {
    const paragraph = element.paragraph as Record<string, unknown> | undefined;
    if (paragraph?.elements && Array.isArray(paragraph.elements)) {
      for (const el of paragraph.elements as Record<string, unknown>[]) {
        const textRun = el.textRun as Record<string, unknown> | undefined;
        if (textRun?.content && typeof textRun.content === 'string') {
          parts.push(textRun.content);
        }
      }
      parts.push('\n');
    }

    const table = element.table as Record<string, unknown> | undefined;
    if (table?.tableRows && Array.isArray(table.tableRows)) {
      for (const row of table.tableRows as Record<string, unknown>[]) {
        const cells = row.tableCells as Record<string, unknown>[] | undefined;
        if (cells) {
          for (const cell of cells) {
            const cellContent = cell.content as Record<string, unknown>[] | undefined;
            if (cellContent) {
              parts.push(extractTextFromDocContent(cellContent));
            }
            parts.push('\t');
          }
          parts.push('\n');
        }
      }
      parts.push('\n');
    }

    // Handle section breaks
    if (element.sectionBreak) {
      parts.push('\n---\n');
    }
  }

  return parts.join('');
}

export const docsCreateTool: Tool = {
  definition: {
    name: 'docs_create',
    description: 'Create a new Google Doc',
    params: [
      { name: 'title', type: 'string', description: 'Document title', required: true },
      { name: 'content', type: 'string', description: 'Initial text content', required: false },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const title = args.title;
      if (!title || typeof title !== 'string') {
        return {
          toolName: 'docs_create',
          success: false,
          output: '',
          error: 'title must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      const body: Record<string, unknown> = { title };
      const initialContent = typeof args.content === 'string' ? args.content : '';

      if (initialContent) {
        body.initialContent = initialContent;
      }

      const response = await googleFetch(
        DOCS_BASE,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        ctx,
      );

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'docs_create',
          success: false,
          output: '',
          error: `Docs API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const result = await response.json() as Record<string, unknown>;

      // If initial content was provided, append it
      if (initialContent && result.documentId) {
        await googleFetch(
          `${DOCS_BASE}/${encodeURIComponent(result.documentId as string)}:batchUpdate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [
                {
                  insertText: {
                    location: { index: 1 },
                    text: initialContent,
                  },
                },
              ],
            }),
          },
          ctx,
        );
      }

      return {
        toolName: 'docs_create',
        success: true,
        output: JSON.stringify(
          {
            documentId: result.documentId,
            title: result.title,
            url: `https://docs.google.com/document/d/${result.documentId}/edit`,
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'docs_create',
        success: false,
        output: '',
        error: `Docs create failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const docsUpdateTool: Tool = {
  definition: {
    name: 'docs_update',
    description: 'Append content to an existing Google Doc',
    params: [
      {
        name: 'documentId',
        type: 'string',
        description: 'Google Docs document ID',
        required: true,
      },
      { name: 'content', type: 'string', description: 'Text to append', required: true },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const documentId = args.documentId;
      const content = args.content;

      if (!documentId || typeof documentId !== 'string') {
        return {
          toolName: 'docs_update',
          success: false,
          output: '',
          error: 'documentId must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }
      if (!content || typeof content !== 'string') {
        return {
          toolName: 'docs_update',
          success: false,
          output: '',
          error: 'content must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      // First get the document to find the end position
      const getResponse = await googleFetch(
        `${DOCS_BASE}/${encodeURIComponent(documentId)}`,
        { method: 'GET' },
        ctx,
      );

      if (!getResponse.ok) {
        const errorBody = await getResponse.text();
        return {
          toolName: 'docs_update',
          success: false,
          output: '',
          error: `Docs API error (${getResponse.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const docData = await getResponse.json() as Record<string, unknown>;
      const body = docData.body as Record<string, unknown> | undefined;
      const docContent = body?.content as Record<string, unknown>[] | undefined;

      // Find the end index
      let endIndex = 1; // default start
      if (docContent && Array.isArray(docContent)) {
        for (const el of docContent) {
          const elEndIndex = el.endIndex as number | undefined;
          if (elEndIndex && elEndIndex > endIndex) {
            endIndex = elEndIndex;
          }
        }
      }

      // Append text at the end
      const updateResponse = await googleFetch(
        `${DOCS_BASE}/${encodeURIComponent(documentId)}:batchUpdate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [
              {
                insertText: {
                  location: { index: endIndex },
                  text: `\n${content}`,
                },
              },
            ],
          }),
        },
        ctx,
      );

      if (!updateResponse.ok) {
        const errorBody = await updateResponse.text();
        return {
          toolName: 'docs_update',
          success: false,
          output: '',
          error: `Docs API error (${updateResponse.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const result = await updateResponse.json() as Record<string, unknown>;
      return {
        toolName: 'docs_update',
        success: true,
        output: JSON.stringify(
          {
            documentId,
            replies: result.replies,
            url: `https://docs.google.com/document/d/${documentId}/edit`,
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'docs_update',
        success: false,
        output: '',
        error: `Docs update failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const docsTools: Tool[] = [
  docsGetTool,
  docsCreateTool,
  docsUpdateTool,
];
