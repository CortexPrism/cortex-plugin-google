/**
 * Google Sheets service — read, write, create, and append data in spreadsheets.
 */

import type { PluginContext, Tool, ToolResult } from 'cortex/plugins';
import { computeDuration, googleFetch } from '../auth.ts';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Parse a JSON string into a 2D array of values. */
function parseValues(valuesStr: string): string[][] | null {
  try {
    const parsed = JSON.parse(valuesStr);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((row: unknown) => {
      if (!Array.isArray(row)) return [];
      return row.map((cell: unknown) => String(cell));
    });
  } catch {
    return null;
  }
}

export const sheetsGetValuesTool: Tool = {
  definition: {
    name: 'sheets_get_values',
    description: 'Read cell values from a Google Sheet',
    params: [
      { name: 'spreadsheetId', type: 'string', description: 'Spreadsheet ID', required: true },
      {
        name: 'range',
        type: 'string',
        description: 'A1 notation range (e.g., Sheet1!A1:D10)',
        required: true,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const spreadsheetId = args.spreadsheetId;
      const range = args.range;

      if (!spreadsheetId || typeof spreadsheetId !== 'string') {
        return {
          toolName: 'sheets_get_values',
          success: false,
          output: '',
          error: 'spreadsheetId must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }
      if (!range || typeof range !== 'string') {
        return {
          toolName: 'sheets_get_values',
          success: false,
          output: '',
          error: 'range must be a non-empty string (A1 notation)',
          durationMs: computeDuration(start),
        };
      }

      const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${
        encodeURIComponent(range)
      }?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
      const response = await googleFetch(url, { method: 'GET' }, ctx);

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'sheets_get_values',
          success: false,
          output: '',
          error: `Sheets API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const data = await response.json() as {
        range?: string;
        majorDimension?: string;
        values?: unknown[][];
      };

      return {
        toolName: 'sheets_get_values',
        success: true,
        output: JSON.stringify(
          {
            range: data.range,
            majorDimension: data.majorDimension,
            values: data.values ?? [],
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'sheets_get_values',
        success: false,
        output: '',
        error: `Sheets get values failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const sheetsUpdateValuesTool: Tool = {
  definition: {
    name: 'sheets_update_values',
    description: 'Write values to a Google Sheet range',
    params: [
      { name: 'spreadsheetId', type: 'string', description: 'Spreadsheet ID', required: true },
      { name: 'range', type: 'string', description: 'A1 notation range', required: true },
      { name: 'values', type: 'string', description: '2D JSON array of values', required: true },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const spreadsheetId = args.spreadsheetId;
      const range = args.range;
      const valuesStr = args.values;

      if (!spreadsheetId || typeof spreadsheetId !== 'string') {
        return {
          toolName: 'sheets_update_values',
          success: false,
          output: '',
          error: 'spreadsheetId must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }
      if (!range || typeof range !== 'string') {
        return {
          toolName: 'sheets_update_values',
          success: false,
          output: '',
          error: 'range must be a non-empty string (A1 notation)',
          durationMs: computeDuration(start),
        };
      }
      if (!valuesStr || typeof valuesStr !== 'string') {
        return {
          toolName: 'sheets_update_values',
          success: false,
          output: '',
          error: 'values must be a non-empty JSON string',
          durationMs: computeDuration(start),
        };
      }

      const parsed = parseValues(valuesStr);
      if (!parsed) {
        return {
          toolName: 'sheets_update_values',
          success: false,
          output: '',
          error: 'values must be a valid 2D JSON array like [["a","b"],["c","d"]]',
          durationMs: computeDuration(start),
        };
      }

      const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${
        encodeURIComponent(range)
      }?valueInputOption=USER_ENTERED`;
      const response = await googleFetch(
        url,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: parsed, majorDimension: 'ROWS' }),
        },
        ctx,
      );

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'sheets_update_values',
          success: false,
          output: '',
          error: `Sheets API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const data = await response.json() as {
        updatedRange?: string;
        updatedRows?: number;
        updatedColumns?: number;
      };
      return {
        toolName: 'sheets_update_values',
        success: true,
        output: JSON.stringify(
          {
            updatedRange: data.updatedRange,
            updatedRows: data.updatedRows,
            updatedColumns: data.updatedColumns,
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'sheets_update_values',
        success: false,
        output: '',
        error: `Sheets update failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const sheetsCreateTool: Tool = {
  definition: {
    name: 'sheets_create',
    description: 'Create a new Google Sheet',
    params: [
      { name: 'title', type: 'string', description: 'Spreadsheet title', required: true },
      {
        name: 'sheets',
        type: 'string',
        description: 'Comma-separated sheet tab names',
        required: false,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const title = args.title;
      if (!title || typeof title !== 'string') {
        return {
          toolName: 'sheets_create',
          success: false,
          output: '',
          error: 'title must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      const sheetNames = typeof args.sheets === 'string' && args.sheets.trim()
        ? args.sheets.split(',').map((s) => s.trim()).filter(Boolean)
        : ['Sheet1'];

      const sheets = sheetNames.map((name, index) => ({
        properties: { title: name, index },
      }));

      const response = await googleFetch(
        SHEETS_BASE,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            properties: { title },
            sheets,
          }),
        },
        ctx,
      );

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'sheets_create',
          success: false,
          output: '',
          error: `Sheets API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const result = await response.json() as { spreadsheetId?: string; spreadsheetUrl?: string };
      return {
        toolName: 'sheets_create',
        success: true,
        output: JSON.stringify(
          {
            spreadsheetId: result.spreadsheetId,
            spreadsheetUrl: result.spreadsheetUrl,
            sheets: sheetNames,
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'sheets_create',
        success: false,
        output: '',
        error: `Sheets create failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const sheetsAppendRowsTool: Tool = {
  definition: {
    name: 'sheets_append_rows',
    description: 'Append rows to a Google Sheet',
    params: [
      { name: 'spreadsheetId', type: 'string', description: 'Spreadsheet ID', required: true },
      {
        name: 'range',
        type: 'string',
        description: 'Range for append (e.g., Sheet1!A1:C1)',
        required: true,
      },
      { name: 'values', type: 'string', description: '2D JSON array of values', required: true },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const spreadsheetId = args.spreadsheetId;
      const range = args.range;
      const valuesStr = args.values;

      if (!spreadsheetId || typeof spreadsheetId !== 'string') {
        return {
          toolName: 'sheets_append_rows',
          success: false,
          output: '',
          error: 'spreadsheetId must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }
      if (!range || typeof range !== 'string') {
        return {
          toolName: 'sheets_append_rows',
          success: false,
          output: '',
          error: 'range must be a non-empty string (A1 notation)',
          durationMs: computeDuration(start),
        };
      }
      if (!valuesStr || typeof valuesStr !== 'string') {
        return {
          toolName: 'sheets_append_rows',
          success: false,
          output: '',
          error: 'values must be a non-empty JSON string',
          durationMs: computeDuration(start),
        };
      }

      const parsed = parseValues(valuesStr);
      if (!parsed) {
        return {
          toolName: 'sheets_append_rows',
          success: false,
          output: '',
          error: 'values must be a valid 2D JSON array',
          durationMs: computeDuration(start),
        };
      }

      const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${
        encodeURIComponent(range)
      }:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const response = await googleFetch(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: parsed, majorDimension: 'ROWS' }),
        },
        ctx,
      );

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'sheets_append_rows',
          success: false,
          output: '',
          error: `Sheets API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const data = await response.json() as {
        updates?: { updatedRange?: string; updatedRows?: number };
      };
      return {
        toolName: 'sheets_append_rows',
        success: true,
        output: JSON.stringify(
          {
            updatedRange: data.updates?.updatedRange,
            updatedRows: data.updates?.updatedRows,
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'sheets_append_rows',
        success: false,
        output: '',
        error: `Sheets append failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const sheetsGetSpreadsheetTool: Tool = {
  definition: {
    name: 'sheets_get_spreadsheet',
    description: 'Get spreadsheet metadata including sheet names and properties',
    params: [
      { name: 'spreadsheetId', type: 'string', description: 'Spreadsheet ID', required: true },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const spreadsheetId = args.spreadsheetId;
      if (!spreadsheetId || typeof spreadsheetId !== 'string') {
        return {
          toolName: 'sheets_get_spreadsheet',
          success: false,
          output: '',
          error: 'spreadsheetId must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}?includeGridData=false`;
      const response = await googleFetch(url, { method: 'GET' }, ctx);

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'sheets_get_spreadsheet',
          success: false,
          output: '',
          error: `Sheets API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const data = await response.json() as {
        spreadsheetId?: string;
        properties?: Record<string, unknown>;
        sheets?: { properties: Record<string, unknown> }[];
      };

      const sheetInfo = (data.sheets ?? []).map((s) => s.properties);

      return {
        toolName: 'sheets_get_spreadsheet',
        success: true,
        output: JSON.stringify(
          {
            spreadsheetId: data.spreadsheetId,
            properties: data.properties,
            sheets: sheetInfo,
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'sheets_get_spreadsheet',
        success: false,
        output: '',
        error: `Sheets get spreadsheet failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const sheetsTools: Tool[] = [
  sheetsGetValuesTool,
  sheetsUpdateValuesTool,
  sheetsCreateTool,
  sheetsAppendRowsTool,
  sheetsGetSpreadsheetTool,
];
