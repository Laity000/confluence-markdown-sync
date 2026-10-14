"""Static regression checks for the PowerShell 5.1 / non-UTF8 locale bug."""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class UpdaterCompatTest(unittest.TestCase):
    def test_scripts_remain_ascii_for_windows_powershell_51(self):
        for file in (ROOT / 'windows').glob('*.ps1'):
            with self.subTest(file=file.name):
                raw = file.read_bytes()
                self.assertTrue(raw.isascii(), f'{file} contains non-ASCII; PowerShell 5.1 may decode it using ACP')

    def _display_name(self, script, variable):
        match = re.search(r'(?m)^\$' + re.escape(variable) + r'\s*=\s*(.+)$', script)
        self.assertIsNotNone(match)
        tokens = re.findall(r"'([^']*)'|\[char\]0x([0-9a-fA-F]+)", match.group(1))
        self.assertTrue(tokens)
        return ''.join(text if text else chr(int(codepoint, 16)) for text, codepoint in tokens)

    def test_expected_name_codepoints_match_manifest_and_allow_legacy(self):
        script = (ROOT / 'windows/Update-ConfluenceSync.ps1').read_text(encoding='ascii')
        manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(self._display_name(script, 'ExpectedName'), manifest['name'])
        self.assertEqual(self._display_name(script, 'LegacyName'), 'Markdown → Confluence 内网同步')
        self.assertIn('$RecognizedNames = @($ExpectedName, $LegacyName)', script)
        self.assertIn('$RecognizedNames -cnotcontains [string]$m.name', script)
        self.assertEqual(manifest['background']['service_worker'], 'background.js')

    def test_scheduler_added_only_after_initial_update_succeeds(self):
        script = (ROOT / 'windows/Install-ConfluenceSyncUpdater.ps1').read_text(encoding='ascii')
        self.assertLess(script.index('& $script'), script.index('Register-ScheduledTask'))
        self.assertLess(script.index('if ($LASTEXITCODE'), script.index('Register-ScheduledTask'))


if __name__ == '__main__':
    unittest.main()
