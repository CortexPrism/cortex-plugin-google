# CortexPrism Google Plugin

Comprehensive Google Workspace integration for Cortex agents — connect to **Gmail**, **Google
Calendar**, **Google Drive**, **Google Docs**, **Google Sheets**, and **Google News** through a
single plugin.

## Features

| Service         | Tools   | What You Can Do                                              |
| --------------- | ------- | ------------------------------------------------------------ |
| 📧 **Gmail**    | 6 tools | List, read, search, send, and label emails                   |
| 📅 **Calendar** | 5 tools | List, create, update, and delete events across calendars     |
| 📁 **Drive**    | 6 tools | List, upload, download, search, create folders, delete files |
| 📝 **Docs**     | 3 tools | Read, create, and append content to Google Docs              |
| 📊 **Sheets**   | 5 tools | Read, write, create, and append rows in spreadsheets         |
| 📰 **News**     | 2 tools | Search news articles and get top headlines                   |

**Total: 27 tools** across 6 Google services.

## Installation

```bash
# From marketplace
cortex plugin install marketplace:cortex-plugin-google

# From GitHub (for development)
cortex plugin install github:CortexPrism/cortex-plugin-google

# Local installation (for development)
cortex plugin install ./manifest.json
```

## Prerequisites

### 1. Google Cloud Project Setup

To use Gmail, Calendar, Drive, Docs, and Sheets tools, you need:

1. A **Google Cloud Project** with the following APIs enabled:
   - Gmail API
   - Google Calendar API
   - Google Drive API
   - Google Docs API
   - Google Sheets API

2. An **OAuth 2.0 Client ID** (Desktop application type):
   - Go to [Google Cloud Console > Credentials](https://console.cloud.google.com/apis/credentials)
   - Create OAuth 2.0 Client ID → Desktop application
   - Note your **Client ID** and **Client Secret**

3. A **Refresh Token**:
   - Use the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)
   - Configure with your Client ID and Secret
   - Request these scopes:
     ```
     https://www.googleapis.com/auth/gmail.modify
     https://www.googleapis.com/auth/calendar.events
     https://www.googleapis.com/auth/calendar.readonly
     https://www.googleapis.com/auth/drive.file
     https://www.googleapis.com/auth/documents
     https://www.googleapis.com/auth/spreadsheets
     ```
   - Exchange the authorization code for a refresh token

### 2. NewsAPI Setup (Optional)

