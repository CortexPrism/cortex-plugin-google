/**
 * Google News service — search news and get top headlines via NewsAPI.
 *
 * Requires a NewsAPI.org API key configured in plugin config:
 *   newsapi.apiKey = "your-api-key"
 */

import type { PluginContext, Tool, ToolResult } from 'cortex/plugins';
import { computeDuration } from '../auth.ts';

const NEWSAPI_BASE = 'https://newsapi.org/v2';

/** Retrieve NewsAPI key from plugin configuration. */
function getApiKey(ctx: PluginContext): string | null {
  const newsapi = ctx.config?.get<Record<string, unknown>>?.('newsapi');
  if (!newsapi) return null;
  const apiKey = newsapi.apiKey as string | undefined;
  return apiKey || null;
}

/** Perform a fetch to NewsAPI with proper error handling. */
async function newsApiFetch(
  url: string,
  apiKey: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': apiKey,
        'User-Agent': 'CortexPrism-GooglePlugin/1.0.0',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json() as Record<string, unknown>;
    return {
      ok: response.ok,
      status: response.status,
      data,
      error: data.message as string | undefined,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, status: 0, data: null, error: 'NewsAPI request timed out (10 seconds)' };
    }
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const newsGetHeadlinesTool: Tool = {
  definition: {
    name: 'news_get_headlines',
    description: 'Get top news headlines. Requires a NewsAPI key configured in plugin settings.',
    params: [
      {
        name: 'country',
        type: 'string',
        description: 'Two-letter country code (e.g., us, gb)',
        required: false,
      },
      { name: 'category', type: 'string', description: 'News category', required: false },
      {
        name: 'maxResults',
        type: 'number',
        description: 'Number of headlines (1-100)',
        required: false,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return {
          toolName: 'news_get_headlines',
          success: false,
          output: '',
          error:
            'NewsAPI key not configured. Set "newsapi.apiKey" in plugin config. Get a free key at https://newsapi.org/register',
          durationMs: computeDuration(start),
        };
      }

      const country = typeof args.country === 'string' && args.country.length === 2
        ? args.country
        : 'us';
      const category = typeof args.category === 'string' ? args.category.toLowerCase() : undefined;
      const pageSize = Math.min(
        Math.max(typeof args.maxResults === 'number' ? args.maxResults : 10, 1),
        100,
      );

      const validCategories = [
        'business',
        'entertainment',
        'general',
        'health',
        'science',
        'sports',
        'technology',
      ];
      if (category && !validCategories.includes(category)) {
        return {
          toolName: 'news_get_headlines',
          success: false,
          output: '',
          error: `Invalid category '${category}'. Must be one of: ${validCategories.join(', ')}`,
          durationMs: computeDuration(start),
        };
      }

      const params = new URLSearchParams({
        country,
        pageSize: String(pageSize),
      });
      if (category) params.set('category', category);

      const url = `${NEWSAPI_BASE}/top-headlines?${params.toString()}`;
      const result = await newsApiFetch(url, apiKey);

      if (!result.ok || !result.data) {
        return {
          toolName: 'news_get_headlines',
          success: false,
          output: '',
          error: result.error || `NewsAPI error (${result.status})`,
          durationMs: computeDuration(start),
        };
      }

      const articles = result.data.articles as Record<string, unknown>[] | undefined;
      return {
        toolName: 'news_get_headlines',
        success: true,
        output: JSON.stringify(
          {
            totalResults: result.data.totalResults,
            articles: (articles ?? []).map((a) => ({
              title: a.title,
              description: a.description,
              source: (a.source as Record<string, unknown> | undefined)?.name,
              url: a.url,
              publishedAt: a.publishedAt,
              author: a.author,
            })),
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'news_get_headlines',
        success: false,
        output: '',
        error: `News headlines failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const newsSearchTool: Tool = {
  definition: {
    name: 'news_search',
    description:
      'Search Google News articles by keyword. Requires a NewsAPI key configured in plugin settings.',
    params: [
      { name: 'query', type: 'string', description: 'Search keywords', required: true },
      {
        name: 'maxResults',
        type: 'number',
        description: 'Number of results (1-100)',
        required: false,
      },
      {
        name: 'sortBy',
        type: 'string',
        description: 'Sort order: relevancy, popularity, publishedAt',
        required: false,
      },
      { name: 'from', type: 'string', description: 'Start date (ISO 8601)', required: false },
      { name: 'to', type: 'string', description: 'End date (ISO 8601)', required: false },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const query = args.query;
      if (!query || typeof query !== 'string') {
        return {
          toolName: 'news_search',
          success: false,
          output: '',
          error: 'query must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return {
          toolName: 'news_search',
          success: false,
          output: '',
          error: 'NewsAPI key not configured. Set "newsapi.apiKey" in plugin config.',
          durationMs: computeDuration(start),
        };
      }

      const pageSize = Math.min(
        Math.max(typeof args.maxResults === 'number' ? args.maxResults : 10, 1),
        100,
      );
      const sortBy = typeof args.sortBy === 'string' ? args.sortBy : 'publishedAt';
      const from = typeof args.from === 'string' ? args.from : undefined;
      const to = typeof args.to === 'string' ? args.to : undefined;

      const validSorts = ['relevancy', 'popularity', 'publishedAt'];
      if (!validSorts.includes(sortBy)) {
        return {
          toolName: 'news_search',
          success: false,
          output: '',
          error: `Invalid sortBy '${sortBy}'. Must be one of: ${validSorts.join(', ')}`,
          durationMs: computeDuration(start),
        };
      }

      const params = new URLSearchParams({
        q: query,
        pageSize: String(pageSize),
        sortBy,
      });
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const url = `${NEWSAPI_BASE}/everything?${params.toString()}`;
      const result = await newsApiFetch(url, apiKey);

      if (!result.ok || !result.data) {
        return {
          toolName: 'news_search',
          success: false,
          output: '',
          error: result.error || `NewsAPI error (${result.status})`,
          durationMs: computeDuration(start),
        };
      }

      const articles = result.data.articles as Record<string, unknown>[] | undefined;
      return {
        toolName: 'news_search',
        success: true,
        output: JSON.stringify(
          {
            totalResults: result.data.totalResults,
            articles: (articles ?? []).map((a) => ({
              title: a.title,
              description: a.description,
              source: (a.source as Record<string, unknown> | undefined)?.name,
              url: a.url,
              publishedAt: a.publishedAt,
              author: a.author,
            })),
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'news_search',
        success: false,
        output: '',
        error: `News search failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const newsTools: Tool[] = [
  newsGetHeadlinesTool,
  newsSearchTool,
];
