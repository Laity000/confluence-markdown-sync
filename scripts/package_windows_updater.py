#!/usr/bin/env python3
"""Build a deterministic Windows updater ZIP and stamp its updater version."""
import argparse
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILES = (
    "安装Windows自动更新.cmd",
    "windows/Install-ConfluenceSyncUpdater.ps1",
    "windows/Update-ConfluenceSync.ps1",
    "windows/Update-ConfluenceSyncBootstrap.ps1",
    "windows/Uninstall-ConfluenceSyncUpdater.ps1",
    "docs/WINDOWS_AUTO_UPDATE.md",
)
VERSION_PATTERN = re.compile(r"\d+(?:\.\d+){2,3}")
MARKER_PATTERN = re.compile(r"(?m)^# UpdaterVersion:\s*0\.0\.0\s*$")


def build(output: Path, version: str) -> Path:
    if not VERSION_PATTERN.fullmatch(version):
        raise ValueError(f"Invalid updater version: {version!r}")

    contents = {}
    for relative in SOURCE_FILES:
        source = ROOT / relative
        if not source.is_file():
            raise FileNotFoundError(relative)
        contents[relative] = source.read_bytes()

    updater_path = "windows/Update-ConfluenceSync.ps1"
    updater_text = contents[updater_path].decode("utf-8")
    stamped, count = MARKER_PATTERN.subn(f"# UpdaterVersion: {version}", updater_text)
    if count != 1:
        raise ValueError("Update-ConfluenceSync.ps1 must contain exactly one '# UpdaterVersion: 0.0.0' marker")
    contents[updater_path] = stamped.encode("utf-8")
    contents["updater-version.txt"] = (version + "\n").encode("ascii")

    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for relative in sorted(contents):
            info = ZipInfo(relative, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, contents[relative], compress_type=ZIP_DEFLATED, compresslevel=9)

    print(f"Created {output} · {len(contents)} files · updater v{version}")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True, help="Updater release version, e.g. 1.4.6")
    parser.add_argument("--output", required=True, help="Output ZIP path")
    args = parser.parse_args()
    build(Path(args.output), args.version)
