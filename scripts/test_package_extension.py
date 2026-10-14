"""Deterministic Chrome/Edge ZIP and packaging security regression tests."""
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile
from package_extension import ROOT, RUNTIME_FILES, build

class PackageTest(unittest.TestCase):
    def test_dual_platform_packages_are_identical_and_minimal(self):
        with tempfile.TemporaryDirectory() as tmp:
            chrome, edge = Path(tmp)/"chrome.zip", Path(tmp)/"edge.zip"
            version = build(chrome)
            self.assertEqual(version, build(edge))
            self.assertEqual(chrome.read_bytes(), edge.read_bytes())
            with ZipFile(edge) as archive:
                self.assertEqual(set(archive.namelist()), set(RUNTIME_FILES))
                self.assertEqual(len(archive.namelist()), len(RUNTIME_FILES))
                self.assertEqual(json.loads(archive.read("manifest.json"))["version"], version)
                for name in RUNTIME_FILES:
                    self.assertEqual(archive.read(name), (ROOT / name).read_bytes())
    def test_inconsistent_tag_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                build(Path(tmp)/"edge.zip", "v99.0.0")
