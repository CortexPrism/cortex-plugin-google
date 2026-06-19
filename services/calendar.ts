/**
 * Google Calendar service — list, create, update, and delete events.
 */

import type { PluginContext, Tool, ToolResult } from 'cortex/plugins';
import { computeDuration, googleFetch } from '../auth.ts';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

/** Validate ISO 8601 datetime string. */
function isValidISODate(str: string): boolean {
  return !isNaN(Date.parse(str));
}

export const calendarListEventsTool: Tool = {
  definition: {
    name: 'calendar_list_events',
    description: 'List calendar events with optional time range and filters',
    params: [
      { name: 'calendarId', type: 'string', description: 'Calendar ID', required: false },
      { name: 'timeMin', type: 'string', description: 'Start time (ISO 8601)', required: false },
      { name: 'timeMax', type: 'string', description: 'End time (ISO 8601)', required: false },
      { name: 'maxResults', type: 'number', description: 'Max events (1-2500)', required: false },
      { name: 'query', type: 'string', description: 'Free-text search', required: false },
      {
        name: 'singleEvents',
        type: 'boolean',
        description: 'Expand recurring events',
        required: false,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const calendarId = encodeURIComponent(
        typeof args.calendarId === 'string' ? args.calendarId : 'primary',
      );
      const timeMin = typeof args.timeMin === 'string' ? args.timeMin : undefined;
      const timeMax = typeof args.timeMax === 'string' ? args.timeMax : undefined;
      const maxResults = Math.min(
        Math.max(typeof args.maxResults === 'number' ? args.maxResults : 50, 1),
        2500,
      );
      const query = typeof args.query === 'string' ? args.query : undefined;
      const singleEvents = args.singleEvents !== false;

      // Validate ISO dates
      if (timeMin && !isValidISODate(timeMin)) {
        return {
          toolName: 'calendar_list_events',
          success: false,
          output: '',
          error: 'timeMin is not a valid ISO 8601 date',
          durationMs: computeDuration(start),
        };
      }
      if (timeMax && !isValidISODate(timeMax)) {
        return {
          toolName: 'calendar_list_events',
          success: false,
          output: '',
          error: 'timeMax is not a valid ISO 8601 date',
          durationMs: computeDuration(start),
        };
      }

      const params = new URLSearchParams({
        maxResults: String(maxResults),
        singleEvents: String(singleEvents),
        orderBy: 'startTime',
      });
      if (timeMin) params.set('timeMin', timeMin);
      if (timeMax) params.set('timeMax', timeMax);
      if (query) params.set('q', query);

      const url = `${CALENDAR_BASE}/calendars/${calendarId}/events?${params.toString()}`;
      const response = await googleFetch(url, { method: 'GET' }, ctx);

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'calendar_list_events',
          success: false,
          output: '',
          error: `Calendar API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const data = await response.json() as {
        items?: Record<string, unknown>[];
        summary?: string;
        timeZone?: string;
      };

      return {
        toolName: 'calendar_list_events',
        success: true,
        output: JSON.stringify(
          {
            calendar: data.summary,
            timeZone: data.timeZone,
            items: data.items ?? [],
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'calendar_list_events',
        success: false,
        output: '',
        error: `Calendar list failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const calendarCreateEventTool: Tool = {
  definition: {
    name: 'calendar_create_event',
    description: 'Create a new calendar event',
    params: [
      { name: 'summary', type: 'string', description: 'Event title', required: true },
      { name: 'startDateTime', type: 'string', description: 'Start (ISO 8601)', required: true },
      { name: 'endDateTime', type: 'string', description: 'End (ISO 8601)', required: true },
      { name: 'description', type: 'string', description: 'Event description', required: false },
      { name: 'location', type: 'string', description: 'Event location', required: false },
      { name: 'calendarId', type: 'string', description: 'Calendar ID', required: false },
      {
        name: 'attendees',
        type: 'string',
        description: 'Comma-separated attendee emails',
        required: false,
      },
      {
        name: 'timeZone',
        type: 'string',
        description: 'Time zone (e.g., America/New_York)',
        required: false,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const summary = args.summary;
      const startDateTime = args.startDateTime;
      const endDateTime = args.endDateTime;

      if (!summary || typeof summary !== 'string') {
        return {
          toolName: 'calendar_create_event',
          success: false,
          output: '',
          error: 'summary must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }
      if (!startDateTime || typeof startDateTime !== 'string' || !isValidISODate(startDateTime)) {
        return {
          toolName: 'calendar_create_event',
          success: false,
          output: '',
          error: 'startDateTime must be a valid ISO 8601 date string',
          durationMs: computeDuration(start),
        };
      }
      if (!endDateTime || typeof endDateTime !== 'string' || !isValidISODate(endDateTime)) {
        return {
          toolName: 'calendar_create_event',
          success: false,
          output: '',
          error: 'endDateTime must be a valid ISO 8601 date string',
          durationMs: computeDuration(start),
        };
      }

      const calendarId = encodeURIComponent(
        typeof args.calendarId === 'string' ? args.calendarId : 'primary',
      );
      const timeZone = typeof args.timeZone === 'string' ? args.timeZone : undefined;

      const event: Record<string, unknown> = {
        summary,
        start: { dateTime: startDateTime, timeZone },
        end: { dateTime: endDateTime, timeZone },
      };

      if (typeof args.description === 'string' && args.description) {
        event.description = args.description;
      }
      if (typeof args.location === 'string' && args.location) {
        event.location = args.location;
      }
      if (typeof args.attendees === 'string' && args.attendees) {
        event.attendees = args.attendees.split(',').map((e) => ({ email: e.trim() }));
      }

      const response = await googleFetch(
        `${CALENDAR_BASE}/calendars/${calendarId}/events`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        },
        ctx,
      );

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'calendar_create_event',
          success: false,
          output: '',
          error: `Calendar API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const result = await response.json() as Record<string, unknown>;
      return {
        toolName: 'calendar_create_event',
        success: true,
        output: JSON.stringify(
          {
            id: result.id,
            htmlLink: result.htmlLink,
            summary: result.summary,
            start: result.start,
            end: result.end,
          },
          null,
          2,
        ),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'calendar_create_event',
        success: false,
        output: '',
        error: `Calendar create failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const calendarUpdateEventTool: Tool = {
  definition: {
    name: 'calendar_update_event',
    description: 'Update an existing calendar event',
    params: [
      { name: 'eventId', type: 'string', description: 'Event ID to update', required: true },
      { name: 'summary', type: 'string', description: 'New title', required: false },
      {
        name: 'startDateTime',
        type: 'string',
        description: 'New start (ISO 8601)',
        required: false,
      },
      { name: 'endDateTime', type: 'string', description: 'New end (ISO 8601)', required: false },
      { name: 'description', type: 'string', description: 'New description', required: false },
      { name: 'location', type: 'string', description: 'New location', required: false },
      { name: 'calendarId', type: 'string', description: 'Calendar ID', required: false },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const eventId = args.eventId;
      if (!eventId || typeof eventId !== 'string') {
        return {
          toolName: 'calendar_update_event',
          success: false,
          output: '',
          error: 'eventId must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      const calendarId = encodeURIComponent(
        typeof args.calendarId === 'string' ? args.calendarId : 'primary',
      );

      // Build partial update body
      const body: Record<string, unknown> = {};
      if (typeof args.summary === 'string') body.summary = args.summary;
      if (typeof args.description === 'string') body.description = args.description;
      if (typeof args.location === 'string') body.location = args.location;
      if (typeof args.startDateTime === 'string') {
        if (!isValidISODate(args.startDateTime)) {
          return {
            toolName: 'calendar_update_event',
            success: false,
            output: '',
            error: 'startDateTime is not a valid ISO 8601 date',
            durationMs: computeDuration(start),
          };
        }
        body.start = { dateTime: args.startDateTime };
      }
      if (typeof args.endDateTime === 'string') {
        if (!isValidISODate(args.endDateTime)) {
          return {
            toolName: 'calendar_update_event',
            success: false,
            output: '',
            error: 'endDateTime is not a valid ISO 8601 date',
            durationMs: computeDuration(start),
          };
        }
        body.end = { dateTime: args.endDateTime };
      }

      if (Object.keys(body).length === 0) {
        return {
          toolName: 'calendar_update_event',
          success: false,
          output: '',
          error: 'No update fields provided',
          durationMs: computeDuration(start),
        };
      }

      const response = await googleFetch(
        `${CALENDAR_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        ctx,
      );

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'calendar_update_event',
          success: false,
          output: '',
          error: `Calendar API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const result = await response.json() as Record<string, unknown>;
      return {
        toolName: 'calendar_update_event',
        success: true,
        output: JSON.stringify(result, null, 2),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'calendar_update_event',
        success: false,
        output: '',
        error: `Calendar update failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const calendarDeleteEventTool: Tool = {
  definition: {
    name: 'calendar_delete_event',
    description: 'Delete a calendar event',
    params: [
      { name: 'eventId', type: 'string', description: 'Event ID to delete', required: true },
      { name: 'calendarId', type: 'string', description: 'Calendar ID', required: false },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const eventId = args.eventId;
      if (!eventId || typeof eventId !== 'string') {
        return {
          toolName: 'calendar_delete_event',
          success: false,
          output: '',
          error: 'eventId must be a non-empty string',
          durationMs: computeDuration(start),
        };
      }

      const calendarId = encodeURIComponent(
        typeof args.calendarId === 'string' ? args.calendarId : 'primary',
      );

      const response = await googleFetch(
        `${CALENDAR_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
        { method: 'DELETE' },
        ctx,
      );

      // 204 No Content = success
      if (response.status !== 204 && !response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'calendar_delete_event',
          success: false,
          output: '',
          error: `Calendar API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      return {
        toolName: 'calendar_delete_event',
        success: true,
        output: JSON.stringify({ deleted: true, eventId }, null, 2),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'calendar_delete_event',
        success: false,
        output: '',
        error: `Calendar delete failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const calendarListCalendarsTool: Tool = {
  definition: {
    name: 'calendar_list_calendars',
    description: 'List all calendars the user has access to',
    params: [],
    capabilities: ['network:fetch'],
  },
  execute: async (_args: Record<string, unknown>, ctx: PluginContext): Promise<ToolResult> => {
    const start = Date.now();
    try {
      const response = await googleFetch(
        `${CALENDAR_BASE}/users/me/calendarList`,
        { method: 'GET' },
        ctx,
      );

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          toolName: 'calendar_list_calendars',
          success: false,
          output: '',
          error: `Calendar API error (${response.status}): ${errorBody}`,
          durationMs: computeDuration(start),
        };
      }

      const data = await response.json() as { items?: Record<string, unknown>[] };
      return {
        toolName: 'calendar_list_calendars',
        success: true,
        output: JSON.stringify({ calendars: data.items ?? [] }, null, 2),
        durationMs: computeDuration(start),
      };
    } catch (error) {
      return {
        toolName: 'calendar_list_calendars',
        success: false,
        output: '',
        error: `Failed to list calendars: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: computeDuration(start),
      };
    }
  },
};

export const calendarTools: Tool[] = [
  calendarListEventsTool,
  calendarCreateEventTool,
  calendarUpdateEventTool,
  calendarDeleteEventTool,
  calendarListCalendarsTool,
];