For news search and headlines, get a free API key from [NewsAPI.org](https://newsapi.org/register).

## Configuration

Add to your Cortex configuration (`~/.cortex/config.json`):

```json
{
  "plugins": {
    "cortex-plugin-google": {
      "enabled": true,
      "config": {
        "google": {
          "clientId": "YOUR_CLIENT_ID",
          "clientSecret": "YOUR_CLIENT_SECRET",
          "refreshToken": "YOUR_REFRESH_TOKEN"
        },
        "newsapi": {
          "apiKey": "YOUR_NEWSAPI_KEY"
        }
      }
    }
  }
}
```

## Quick Start

After installation and configuration:

```bash
# List available Google tools
cortex tools list | grep google

# List your inbox
cortex tool call gmail_list '{"maxResults": 5}'

# Check your calendar
cortex tool call calendar_list_events '{"maxResults": 5}'

# Search news about AI
cortex tool call news_search '{"query": "artificial intelligence", "maxResults": 3}'

# Use in an agent session
cortex chat --plugin cortex-plugin-google
```

## Tools Reference

### Gmail

#### `gmail_list`

List Gmail messages with optional filters.

**Parameters:**

- `query` (string, optional) — Gmail search query (e.g., `from:alice is:unread`)
- `maxResults` (number, optional, default: 20, max: 500) — Maximum messages to return
- `labelIds` (string, optional) — Comma-separated label IDs (e.g., `INBOX,UNREAD`)

#### `gmail_get`

Get full content of a Gmail message.

**Parameters:**

- `messageId` (string, required) — Gmail message ID
- `format` (string, optional) — `full`, `raw`, `minimal`, or `metadata`

#### `gmail_send`

Send an email via Gmail.

**Parameters:**

- `to` (string, required) — Recipient(s), comma-separated
- `subject` (string, required) — Email subject
- `body` (string, required) — Email body
- `cc` (string, optional) — CC recipient(s), comma-separated
- `bcc` (string, optional) — BCC recipient(s), comma-separated
- `isHtml` (boolean, optional) — Set true if body is HTML

#### `gmail_search`

Search Gmail using Gmail search syntax.

**Parameters:**

- `query` (string, required) — Search query with operators
- `maxResults` (number, optional, default: 20)

#### `gmail_modify`

Modify Gmail message labels.

**Parameters:**

- `messageId` (string, required) — Message ID
- `addLabelIds` (string, optional) — Labels to add (e.g., `TRASH,UNREAD`)
- `removeLabelIds` (string, optional) — Labels to remove (e.g., `INBOX,UNREAD`)

**Examples:**

```
Mark as read:     addLabelIds="" removeLabelIds="UNREAD"
Archive:          removeLabelIds="INBOX"
Move to trash:    addLabelIds="TRASH"
```

#### `gmail_list_labels`

List all Gmail labels for the authenticated account.

### Calendar

#### `calendar_list_events`

List calendar events with optional time range.

**Parameters:**

- `calendarId` (string, optional, default: `primary`)
- `timeMin` (string, optional) — ISO 8601 start time
- `timeMax` (string, optional) — ISO 8601 end time
- `maxResults` (number, optional, default: 50, max: 2500)
- `query` (string, optional) — Free-text search
- `singleEvents` (boolean, optional, default: true) — Expand recurring events

#### `calendar_create_event`

Create a new calendar event.

**Parameters:**

- `summary` (string, required) — Event title
- `startDateTime` (string, required) — ISO 8601 start
- `endDateTime` (string, required) — ISO 8601 end
- `description` (string, optional)
- `location` (string, optional)
- `calendarId` (string, optional, default: `primary`)
- `attendees` (string, optional) — Comma-separated emails
- `timeZone` (string, optional) — e.g., `America/New_York`

#### `calendar_update_event`

Update an existing event.

**Parameters:**

- `eventId` (string, required)
- `summary`, `startDateTime`, `endDateTime`, `description`, `location` (all optional)
- `calendarId` (string, optional)

#### `calendar_delete_event`

Delete a calendar event.

**Parameters:**

- `eventId` (string, required)
- `calendarId` (string, optional)

#### `calendar_list_calendars`

List all calendars the user has access to.

### Drive

#### `drive_list_files`

List files and folders in Google Drive.

**Parameters:**

- `pageSize` (number, optional, default: 20, max: 1000)
- `query` (string, optional) — Drive search query
- `orderBy` (string, optional) — Sort order
- `fields` (string, optional) — Comma-separated fields

#### `drive_get_file`

Get file metadata or download content.

**Parameters:**

- `fileId` (string, required)
- `download` (boolean, optional) — Download file content (max 100KB preview)

#### `drive_upload_file`

Upload a file to Google Drive.

**Parameters:**

- `name` (string, required) — Filename
- `content` (string, required) — Plain text or base64-encoded content
- `mimeType` (string, optional) — MIME type (default: `text/plain`)
- `parentFolderId` (string, optional) — Parent folder ID
- `isBase64` (boolean, optional) — Set true if content is base64

#### `drive_create_folder`

Create a new folder.

**Parameters:**

- `name` (string, required) — Folder name
- `parentFolderId` (string, optional)

#### `drive_delete_file`

Move a file/folder to trash.

**Parameters:**

- `fileId` (string, required)

#### `drive_search`

Search for files by name or type.

**Parameters:**

- `query` (string, required) — e.g., `"name contains 'report'"`
- `pageSize` (number, optional, default: 20)

### Docs

#### `docs_get`

Read a Google Doc's content.

**Parameters:**

- `documentId` (string, required)

#### `docs_create`

Create a new Google Doc.

**Parameters:**

- `title` (string, required)
- `content` (string, optional) — Initial text content

#### `docs_update`

Append content to an existing Google Doc.

**Parameters:**

- `documentId` (string, required)
- `content` (string, required) — Text to append

### Sheets

#### `sheets_get_values`

Read cell values from a range.

**Parameters:**

- `spreadsheetId` (string, required)
- `range` (string, required) — A1 notation, e.g., `Sheet1!A1:D10`

#### `sheets_update_values`

Write values to a range.

**Parameters:**

- `spreadsheetId` (string, required)
- `range` (string, required) — A1 notation
- `values` (string, required) — 2D JSON array, e.g., `[["Name","Age"],["Alice",30]]`

#### `sheets_create`

Create a new spreadsheet.

**Parameters:**

- `title` (string, required)
- `sheets` (string, optional) — Comma-separated tab names (default: `Sheet1`)

#### `sheets_append_rows`

Append rows to a sheet.

**Parameters:**

- `spreadsheetId` (string, required)
- `range` (string, required) — e.g., `Sheet1!A1:C1`
- `values` (string, required) — 2D JSON array

#### `sheets_get_spreadsheet`

Get spreadsheet metadata (sheet names, properties).

**Parameters:**

- `spreadsheetId` (string, required)

### News

#### `news_get_headlines`

Get top news headlines.

**Parameters:**

- `country` (string, optional, default: `us`) — Two-letter code
- `category` (string, optional) — `business`, `entertainment`, `general`, `health`, `science`,
  `sports`, `technology`
- `maxResults` (number, optional, default: 10, max: 100)

#### `news_search`

Search news articles by keyword.

**Parameters:**

- `query` (string, required) — Search keywords
- `maxResults` (number, optional, default: 10)
- `sortBy` (string, optional) — `relevancy`, `popularity`, or `publishedAt`
- `from` (string, optional) — ISO 8601 start date
- `to` (string, optional) — ISO 8601 end date

## Permissions

This plugin declares these capabilities:

- `tools` — Provides 27 tools across all Google services
- `network:fetch` — Makes HTTPS requests to Google APIs and NewsAPI
- `config:auth` — Reads OAuth credentials from plugin configuration

## Development

### Setup

```bash
# Copy template and create the plugin
cp -r template-plugin cortex-plugin-google

# Install dependencies
deno cache mod.ts

# Run tests
deno task test

# Format and lint
deno fmt && deno lint
```

### Testing Locally

```bash
# Validate the plugin
deno task validate

# Install locally
cortex plugin install ./manifest.json

# Test a tool
cortex tool call gmail_list_labels '{}'
cortex tool call news_search '{"query": "technology", "maxResults": 3}'
```

## Project Structure

```
cortex-plugin-google/
├── manifest.json          # Plugin manifest with all 27 tool definitions
├── mod.ts                 # Entry point — exports tools and lifecycle hooks
├── auth.ts                # Google OAuth 2.0 token refresh helper
├── services/
│   ├── gmail.ts           # Gmail tools: list, get, send, search, modify, labels
│   ├── calendar.ts        # Calendar tools: list, create, update, delete, list calendars
│   ├── drive.ts           # Drive tools: list, get, upload, folder, delete, search
│   ├── docs.ts            # Docs tools: get, create, update
│   ├── sheets.ts          # Sheets tools: get values, update, create, append, metadata
│   └── news.ts            # News tools: headlines, search
├── test/                  # Tests
├── README.md              # This file
└── CHANGELOG.md           # Version history
```

## License

MIT — See [LICENSE](./LICENSE) file

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development standards.

## Support

- 📖 [Developing Plugins](../docs/developing.md)
- 📖 [Plugin Best Practices](../docs/best-practices.md)
- 📖 [Manifest Reference](../docs/manifest-reference.md)
- 💬 [Discord Community](https://discord.gg/y7DkaEbPQC)
- 🐛 [Report Issues](https://github.com/CortexPrism/cortex/issues)
