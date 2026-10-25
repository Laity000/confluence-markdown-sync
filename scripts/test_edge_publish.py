"""Offline tests of the Microsoft Edge Update REST API integration."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from package_extension import build
from publish_edge_addon import operation_id, wait_for, publish, validate_package

PRODUCT = "d34f98f5-f9b7-42b1-bebb-98707202b21d"
UP = "e34f98f5-f9b7-42b1-bebb-98707202b21d"
POST = "f34f98f5-f9b7-42b1-bebb-98707202b21d"

class TestEdgePublishing(unittest.TestCase):
    def test_location_safe(self):
        self.assertEqual(operation_id("https://unknown.example/operations/" + UP), UP)
        with self.assertRaises(ValueError):
            operation_id("https://unknown.example/path")

    def test_poll(self):
        with patch("publish_edge_addon.request", side_effect=[
            (200, "", b'{"status":"InProgress"}'),
            (200, "", b'{"status":"Succeeded"}')]):
            wait_for("/products/id/submissions/operations/id", {}, sleep=lambda _: None)
        with patch("publish_edge_addon.request", return_value=(200, "", b'{"status":"Failed","errorCode":"Rejected"}')):
            with self.assertRaisesRegex(RuntimeError, "Rejected"):
                wait_for("/products/id/submissions/operations/id", {})
        with patch("publish_edge_addon.request", side_effect=[
            (202, "", b'{"status":"InProgress"}'),
            (202, "", b''),
            (200, "", b'{"status":"Succeeded"}')]):
            wait_for("/products/id/submissions/operations/id", {}, sleep=lambda _: None)


    def test_submission(self):
        with tempfile.TemporaryDirectory() as temp:
            zipfile = Path(temp) / "edge.zip"
            build(zipfile)
            self.assertTrue(validate_package(zipfile))
            seen = []
            def fake(path, headers, data=None):
                seen.append((path, headers, data))
                if path.endswith("/draft/package"):
                    self.assertEqual(headers["Content-Type"], "application/zip")
                    return 202, UP, b""
                if path.endswith("/draft/package/operations/" + UP):
                    return 200, "", b'{"status":"Succeeded"}'
                if path.endswith("/submissions"):
                    self.assertEqual(json.loads(data), {"notes":"CI release"})
                    return 202, POST, b""
                if path.endswith("/operations/" + POST):
                    return 200, "", b'{"status":"Succeeded"}'
                raise AssertionError(path)
            with patch("publish_edge_addon.request", side_effect=fake):
                publish(zipfile, PRODUCT, "client", "secret", "CI release")
            self.assertEqual(len(seen), 4)
            self.assertEqual(seen[0][1]["Authorization"], "ApiKey secret")

    def test_invalid_product_and_missing_credentials(self):
        with tempfile.TemporaryDirectory() as temp:
            zipfile = Path(temp) / "edge.zip"
            build(zipfile)
            with self.assertRaisesRegex(ValueError, "GUID"):
                publish(zipfile, "invalid", "client", "key", "")
            with self.assertRaisesRegex(ValueError, "secrets"):
                publish(zipfile, PRODUCT, "", "", "")
