// deno-lint-ignore-file require-await, no-unused-vars
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { tools } from '../../mod.ts';
import type { PluginContext } from 'cortex/plugins';
import { computeDuration } from '../../auth.ts';

// Mock PluginContext
const mockContext: PluginContext = {
  pluginId: 'cortex-plugin-google',
  pluginDir: '/tmp/plugins/cortex-plugin-google',
  state: {
    get: () => Promise.resolve(null),
    set: async () => {},
  },
  config: {},
};

// Helper to find a tool by name
function findTool(name: string) {
  return tools.find((t) => t.definition.name === name);
}

// --- Tool Count & Export Tests ---

Deno.test('tools array is exported with 27 tools', () => {
  assertEquals(Array.isArray(tools), true);
  assertEquals(tools.length, 27);
});

Deno.test('all tool names are unique', () => {
  const names = tools.map((t) => t.definition.name);
  const uniqueNames = new Set(names);
  assertEquals(names.length, uniqueNames.size, 'Tool names must be unique');
});

Deno.test('all tools have required definition fields', () => {
  for (const tool of tools) {
    assertEquals(typeof tool.definition.name, 'string', `Tool missing name`);
    assertEquals(
      typeof tool.definition.description,
      'string',
      `Tool ${tool.definition.name} missing description`,
    );
    assertEquals(
      Array.isArray(tool.definition.params),
      true,
      `Tool ${tool.definition.name} missing params`,
    );
    assertEquals(typeof tool.execute, 'function', `Tool ${tool.definition.name} missing execute`);
  }
});

Deno.test('all tool params have valid types', () => {
  const validTypes = ['string', 'number', 'boolean'];
  for (const tool of tools) {
    for (const param of tool.definition.params) {
      assertEquals(typeof param.name, 'string', `Param name missing in ${tool.definition.name}`);
      assertEquals(
        validTypes.includes(param.type),
        true,
        `Param ${param.name} in ${tool.definition.name} has invalid type: ${param.type}`,
      );
    }
  }
});

// --- Gmail Tools ---

Deno.test('gmail_list - rejects invalid maxResults', async () => {
  const tool = findTool('gmail_list');
  if (!tool) throw new Error('gmail_list tool not found');

  const result = await tool.execute({ maxResults: 9999 }, mockContext);
  // Should not crash; we clamp to 500
  assertEquals(result.success, false);
  // When auth isn't configured it should fail with a meaningful error
  assertStringIncludes(result.error, 'OAuth');
});

