---
name: doubao-history-export
description: Export Doubao web chat history to Markdown and JSON using the Doubao IM gateway. Use when the user asks to fetch, back up, archive, or prepare Doubao/豆包 historical chat records for analysis, migration, or dot-skill/self-distillation, especially when they provide a browser cookie or copied request headers.
---

# Doubao History Export

## Workflow

1. Get the user-authorized Doubao cookie from the clipboard or an environment variable. Do not print it and do not write it to files.
2. Copy or locate `scripts/export-doubao-im.mjs`.
3. Run it with network access:

```bash
DOUBAO_COOKIE="$(pbpaste)" node scripts/export-doubao-im.mjs
```

Use a custom output directory when working outside the script folder:

```bash
DOUBAO_OUT_DIR="/path/to/doubao-export" DOUBAO_COOKIE="$(pbpaste)" node /path/to/scripts/export-doubao-im.mjs
```

4. Verify the generated files:

- `doubao-im-raw.json`: raw response backup with full message objects.
- `doubao-im-chats.md`: full readable Markdown transcript.
- `knowledge/doubao-self-chat-history.md`: clean transcript for self/distillation workflows.
- `knowledge/doubao-self-user-only.md`: only the user's messages.

## Key Parameters

- `DOUBAO_COOKIE`: required login cookie.
- `DOUBAO_OUT_DIR`: output directory, default `doubao-export`.
- `DOUBAO_CONVERSATION_ID`: referer conversation id, default may be stale; set it when known.
- `DOUBAO_MAX_CONVERSATIONS`: optional test limit.
- `DOUBAO_MAX_MESSAGES_PER_CONVERSATION`: optional test limit.
- `DOUBAO_LIST_PAGE_SIZE`: default `50`.
- `DOUBAO_MESSAGE_PAGE_SIZE`: default `50`.

## Technical Notes

Read `references/api-notes.md` before changing request bodies or debugging API failures.

Important facts:

- `mcs.doubao.com/list` is telemetry, not chat history.
- Conversation list endpoint: `/im/chain/recent_conv`, cmd `3200`.
- Single conversation endpoint: `/im/chain/single`, cmd `3100`.
- IM wrapper requires `sequence_id`, `channel: 2`, and `version: "1"`.
- Content type must be `application/json; encoding=utf-8`.
- The single-chain uplink/downlink key uses Doubao's typo: `pull_singe_chain_*`.
- Do not include `filter.bot_id` in `/im/chain/single`; it can trigger an internal error.
- Use `index_in_conv` as the canonical message index.

## Safety

Treat cookies and tokens as secrets. Never echo, store, commit, or include them in final answers. After a successful export, remind the user that logging out or logging back in can invalidate the copied cookie.
