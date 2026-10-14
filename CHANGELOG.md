## v1.4.2

- Fix Confluence Wiki auto-linking of `VARSTRUCT1.B[index]` inside `{{monospace}}` by routing sensitive expressions straight to local Storage XHTML (`<code>` for Markdown inline code).
- Block unsafe server-only rendering for bracketed PLC indexing; preserve server renderer for regular Markdown.
- Block vulnerable Wiki copy/export on affected documents and add integrated preview regression tests.

# Changelog

## v1.4.1

- Fix Windows PowerShell 5.1 locale-dependent decoding of the extension name, which incorrectly rejected existing v1.0-v1.4 installs.
- Keep updater PowerShell sources ASCII-only while matching the exact expected Unicode manifest name.
- Report the failing manifest field and leave registration of recurring tasks until after a successful first install.

## v1.4.0 — GitHub Releases Windows auto-update

- Add one-time PowerShell installer and per-user hourly Task Scheduler updater.
- Validate GitHub release ZIP SHA256 and strict runtime allowlist; recover overwritten files if a copy fails.
- Add MV3 `chrome.alarms` + `chrome.runtime.reload()` polling of a local update marker.
- Defer extension reload while any Confluence sync editor tab is open.
- Automatically create versioned GitHub Releases from main after CI tests pass.
- Existing v1.3 unpacked installations need one manual extension reload to activate the new background worker.

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
