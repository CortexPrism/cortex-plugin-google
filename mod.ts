/**
 * CortexPrism Google Plugin
 *
 * Comprehensive Google Workspace integration — Gmail, Calendar, Drive,
 * Docs, Sheets, and Google News.
 *
 * ## Authentication
 *
 * ### Google OAuth 2.0 (for Gmail, Calendar, Drive, Docs, Sheets)
 * 1. Go to https://console.cloud.google.com/apis/credentials
 * 2. Create an OAuth 2.0 Client ID (Desktop application type)
 * 3. Add the following scopes:
 *    - https://www.googleapis.com/auth/gmail.modify
 *    - https://www.googleapis.com/auth/calendar.events
 *    - https://www.googleapis.com/auth/calendar.readonly
 *    - https://www.googleapis.com/auth/drive.file
 *    - https://www.googleapis.com/auth/documents
 *    - https://www.googleapis.com/auth/spreadsheets
 * 4. Generate a refresh token via the OAuth playground or your app's auth flow
 * 5. Configure in plugin settings (see Configuration section below)
 *
 * ### NewsAPI (for Google News)
 * 1. Register at https://newsapi.org/register for a free API key
 * 2. Configure newsapi.apiKey in plugin settings
 *
 * ## Configuration
 *
 * Add to your Cortex config:
 *
 * ```json
 * {
 *   "plugins": {
 *     "cortex-plugin-google": {
 *       "enabled": true,
 *       "config": {
 *         "google": {
 *           "clientId": "YOUR_CLIENT_ID",
 *           "clientSecret": "YOUR_CLIENT_SECRET",
 *           "refreshToken": "YOUR_REFRESH_TOKEN"
 *         },
 *         "newsapi": {
 *           "apiKey": "YOUR_NEWSAPI_KEY"
 *         }
 *       }
 *     }
 *   }
 * }
 * ```
 */

import type { PluginContext, Tool } from 'cortex/plugins';
import { gmailTools } from './services/gmail.ts';
import { calendarTools } from './services/calendar.ts';
import { driveTools } from './services/drive.ts';
import { docsTools } from './services/docs.ts';
import { sheetsTools } from './services/sheets.ts';
import { newsTools } from './services/news.ts';

/**
 * Lifecycle hook — called when plugin loads.
 * Validates that at least one auth method is configured.
 */
export async function onLoad(ctx: PluginContext): Promise<void> {
  await ctx.logger.info('[cortex-plugin-google] Loading Google Workspace plugin');

  // Check for Google OAuth config
  const google = await ctx.config?.get<Record<string, unknown>>?.('google');
  const newsapi = await ctx.config?.get<Record<string, unknown>>?.('newsapi');

  if (google?.clientId && google?.clientSecret && google?.refreshToken) {
    await ctx.logger.info(
      '[cortex-plugin-google] Google OAuth configured (Gmail, Calendar, Drive, Docs, Sheets)',
    );
  } else {
    await ctx.logger.warn(
      '[cortex-plugin-google] Google OAuth not fully configured. Set google.clientId, google.clientSecret, and google.refreshToken for Google API access.',
    );
  }

  if (newsapi?.apiKey) {
    await ctx.logger.info('[cortex-plugin-google] NewsAPI configured (Google News)');
  } else {
    await ctx.logger.warn(
      '[cortex-plugin-google] NewsAPI not configured. Set newsapi.apiKey for news search/headlines.',
    );
  }

  await ctx.logger.info(
    `[cortex-plugin-google] Loaded ${tools.length} tools across Gmail, Calendar, Drive, Docs, Sheets, and News`,
  );
}

/**
 * Lifecycle hook — called when plugin unloads.
 */
export async function onUnload(ctx: PluginContext): Promise<void> {
  await ctx.logger.info('[cortex-plugin-google] Unloading Google Workspace plugin');
}

/**
 * All exported tools — the plugin loader picks these up by name.
 * Organized by Google service:
 *
 * **Gmail:** gmail_list, gmail_get, gmail_send, gmail_search, gmail_modify, gmail_list_labels
 * **Calendar:** calendar_list_events, calendar_create_event, calendar_update_event, calendar_delete_event, calendar_list_calendars
 * **Drive:** drive_list_files, drive_get_file, drive_upload_file, drive_create_folder, drive_delete_file, drive_search
 * **Docs:** docs_get, docs_create, docs_update
 * **Sheets:** sheets_get_values, sheets_update_values, sheets_create, sheets_append_rows, sheets_get_spreadsheet
 * **News:** news_get_headlines, news_search
 */
export const tools: Tool[] = [
  ...gmailTools,
  ...calendarTools,
  ...driveTools,
  ...docsTools,
  ...sheetsTools,
  ...newsTools,
];
