# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project setup

## [1.0.0] — 2026-06-18

### Added

- Initial release of cortex-plugin-google
- **Gmail** (6 tools): `gmail_list`, `gmail_get`, `gmail_send`, `gmail_search`, `gmail_modify`,
  `gmail_list_labels`
- **Calendar** (5 tools): `calendar_list_events`, `calendar_create_event`, `calendar_update_event`,
  `calendar_delete_event`, `calendar_list_calendars`
- **Drive** (6 tools): `drive_list_files`, `drive_get_file`, `drive_upload_file`,
  `drive_create_folder`, `drive_delete_file`, `drive_search`
- **Docs** (3 tools): `docs_get`, `docs_create`, `docs_update`
- **Sheets** (5 tools): `sheets_get_values`, `sheets_update_values`, `sheets_create`,
  `sheets_append_rows`, `sheets_get_spreadsheet`
- **News** (2 tools): `news_get_headlines`, `news_search`
- OAuth 2.0 authentication helper with automatic token refresh
- All tools include input validation, error handling, and structured logging
- Support for Google-native file export (Docs → text, Sheets → CSV)
- Base64-encoded file upload support for Drive
- Configurable NewsAPI integration for Google News search

### Security

- All API requests use HTTPS only
- OAuth tokens are never logged or cached insecurely
- File content downloads limited to 100KB preview
- Input validation on all parameters prevents injection
