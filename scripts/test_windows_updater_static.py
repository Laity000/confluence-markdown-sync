"""Static safety checks for the Windows updater bootstrap design."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class WindowsUpdaterBootstrapTest(unittest.TestCase):
    def test_installer_schedules_bootstrapper_not_core_script(self):
        source = (ROOT / "windows/Install-ConfluenceSyncUpdater.ps1").read_text(encoding="utf-8")
        self.assertIn("Update-ConfluenceSyncBootstrap.ps1", source)
        self.assertIn("-File \"'+$bootstrapper+'\"", source)
        self.assertNotIn("-File \"'+$script+'\"", source)

    def test_bootstrapper_checks_checksum_allowlist_and_version_before_replace(self):
        source = (ROOT / "windows/Update-ConfluenceSyncBootstrap.ps1").read_text(encoding="utf-8")
        for required in (
            "releases/latest",
            "SHA256SUMS.txt",
            "Get-FileHash",
            "ExpectedEntries",
            "updater-version.txt",
            "ReadUpdaterVersion $stagedUpdater",
            "Start-Process",
        ):
            self.assertIn(required, source)

    def test_release_workflow_builds_stamped_updater_package(self):
        workflow = (ROOT / ".github/workflows/github-release.yml").read_text(encoding="utf-8")
        self.assertIn("scripts/package_windows_updater.py --version", workflow)

    def test_extension_allowlist_includes_attachment_resolver(self):
        source = (ROOT / "windows/Update-ConfluenceSync.ps1").read_text(encoding="ascii")
        self.assertIn("'attachment-resolver.js'", source)


if __name__ == "__main__":
    unittest.main()
