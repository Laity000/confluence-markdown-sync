# Changelog

## v1.3.0

- Fix Markdown inline backtick code parsing, including `VARSTRUCT1.B[index]`.
- Match exact backtick run lengths and preserve literal inner backticks.
- Fix nested formatting placeholder leaks (bold/strikethrough and inline code).
- Add inline-code regression tests; preserve v1.2 bracket escaping.

## v1.2.0

- Prevent Confluence Wiki Markup from interpreting bracketed PLC/type notation (for example `STRING[80]`) as page links.
- Add regression checks for bracket escaping and remote conversion output.

## v1.1.0

- Enable preview-then-publish without a checkbox or second confirmation dialog.
- Make local JSON backups manual instead of mandatory downloads.
- Retain Confluence revision checks and conflict detection.

## v1.0.0

- Windows Chrome/Edge extension for Markdown to Confluence sync using an already authenticated browser session.
- Support page read, Markdown conversion, storage preview and optimistic concurrency control.
