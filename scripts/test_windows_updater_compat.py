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

    def test_expected_name_codepoints_match_manifest(self):
        script = (ROOT / 'windows/Update-ConfluenceSync.ps1').read_text(encoding='ascii')
        match = re.search(r"\$ExpectedName\s*=\s*'([^']+)'\s*\+\s*\[char\]0x([0-9a-fA-F]+)\s*\+\s*'([^']+)'((?:\s*\+\s*\[char\]0x[0-9a-fA-F]+)+)", script)
        self.assertIsNotNone(match)
        name = match.group(1) + chr(int(match.group(2), 16)) + match.group(3)
        name += ''.join(chr(int(x, 16)) for x in re.findall(r'\[char\]0x([0-9a-fA-F]+)', match.group(4)))
        manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(name, manifest['name'])
        self.assertEqual(manifest['background']['service_worker'], 'background.js')

    def test_scheduler_added_only_after_initial_update_succeeds(self):
        script = (ROOT / 'windows/Install-ConfluenceSyncUpdater.ps1').read_text(encoding='ascii')
        self.assertLess(script.index('& $script'), script.index('Register-ScheduledTask'))
        self.assertLess(script.index('if ($LASTEXITCODE'), script.index('Register-ScheduledTask'))


if __name__ == '__main__':
    unittest.main()
