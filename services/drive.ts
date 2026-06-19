/**
 * Google Drive service — list, get, upload, create folders, delete, and search files.
 */

import type { PluginContext, Tool, ToolResult } from 'cortex/plugins';
import { computeDuration, googleFetch } from '../auth.ts';

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3/files';

export const driveListFilesTool: Tool = {
  definition: {
    name: 'drive_list_files',
    description: 'List files and folders in Google Drive',
    params: [
      {
        name: 'pageSize',
        type: 'number',
        description: 'Number of files (1-1000)',
        required: false,
      },
      { name: 'query', type: 'string', description: 'Drive search query', required: false },
      { name: 'orderBy', type: 'string', description: 'Sort order', required: false },
      {
        name: 'fields',
        type: 'string',
        description: 'Comma-separated fields to include',
        required: false,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const pageSize = Math.min(
        Math.max(typeof args.pageSize === 'number' ? args.pageSize : 20, 1),
        1000,
      );
      const query = typeof args.query === 'string' ? args.query : undefined;
      const orderBy = typeof args.orderBy === 'string' ? args.orderBy : 'modifiedTime desc,name';
      const fields = typeof args.fields === 'string'
        ? args.fields
        : 'files(id,name,mimeType,size,modifiedTime,webViewLink,owners)';

      const params = new URLSearchParams({
        pageSize: String(pageSize),
        orderBy,
        fields,
      });
      if (query) params.set('q', query);

      const url = `${DRIVE_BASE}?${params.toString()}&supportsAllDrives=true`;
      const response = await googleFetch(url, { method: 'GET' }, ctx);

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'drive_list_files',
          success: false,
          output: '',
          error: `Drive API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const data = await response.json() as {
        files?: Record<string, unknown>[];
        nextPageToken?: string;
      };
      return {
        toolName: 'drive_list_files',
        success: true,
        output: JSON.stringify(
          {
            files: data.files ?? [],
            nextPageToken: data.nextPageToken ?? null,
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'drive_list_files',
        success: false,
        output: '',
        error: `Drive list failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const driveGetFileTool: Tool = {
  definition: {
    name: 'drive_get_file',
    description: 'Get file metadata or download content from Google Drive',
    params: [
      { name: 'fileId', type: 'string', description: 'Drive file ID', required: true },
      { name: 'download', type: 'boolean', description: 'Download file content', required: false },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const fileId = args.fileId;
      if (!fileId || typeof fileId !== 'string') {
        return {
          toolName: 'drive_get_file',
          success: false,
          output: '',
          error: 'fileId must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      const download = args.download === true;
      const encodedId = encodeURIComponent(fileId);

      // Get metadata first
      const metaUrl =
        `${DRIVE_BASE}/${encodedId}?fields=id,name,mimeType,size,modifiedTime,webViewLink,createdTime,owners,lastModifyingUser&supportsAllDrives=true`;
      const metaResponse = await googleFetch(metaUrl, { method: 'GET' }, ctx);

      if (!metaResponse.ok) {
        const errorBody = await responseError(metaResponse);
        return {
          toolName: 'drive_get_file',
          success: false,
          output: '',
          error: `Drive API error (${metaResponse.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const metadata = await metaResponse.json() as Record<string, unknown>;

      if (!download) {
        return {
          toolName: 'drive_get_file',
          success: true,
          output: JSON.stringify({ metadata }, null, 2),
          durationMs: computeDuration(start),
        };
      }

      // Download content using export for Google-native types or alt=media for others
      let contentUrl: string;
      const mimeType = metadata.mimeType as string ?? '';

      if (mimeType === 'application/vnd.google-apps.document') {
        contentUrl = `${DRIVE_BASE}/${encodedId}/export?mimeType=text/plain`;
      } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        contentUrl = `${DRIVE_BASE}/${encodedId}/export?mimeType=text/csv`;
      } else if (mimeType === 'application/vnd.google-apps.presentation') {
        contentUrl = `${DRIVE_BASE}/${encodedId}/export?mimeType=text/plain`;
      } else {
        contentUrl = `${DRIVE_BASE}/${encodedId}?alt=media&supportsAllDrives=true`;
      }

      const contentResponse = await googleFetch(contentUrl, { method: 'GET' }, ctx);

      if (!contentResponse.ok) {
        return {
          toolName: 'drive_get_file',
          success: true, // metadata succeeded
          output: JSON.stringify(
            {
              metadata,
              contentError: `Failed to download content (${contentResponse.status})`,
              note:
                'File may be too large or not exportable as text. Try without download=true for metadata only.',
            },
            null,
            2,
          ),
          durationMs: computeDuration(start),
        };
      }

      const content = await contentResponse.text();

      return {
        toolName: 'drive_get_file',
        success: true,
        output: JSON.stringify(
          {
            metadata,
            contentPreview: content.slice(0, 100_000), // Limit to 100KB preview
            contentLength: content.length,
            truncated: content.length > 100_000,
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'drive_get_file',
        success: false,
        output: '',
        error: `Drive get failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

/** Helper to read error response text */
async function responseError(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return `HTTP ${response.status}`;
  }
}

export const driveUploadFileTool: Tool = {
  definition: {
    name: 'drive_upload_file',
    description: 'Upload a file to Google Drive',
    params: [
      { name: 'name', type: 'string', description: 'Filename', required: true },
      {
        name: 'content',
        type: 'string',
        description: 'Base64 or plain text content',
        required: true,
      },
      { name: 'mimeType', type: 'string', description: 'MIME type', required: false },
      { name: 'parentFolderId', type: 'string', description: 'Parent folder ID', required: false },
      {
        name: 'isBase64',
        type: 'boolean',
        description: 'Content is base64-encoded',
        required: false,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const name = args.name;
      const content = args.content;

      if (!name || typeof name !== 'string') {
        return {
          toolName: 'drive_upload_file',
          success: false,
          output: '',
          error: 'name must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }
      if (!content || typeof content !== 'string') {
        return {
          toolName: 'drive_upload_file',
          success: false,
          output: '',
          error: 'content must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      const isBase64 = args.isBase64 === true;
      const mimeType = typeof args.mimeType === 'string' ? args.mimeType : 'text/plain';
      const parentFolderId = typeof args.parentFolderId === 'string'
        ? args.parentFolderId
        : undefined;

      // Step 1: Create file metadata
      const metadata: Record<string, unknown> = { name, mimeType };
      if (parentFolderId) {
        metadata.parents = [parentFolderId];
      }

      // Use multipart upload
      const boundary = `cortex_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      let bodyContent: string;

      if (isBase64) {
        // Decode base64 to bytes for the multipart body
        const binary = atob(content);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        // Use Blob for binary data
        const metadataPart =
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${
            JSON.stringify(metadata)
          }\r\n`;
        const filePart =
          `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${content}\r\n--${boundary}--`;

        // For binary content we need to use fetch with Blob
        const formBody = new Blob([
          metadataPart,
          filePart,
        ], { type: `multipart/related; boundary=${boundary}` });

        const uploadResponse = await googleFetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
          {
            method: 'POST',
            body: formBody,
          },
          ctx,
        );

        if (!uploadResponse.ok) {
          const errorBody = await uploadResponse.text();
          return {
            toolName: 'drive_upload_file',
            success: false,
            output: '',
            error: `Drive upload error (${uploadResponse.status}): ${errorBody}`,
            durationMs: computeDuration(start),
          };
        }

        const result = await uploadResponse.json() as Record<string, unknown>;
        return {
          toolName: 'drive_upload_file',
          success: true,
          output: JSON.stringify(
            {
              id: result.id,
              name: result.name,
              mimeType: result.mimeType,
              webViewLink: result.webViewLink,
            },
            null,
            2,
          ),
          durationMs: computeDuration(start),
        };
      }

      // Plain text upload
      bodyContent = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${
        JSON.stringify(metadata)
      }\r\n`;
      bodyContent += `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n`;
      bodyContent += `--${boundary}--`;

      const response = await googleFetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: bodyContent,
        },
        ctx,
      );

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'drive_upload_file',
          success: false,
          output: '',
          error: `Drive upload error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const result = await response.json() as Record<string, unknown>;
      return {
        toolName: 'drive_upload_file',
        success: true,
        output: JSON.stringify(
          {
            id: result.id,
            name: result.name,
            mimeType: result.mimeType,
            webViewLink: result.webViewLink,
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'drive_upload_file',
        success: false,
        output: '',
        error: `Drive upload failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const driveCreateFolderTool: Tool = {
  definition: {
    name: 'drive_create_folder',
    description: 'Create a new folder in Google Drive',
    params: [
      { name: 'name', type: 'string', description: 'Folder name', required: true },
      { name: 'parentFolderId', type: 'string', description: 'Parent folder ID', required: false },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const name = args.name;
      if (!name || typeof name !== 'string') {
        return {
          toolName: 'drive_create_folder',
          success: false,
          output: '',
          error: 'name must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      const metadata: Record<string, unknown> = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
      };
      if (typeof args.parentFolderId === 'string' && args.parentFolderId) {
        metadata.parents = [args.parentFolderId];
      }

      const response = await googleFetch(
        `${DRIVE_BASE}?supportsAllDrives=true`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metadata),
        },
        ctx,
      );

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'drive_create_folder',
          success: false,
          output: '',
          error: `Drive API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const result = await response.json() as Record<string, unknown>;
      return {
        toolName: 'drive_create_folder',
        success: true,
        output: JSON.stringify(
          {
            id: result.id,
            name: result.name,
            mimeType: result.mimeType,
            webViewLink: result.webViewLink,
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'drive_create_folder',
        success: false,
        output: '',
        error: `Drive create folder failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const driveDeleteFileTool: Tool = {
  definition: {
    name: 'drive_delete_file',
    description: 'Delete a file or folder from Google Drive (moves to trash)',
    params: [
      { name: 'fileId', type: 'string', description: 'File/folder ID to delete', required: true },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const fileId = args.fileId;
      if (!fileId || typeof fileId !== 'string') {
        return {
          toolName: 'drive_delete_file',
          success: false,
          output: '',
          error: 'fileId must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      const response = await googleFetch(
        `${DRIVE_BASE}/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
        { method: 'DELETE' },
        ctx,
      );

      // 204 No Content = success
      if (response.status !== 204 && !response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'drive_delete_file',
          success: false,
          output: '',
          error: `Drive API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      return {
        toolName: 'drive_delete_file',
        success: true,
        output: JSON.stringify({ deleted: true, fileId }, null, 2),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'drive_delete_file',
        success: false,
        output: '',
        error: `Drive delete failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const driveSearchTool: Tool = {
  definition: {
    name: 'drive_search',
    description: 'Search Google Drive for files by name, content, or type',
    params: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
      {
        name: 'pageSize',
        type: 'number',
        description: 'Number of results (1-100)',
        required: false,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const query = args.query;
      if (!query || typeof query !== 'string') {
        return Promise.resolve({
          toolName: 'drive_search',
          success: false,
          output: '',
          error: 'query must be a non-empty string',
          durationMs: computeDuration(start),
        });
      }

      // Delegate to list with the query parameter
      return driveListFilesTool.execute(
        {
          query,
          pageSize: Math.min(
            Math.max(typeof args.pageSize === 'number' ? args.pageSize : 20, 1),
            100,
          ),
          orderBy: 'modifiedTime desc',
          fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
        },
        ctx,
      );
    } catch (error) {
      return Promise.resolve({
        toolName: 'drive_search',
        success: false,
        output: '',
        error: `Drive search failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      });
    }
  },
};

export const driveTools: Tool[] = [
  driveListFilesTool,
  driveGetFileTool,
  driveUploadFileTool,
  driveCreateFolderTool,
  driveDeleteFileTool,
  driveSearchTool,
];
