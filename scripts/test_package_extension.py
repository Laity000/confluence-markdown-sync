"""Packaging checks independent of Chrome Web Store credentials."""
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile
from package_extension import ROOT, RUNTIME_FILES, build


class PackageTest(unittest.TestCase):
    def test_package_only_runtime_files_and_root_level_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'extension.zip'
            version = build(output)
            self.assertEqual(version, json.loads((ROOT / 'manifest.json').read_text())['version'])
            with ZipFile(output) as archive:
                self.assertEqual(set(archive.namelist()), set(RUNTIME_FILES))
                self.assertEqual(json.loads(archive.read('manifest.json'))['version'], version)
                for name in RUNTIME_FILES:
                    self.assertEqual(archive.read(name), (ROOT / name).read_bytes())
                self.assertNotIn('docs/PRIVACY.md', archive.namelist())
                self.assertFalse(any('test_' in x or 'secret' in x for x in archive.namelist()))

    def test_release_tag_cannot_disagree_with_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                build(Path(tmp) / 'extension.zip', 'v99.0.0')


if __name__ == '__main__':
    unittest.main()
