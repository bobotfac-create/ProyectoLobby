import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from package import build


class PackageTest(unittest.TestCase):
    def test_packages_are_reproducible_and_use_the_right_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = build(Path(tmp) / "first")
            second = build(Path(tmp) / "second")
            for left, right in zip(first, second):
                self.assertEqual(hashlib.sha256(left.read_bytes()).digest(), hashlib.sha256(right.read_bytes()).digest())
                with zipfile.ZipFile(left) as archive:
                    manifest = json.loads(archive.read("manifest.json"))
                    self.assertIn("https://www.camara.cl/transparencia/FormularioSolicitudAudiencia.aspx*", manifest["content_scripts"][0]["matches"])
                    senado = next(entry for entry in manifest["content_scripts"] if "src/sites/senado/form-filler.js" in entry["js"])
                    self.assertEqual(senado["matches"], ["https://lobby.senado.cl/public_html/forms/masters-senado/audiencia.php*"])
                    self.assertTrue(senado["all_frames"])
                    self.assertIn("src/sites/senado/frame-bridge.js", senado["js"])
                    page = next(entry for entry in manifest["content_scripts"] if "src/sites/senado/page-adapter.js" in entry["js"])
                    self.assertEqual(page["matches"], ["https://www.senado.cl/transparencia/lobby/audiencia*"])
                    self.assertIn("src/sites/senado/form-filler.js", archive.namelist())
                    self.assertIn("https://proyectolobby.onrender.com/*", manifest["host_permissions"])
                    self.assertIn("src/background.js", archive.namelist())
                    self.assertIn("src/api-config.js", archive.namelist())
                    self.assertNotIn("manifest.firefox.json", archive.namelist())
                    self.assertEqual("browser_specific_settings" in manifest, "firefox" in left.name)
                    if "firefox" in left.name:
                        self.assertNotIn("service_worker", manifest["background"])
                        self.assertEqual(manifest["background"]["scripts"], ["src/api-config.js", "src/background.js"])
            with self.assertRaises(FileExistsError):
                build(Path(tmp) / "first")


if __name__ == "__main__":
    unittest.main()
