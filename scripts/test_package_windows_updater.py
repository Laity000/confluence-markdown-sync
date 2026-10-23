"""Regression tests for the self-updating Windows updater package."""
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from package_windows_updater import ROOT, SOURCE_FILES, build

EXPECTED_FILES = set(SOURCE_FILES) | {"updater-version.txt"}


class WindowsUpdaterPackageTest(unittest.TestCase):
    def test_package_has_exact_allowlisted_files_and_matching_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "updater.zip"
            build(output, "1.4.6")
            with ZipFile(output) as archive:
                self.assertEqual(set(archive.namelist()), EXPECTED_FILES)
                self.assertEqual(len(archive.namelist()), len(EXPECTED_FILES))
                self.assertEqual(archive.read("updater-version.txt"), b"1.4.6\n")
                updater = archive.read("windows/Update-ConfluenceSync.ps1").decode("utf-8")
                self.assertIn("# UpdaterVersion: 1.4.6", updater)
                self.assertNotIn("# UpdaterVersion: 0.0.0", updater)
                self.assertIn("windows/Update-ConfluenceSyncBootstrap.ps1", archive.namelist())
                for relative in SOURCE_FILES:
                    if relative != "windows/Update-ConfluenceSync.ps1":
                        self.assertEqual(archive.read(relative), (ROOT / relative).read_bytes())

    def test_package_is_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            first, second = Path(tmp) / "a.zip", Path(tmp) / "b.zip"
            build(first, "1.4.6")
            build(second, "1.4.6")
            self.assertEqual(first.read_bytes(), second.read_bytes())

    def test_invalid_version_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                build(Path(tmp) / "bad.zip", "../latest")


if __name__ == "__main__":
    unittest.main()
