# Changelog

## Unreleased — Chrome Web Store distribution

- Add deterministic store ZIP packaging, automated GitHub Actions release pipeline (Chrome Web Store API v2), and first-publish documentation.
- Add draft Store Listing and privacy disclosure. No change to extension runtime features.

## v1.3.0

- Fix inline Markdown backtick code parsing for PLC expressions such as `VARSTRUCT1.B[index]`.
- Match only equal-length backtick delimiters (single or double); preserve literal inner backticks.
- Fix placeholder leaks when inline code appears inside bold/strikethrough formatting.
- Add inline-code regression tests; keep v1.2 bracket-link protections.

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