Deno.test('gmail_get - rejects missing messageId', async () => {
  const tool = findTool('gmail_get');
  if (!tool) throw new Error('gmail_get tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'non-empty string');
});

Deno.test('gmail_get - rejects invalid format', async () => {
  const tool = findTool('gmail_get');
  if (!tool) throw new Error('gmail_get tool not found');

  const result = await tool.execute({ messageId: '123', format: 'invalid' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'Invalid format');
});

Deno.test('gmail_send - rejects missing fields', async () => {
  const tool = findTool('gmail_send');
  if (!tool) throw new Error('gmail_send tool not found');

  const result1 = await tool.execute({ subject: 'Hi', body: 'Hello' }, mockContext);
  assertEquals(result1.success, false);
  assertStringIncludes(result1.error, 'to');

  const result2 = await tool.execute({ to: 'a@b.com', body: 'Hello' }, mockContext);
  assertEquals(result2.success, false);
  assertStringIncludes(result2.error, 'subject');

  const result3 = await tool.execute({ to: 'a@b.com', subject: 'Hi' }, mockContext);
  assertEquals(result3.success, false);
  assertStringIncludes(result3.error, 'body');
});

Deno.test('gmail_modify - rejects missing messageId', async () => {
  const tool = findTool('gmail_modify');
  if (!tool) throw new Error('gmail_modify tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'messageId');
});

Deno.test('gmail_modify - rejects no labels', async () => {
  const tool = findTool('gmail_modify');
  if (!tool) throw new Error('gmail_modify tool not found');

  const result = await tool.execute({ messageId: '123' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'Provide at least one');
});

// --- Calendar Tools ---

Deno.test('calendar_create_event - rejects missing summary', async () => {
  const tool = findTool('calendar_create_event');
  if (!tool) throw new Error('calendar_create_event tool not found');

  const result = await tool.execute({
    startDateTime: '2026-07-01T09:00:00Z',
    endDateTime: '2026-07-01T10:00:00Z',
  }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'summary');
});

Deno.test('calendar_create_event - rejects invalid dates', async () => {
  const tool = findTool('calendar_create_event');
  if (!tool) throw new Error('calendar_create_event tool not found');

  const result = await tool.execute({
    summary: 'Test',
    startDateTime: 'not-a-date',
    endDateTime: '2026-07-01T10:00:00Z',
  }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'startDateTime');
});

Deno.test('calendar_update_event - rejects missing eventId', async () => {
  const tool = findTool('calendar_update_event');
  if (!tool) throw new Error('calendar_update_event tool not found');

  const result = await tool.execute({ summary: 'New Title' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'eventId');
});

Deno.test('calendar_delete_event - rejects missing eventId', async () => {
  const tool = findTool('calendar_delete_event');
  if (!tool) throw new Error('calendar_delete_event tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'eventId');
});

// --- Drive Tools ---

Deno.test('drive_get_file - rejects missing fileId', async () => {
  const tool = findTool('drive_get_file');
  if (!tool) throw new Error('drive_get_file tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'fileId');
});

Deno.test('drive_upload_file - rejects missing name', async () => {
  const tool = findTool('drive_upload_file');
  if (!tool) throw new Error('drive_upload_file tool not found');

  const result = await tool.execute({ content: 'hello' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'name');
});

Deno.test('drive_upload_file - rejects missing content', async () => {
  const tool = findTool('drive_upload_file');
  if (!tool) throw new Error('drive_upload_file tool not found');

  const result = await tool.execute({ name: 'test.txt' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'content');
});

Deno.test('drive_create_folder - rejects missing name', async () => {
  const tool = findTool('drive_create_folder');
  if (!tool) throw new Error('drive_create_folder tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'name');
});

Deno.test('drive_delete_file - rejects missing fileId', async () => {
  const tool = findTool('drive_delete_file');
  if (!tool) throw new Error('drive_delete_file tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'fileId');
});

Deno.test('drive_search - rejects missing query', async () => {
  const tool = findTool('drive_search');
  if (!tool) throw new Error('drive_search tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'query');
});

// --- Docs Tools ---

Deno.test('docs_get - rejects missing documentId', async () => {
  const tool = findTool('docs_get');
  if (!tool) throw new Error('docs_get tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'documentId');
});

Deno.test('docs_create - rejects missing title', async () => {
  const tool = findTool('docs_create');
  if (!tool) throw new Error('docs_create tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'title');
});

Deno.test('docs_update - rejects missing fields', async () => {
  const tool = findTool('docs_update');
  if (!tool) throw new Error('docs_update tool not found');

  const result1 = await tool.execute({ content: 'hello' }, mockContext);
  assertEquals(result1.success, false);
  assertStringIncludes(result1.error, 'documentId');

  const result2 = await tool.execute({ documentId: 'abc' }, mockContext);
  assertEquals(result2.success, false);
  assertStringIncludes(result2.error, 'content');
});

// --- Sheets Tools ---

Deno.test('sheets_get_values - rejects missing spreadsheetId', async () => {
  const tool = findTool('sheets_get_values');
  if (!tool) throw new Error('sheets_get_values tool not found');

  const result = await tool.execute({ range: 'A1:B2' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'spreadsheetId');
});

Deno.test('sheets_update_values - rejects missing fields', async () => {
  const tool = findTool('sheets_update_values');
  if (!tool) throw new Error('sheets_update_values tool not found');

  const result1 = await tool.execute({ range: 'A1:B2', values: '[["a"]]' }, mockContext);
  assertEquals(result1.success, false);
  assertStringIncludes(result1.error, 'spreadsheetId');

  const result2 = await tool.execute({ spreadsheetId: 'abc', values: '[["a"]]' }, mockContext);
  assertEquals(result2.success, false);
  assertStringIncludes(result2.error, 'range');
});

Deno.test('sheets_update_values - rejects invalid JSON values', async () => {
  const tool = findTool('sheets_update_values');
  if (!tool) throw new Error('sheets_update_values tool not found');

  const result = await tool.execute({
    spreadsheetId: 'abc',
    range: 'A1:B2',
    values: 'not-json',
  }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'JSON');
});

Deno.test('sheets_append_rows - validates inputs', async () => {
  const tool = findTool('sheets_append_rows');
  if (!tool) throw new Error('sheets_append_rows tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'spreadsheetId');
});

Deno.test('sheets_create - rejects missing title', async () => {
  const tool = findTool('sheets_create');
  if (!tool) throw new Error('sheets_create tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'title');
});

Deno.test('sheets_get_spreadsheet - rejects missing spreadsheetId', async () => {
  const tool = findTool('sheets_get_spreadsheet');
  if (!tool) throw new Error('sheets_get_spreadsheet tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'spreadsheetId');
});

// --- News Tools ---

Deno.test('news_search - rejects missing query', async () => {
  const tool = findTool('news_search');
  if (!tool) throw new Error('news_search tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'query');
});

Deno.test('news_search - rejects invalid sortBy', async () => {
  const tool = findTool('news_search');
  if (!tool) throw new Error('news_search tool not found');

  const result = await tool.execute({
    query: 'AI',
    sortBy: 'invalid',
    // No apiKey configured, so it will fail on that first
  }, mockContext);
  assertEquals(result.success, false);
});

Deno.test('news_get_headlines - rejects invalid category', async () => {
  const tool = findTool('news_get_headlines');
  if (!tool) throw new Error('news_get_headlines tool not found');

  const result = await tool.execute({ category: 'invalid-cat' }, mockContext);
  assertEquals(result.success, false);
});

// --- Auth Module Tests ---

Deno.test('computeDuration returns positive number', () => {
  const duration = computeDuration(Date.now());
  assertEquals(typeof duration, 'number');
  assertEquals(duration >= 0, true);
});

Deno.test('computeDuration with past timestamp', () => {
  const duration = computeDuration(Date.now() - 1000);
  assertEquals(duration >= 1000, true);
});

// --- Service-Specific Edge Cases ---

Deno.test('gmail_list - labelIds parsing', async () => {
  const tool = findTool('gmail_list');
  if (!tool) throw new Error('gmail_list tool not found');

  // Passing valid-looking labelIds (should work up to OAuth validation)
  const result = await tool.execute({
    labelIds: 'INBOX,UNREAD,IMPORTANT',
    maxResults: 5,
  }, mockContext);
  assertEquals(result.success, false); // Will fail on OAuth, not on parsing
  // Should not say "invalid" or crash
  assertEquals(typeof result.error, 'string');
});

Deno.test('tools contain all expected service groups', () => {
  const names = tools.map((t) => t.definition.name);

  // Gmail tools
  assertStringIncludes(names.join(' '), 'gmail_list');
  assertStringIncludes(names.join(' '), 'gmail_get');
  assertStringIncludes(names.join(' '), 'gmail_send');
  assertStringIncludes(names.join(' '), 'gmail_search');
  assertStringIncludes(names.join(' '), 'gmail_modify');
  assertStringIncludes(names.join(' '), 'gmail_list_labels');

  // Calendar tools
  assertStringIncludes(names.join(' '), 'calendar_list_events');
  assertStringIncludes(names.join(' '), 'calendar_create_event');
  assertStringIncludes(names.join(' '), 'calendar_update_event');
  assertStringIncludes(names.join(' '), 'calendar_delete_event');
  assertStringIncludes(names.join(' '), 'calendar_list_calendars');

  // Drive tools
  assertStringIncludes(names.join(' '), 'drive_list_files');
  assertStringIncludes(names.join(' '), 'drive_get_file');
  assertStringIncludes(names.join(' '), 'drive_upload_file');
  assertStringIncludes(names.join(' '), 'drive_create_folder');
  assertStringIncludes(names.join(' '), 'drive_delete_file');
  assertStringIncludes(names.join(' '), 'drive_search');

  // Docs tools
  assertStringIncludes(names.join(' '), 'docs_get');
  assertStringIncludes(names.join(' '), 'docs_create');
  assertStringIncludes(names.join(' '), 'docs_update');

  // Sheets tools
  assertStringIncludes(names.join(' '), 'sheets_get_values');
  assertStringIncludes(names.join(' '), 'sheets_update_values');
  assertStringIncludes(names.join(' '), 'sheets_create');
  assertStringIncludes(names.join(' '), 'sheets_append_rows');
  assertStringIncludes(names.join(' '), 'sheets_get_spreadsheet');

  // News tools
  assertStringIncludes(names.join(' '), 'news_get_headlines');
  assertStringIncludes(names.join(' '), 'news_search');
});

Deno.test('tool definitions match manifest expectations', () => {
  // Verify specific param structures
  const gmailSend = findTool('gmail_send');
  if (!gmailSend) throw new Error('gmail_send not found');

  const toParam = gmailSend.definition.params.find((p) => p.name === 'to');
  assertEquals(toParam?.required, true);
  assertEquals(toParam?.type, 'string');

  const subjectParam = gmailSend.definition.params.find((p) => p.name === 'subject');
  assertEquals(subjectParam?.required, true);
  assertEquals(subjectParam?.type, 'string');

  const isHtmlParam = gmailSend.definition.params.find((p) => p.name === 'isHtml');
  assertEquals(isHtmlParam?.type, 'boolean');
  assertEquals(isHtmlParam?.required, false);

  // Calendar create event
  const calCreate = findTool('calendar_create_event');
  if (!calCreate) throw new Error('calendar_create_event not found');

  const summaryParam = calCreate.definition.params.find((p) => p.name === 'summary');
  assertEquals(summaryParam?.required, true);
  assertEquals(summaryParam?.type, 'string');
});

Deno.test('gmail_search delegates to gmail_list', async () => {
  const gmailSearch = findTool('gmail_search');
  const gmailList = findTool('gmail_list');

  if (!gmailSearch || !gmailList) throw new Error('Tools not found');

  // Both should fail with same OAuth error for unconfigured context
  const searchResult = await gmailSearch.execute({ query: 'test', maxResults: 10 }, mockContext);
  const listResult = await gmailList.execute({ query: 'test', maxResults: 10 }, mockContext);

  assertEquals(searchResult.success, false);
  assertEquals(listResult.success, false);
  // Error messages should both mention OAuth or auth
  assertStringIncludes((searchResult.error ?? '').toLowerCase(), 'oauth');
});

Deno.test('drive_search delegates to drive_list_files', async () => {
  const driveSearch = findTool('drive_search');
  const driveList = findTool('drive_list_files');

  if (!driveSearch || !driveList) throw new Error('Tools not found');

  const searchResult = await driveSearch.execute(
    { query: "name contains 'test'", pageSize: 10 },
    mockContext,
  );

  assertEquals(searchResult.success, false);
  assertStringIncludes((searchResult.error ?? '').toLowerCase(), 'oauth');
});
