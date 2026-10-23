## v1.4.15

- Recognize space-aligned tables enclosed by standalone horizontal rules, including blank lines between rows.
- Strip leading HTML space entities such as `&#x20;` before parsing table cells.
- Render these tables as real Confluence tables in both Wiki Markup and Storage XHTML modes.
- Add regression coverage for the reported LLDB command/result table.

## v1.4.14

- Recognize fixed-width tables with a header row, dashed column ruler, and blank lines around the ruler.
- Convert the header into real Confluence table header cells instead of plain text.
- Preserve existing support for fixed-width tables without headers and ordinary horizontal rules.
- Add regression coverage for the reported two-memory-region table format in both Wiki Markup and Storage XHTML conversion.

## v1.4.13

- Before uploading local attachments, list the page's existing attachments and compare file bytes.
- Skip attachments whose existing content is identical, preventing repeated uploads when only Markdown text changes.
- Update existing attachments through their attachment-data endpoint when the local file content actually changed; create only missing attachments.
- Return page-context API errors explicitly so the UI can show the underlying Confluence status/message instead of a generic missing-result warning.
- Add regression tests for unchanged, changed, new and failed attachment syncs.

## v1.4.12

- If the update response is missing or ambiguous, read the Confluence page back before reporting failure.
- Confirm success when the remote Storage body matches the intended content.
- Distinguish confirmed non-update from an unexpected remote change; never automatically retry a write.
- Add regression tests for missing-response outcomes.

## v1.4.11

- Simplify the Markdown toolbar to prioritize project-directory import and single-Markdown import.
- Remove the always-visible attachment-file and resource-directory buttons.
- Show a contextual "选择资源目录" button only when local Markdown references need resource access or remain unresolved.
- Keep pasted Markdown and relative-path attachment upload supported.

## v1.4.10

- Convert dashed-ruler, space-aligned text tables (for example `------ --------------------- ------` followed by aligned rows) into real Confluence tables.
- Apply the fix to both Wiki Markup and direct Storage XHTML conversion paths.
- Keep ordinary horizontal rules and standard Markdown pipe tables unchanged; add regression tests.

## v1.4.4

- Rename the Chrome and Microsoft Edge extension to **Markdown → Confluence 同步**, including the editor title and store listing draft.
- Accept both legacy and new names in the Windows updater, maintaining the existing unpacked-extension path.
- Include a Windows updater installer ZIP in GitHub Releases; previously installed updater scripts require a one-time refresh because they cannot recognize the renamed manifest.
- Extend Windows name-migration regression checks.

## v1.4.3

- Add dual-platform ZIP artifacts to GitHub Releases without changing Windows updater compatibility.
- Add Microsoft Edge Add-ons API v1.1 automatic submissions for already published products.
- Add publisher regression tests and setup documentation.

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
