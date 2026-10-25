#!/usr/bin/env python3
"""Submit an update to an EXISTING Microsoft Edge Add-ons product via API v1.1."""
import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zipfile import ZipFile

API = "https://api.addons.microsoftedge.microsoft.com/v1"
GUID = re.compile(r"[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}")

def validate_package(path):
    if not path.is_file() or path.stat().st_size > 8 * 1024 * 1024:
        raise ValueError("Edge ZIP is missing or exceeds 8 MiB")
    with ZipFile(path) as archive:
        if "manifest.json" not in archive.namelist():
            raise ValueError("Edge ZIP must have a root manifest.json")
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("manifest_version") != 3:
            raise ValueError("Edge package must be Manifest V3")
        return manifest["version"]

def operation_id(location):
    # Only extract the ID. Never follow a URL supplied in a Location header.
    candidate = location.strip().rstrip("/").rsplit("/", 1)[-1].split("?", 1)[0]
    if not GUID.fullmatch(candidate):
        raise ValueError("Invalid Edge operation ID in Location header")
    return candidate

def request(path, headers, data=None):
    if not path.startswith("/products/") or "://" in path or ".." in path:
        raise ValueError("Unsafe Edge API path")
    req = Request(API + path, data=data, headers=headers, method="POST" if data is not None else "GET")
    try:
        with urlopen(req, timeout=90) as response:
            return response.status, response.headers.get("Location", ""), response.read(262144)
    except HTTPError as error:
        raise RuntimeError("Microsoft Edge API HTTP " + str(error.code) + "; check Product ID, API credentials or submission state") from None
    except URLError as error:
        raise RuntimeError("Cannot connect to Microsoft Edge Add-ons API") from error

def wait_for(path, headers, limit=40, sleep=time.sleep):
    for attempt in range(limit):
        code, _, body = request(path, headers)
        if code not in (200, 202):
            raise RuntimeError("Unexpected Edge operation status HTTP " + str(code))
        # Microsoft can return 202 while an asynchronous operation is pending.
        # Some gateways temporarily return an empty body for that state.
        if code == 202 and not body.strip():
            if attempt < limit - 1:
                sleep(8)
            continue
        response = json.loads(body)
        if response.get("status") == "Succeeded":
            return
        if response.get("status") == "Failed":
            raise RuntimeError("Edge operation rejected: " + str(response.get("errorCode") or response.get("message"))[:200])
        if response.get("status") != "InProgress":
            raise RuntimeError("Unexpected Edge operation state: " + str(response.get("status")))
        if attempt < limit - 1:
            sleep(8)
    raise TimeoutError("Edge operation timed out")

def publish(package, product_id, client_id, api_key, notes):
    version = validate_package(package)
    if not GUID.fullmatch(product_id):
        raise ValueError("EDGE_PRODUCT_ID must be a GUID from Partner Center")
    if not client_id or not api_key:
        raise ValueError("Missing EDGE_CLIENT_ID or EDGE_API_KEY GitHub Actions secrets")
    auth = {"Authorization": "ApiKey " + api_key, "X-ClientID": client_id}
    root = "/products/" + product_id + "/submissions"
    print("Uploading Edge Add-ons package v" + version)
    code, location, _ = request(root + "/draft/package", {**auth, "Content-Type": "application/zip"}, package.read_bytes())
    if code != 202:
        raise RuntimeError("Upload did not return HTTP 202")
    wait_for(root + "/draft/package/operations/" + operation_id(location), auth)
    print("Upload validated by Microsoft Edge")
    data = json.dumps({"notes": notes}).encode("utf-8")
    code, location, _ = request(root, {**auth, "Content-Type": "application/json"}, data)
    if code != 202:
        raise RuntimeError("Submit did not return HTTP 202")
    wait_for(root + "/operations/" + operation_id(location), auth)
    print("Submitted Edge update for certification; store approval is pending")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--notes", default="GitHub Release update for Confluence Markdown Sync.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    ver = validate_package(args.package)
    if args.dry_run:
        print("Validated Edge v" + ver + "; no network or credentials used")
        return
    publish(args.package, os.getenv("EDGE_PRODUCT_ID", ""), os.getenv("EDGE_CLIENT_ID", ""), os.getenv("EDGE_API_KEY", ""), args.notes)

if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, TimeoutError, KeyError) as error:
        print("Edge publishing failed: " + str(error), file=sys.stderr)
        sys.exit(1)
