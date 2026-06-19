# AI Disclosure

This file documents any AI-assisted development used in this plugin.

## Tools Used

- GitHub Copilot (code generation and implementation)

## Scope

AI assistance was used in the following areas:

- `mod.ts` — Entry point and lifecycle hooks
- `auth.ts` — OAuth 2.0 token refresh and API authentication helpers
- `services/gmail.ts` — Gmail API tool implementations (list, get, send, search, modify, labels)
- `services/calendar.ts` — Calendar API tool implementations (list, create, update, delete, list
  calendars)
- `services/drive.ts` — Drive API tool implementations (list, get, upload, folder, delete, search)
- `services/docs.ts` — Docs API tool implementations (get, create, update)
- `services/sheets.ts` — Sheets API tool implementations (get values, update, create, append,
  metadata)
- `services/news.ts` — NewsAPI tool implementations (headlines, search)
- `README.md` — Documentation, installation guide, and tool reference
- `manifest.json` — Manual configuration based on Google API reference

## Review

All AI-generated code was reviewed by a human developer, tested thoroughly, and verified to work
correctly before being committed to this repository.

## Certification

I certify that I understand the code being submitted and take full responsibility for its behavior
and security.

## Disclosure in manifest.json

The `manifest.json` file includes this disclosure:

```json
{
  "aiDisclosure": {
    "tools": ["copilot"],
    "generatedFiles": [
      "mod.ts",
      "auth.ts",
      "services/gmail.ts",
      "services/calendar.ts",
      "services/drive.ts",
      "services/docs.ts",
      "services/sheets.ts",
      "services/news.ts",
      "README.md"
    ],
    "humanReviewed": true,
    "statement": "All AI-generated code was reviewed, tested, and verified for correctness and security."
  }
}
```
