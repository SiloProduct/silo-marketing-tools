import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "manage-install.py"
SPEC = importlib.util.spec_from_file_location("manage_install", SCRIPT)
INSTALL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSTALL)


class InstallTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.source = self.root / "release"
        self.destination = self.root / "local"
        self.source.mkdir()
        self.release = {"version": "1.0.0", "components": {"marketing": {"version": "1.0.0"}, "frame": {"version": "1.0.0"}}}
        self.content = {
            "README.md": "Shared entry point",
            "release.json": json.dumps(self.release),
            ".agents/skills/silo-visual-marketing/SKILL.md": "Marketing guidance",
            ".agents/skills/frame-creative-workflow/SKILL.md": "Frame guidance",
            "apps/frame/package.json": '{"name":"frame"}',
            "apps/frame/server/index.js": "Frame source",
            "apps/frame/.env.example": "GEMINI_API_KEY=\n",
        }
        self.write_source()
        self.guard = patch.object(INSTALL, "frame_running_guard")
        self.guard.start()

    def tearDown(self):
        self.guard.stop()
        self.temporary.cleanup()

    def write_source(self):
        for relative, content in self.content.items():
            path = self.source / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        listing = {"schema_version": 1, "files": sorted([*self.content, "distribution-files.json"]), "sha256": {p: INSTALL.digest(self.source / p) for p in self.content}}
        (self.source / "distribution-files.json").write_text(json.dumps(listing), encoding="utf-8")

    def apply(self, scope="both"):
        return INSTALL.apply(self.source, self.destination, scope)

    def test_marketing_has_no_app_or_frame_skill(self):
        self.apply("marketing")
        self.assertFalse((self.destination / "apps").exists())
        self.assertFalse((self.destination / ".agents/skills/frame-creative-workflow").exists())
        self.assertEqual(INSTALL.verify(self.destination, "marketing")["components"], {"marketing": "1.0.0"})
        INSTALL.frame_running_guard.assert_not_called()

    def test_frame_scope_has_no_marketing(self):
        self.apply("frame")
        self.assertTrue((self.destination / "apps/frame/package.json").exists())
        self.assertFalse((self.destination / ".agents/skills/silo-visual-marketing").exists())
        INSTALL.frame_running_guard.assert_called_once()

    def test_partial_update_preserves_other_component_and_version(self):
        self.apply()
        frame = self.destination / "apps/frame/server/index.js"
        frame.write_text("User changes to Frame")
        self.release["components"]["marketing"]["version"] = "1.1.0"
        self.release["components"]["frame"]["version"] = "9.0.0"
        self.content["release.json"] = json.dumps(self.release)
        self.content[".agents/skills/silo-visual-marketing/SKILL.md"] = "Updated marketing guidance"
        self.write_source()
        self.apply("marketing")
        manifest = INSTALL.read_manifest(self.destination)
        self.assertEqual(manifest["components"], {"marketing": "1.1.0", "frame": "1.0.0"})
        self.assertEqual(frame.read_text(), "User changes to Frame")

    def test_modified_managed_file_blocks_before_any_write(self):
        self.apply()
        readme = self.destination / "README.md"
        readme.write_text("Local edit")
        before = (self.destination / INSTALL.MANIFEST).read_bytes()
        with self.assertRaisesRegex(INSTALL.InstallError, "Locally modified"):
            self.apply()
        self.assertEqual(readme.read_text(), "Local edit")
        self.assertEqual((self.destination / INSTALL.MANIFEST).read_bytes(), before)

    def test_even_identical_unowned_file_requires_explicit_migration(self):
        self.destination.mkdir()
        (self.destination / "README.md").write_text(self.content["README.md"])
        with self.assertRaisesRegex(INSTALL.InstallError, "Unowned"):
            self.apply("marketing")
        self.assertFalse((self.destination / INSTALL.MANIFEST).exists())

    def test_removed_upstream_file_only_pristine_managed_file_is_removed(self):
        self.apply()
        relative = "apps/frame/server/index.js"
        del self.content[relative]
        self.write_source()
        self.apply("frame")
        self.assertFalse((self.destination / relative).exists())

    def test_private_env_extra_output_and_runtime_remain_unmanaged(self):
        self.apply()
        extras = {"apps/frame/.env": "private credential placeholder", "apps/frame/output/local.mov": "local media", "apps/frame/.frame-runtime.json": '{"nodePath":"local"}'}
        for relative, content in extras.items():
            path = self.destination / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        self.apply()
        for relative, content in extras.items():
            self.assertEqual((self.destination / relative).read_text(), content)

    def test_source_integrity_rejected_before_destination_created(self):
        (self.source / "README.md").write_text("Tampered")
        with self.assertRaisesRegex(INSTALL.InstallError, "integrity"):
            self.apply()
        self.assertFalse(self.destination.exists())

    def test_missing_or_unknown_manifest_blocks(self):
        self.destination.mkdir()
        (self.destination / INSTALL.MANIFEST).write_text('{"schema_version":99}')
        with self.assertRaisesRegex(INSTALL.InstallError, "Unknown"):
            self.apply()

    def test_path_traversal_rejected(self):
        listing_path = self.source / "distribution-files.json"
        listing = json.loads(listing_path.read_text())
        listing["files"].append("../escape")
        listing_path.write_text(json.dumps(listing))
        with self.assertRaises(INSTALL.InstallError):
            self.apply()

    def test_source_symlink_rejected(self):
        path = self.source / "README.md"
        path.unlink()
        try:
            path.symlink_to(SCRIPT)
        except OSError as error:
            if os.name == "nt" and (isinstance(error, PermissionError) or getattr(error, "winerror", None) == 1314):
                self.skipTest("Windows host does not grant symlink creation privilege.")
            raise
        with self.assertRaisesRegex(INSTALL.InstallError, "Symlink"):
            self.apply()

    def test_authoring_destination_rejected(self):
        with self.assertRaisesRegex(INSTALL.InstallError, "authoring"):
            INSTALL.plan(self.source, self.source, "both")

    def test_running_frame_blocks_without_writing_or_killing(self):
        INSTALL.frame_running_guard.side_effect = INSTALL.InstallError("Frame is running")
        with self.assertRaisesRegex(INSTALL.InstallError, "running"):
            self.apply("frame")
        self.assertFalse(self.destination.exists())

    def test_apply_rolls_back_files_and_manifest_after_write_failure(self):
        self.apply()
        original_readme = (self.destination / "README.md").read_bytes()
        original_manifest = (self.destination / INSTALL.MANIFEST).read_bytes()
        self.content["README.md"] = "Updated shared document"
        self.content["apps/frame/server/index.js"] = "Updated Frame"
        self.write_source()
        original_copy = INSTALL.atomic_copy
        count = 0

        def fail_once(source, target):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError("Simulated disk interruption")
            original_copy(source, target)

        with patch.object(INSTALL, "atomic_copy", side_effect=fail_once):
            with self.assertRaises(OSError):
                self.apply()
        self.assertEqual((self.destination / "README.md").read_bytes(), original_readme)
        self.assertEqual((self.destination / INSTALL.MANIFEST).read_bytes(), original_manifest)
        INSTALL.verify(self.destination, "both")
        self.assertFalse(list(self.root.glob(".marketing-tools-backup-*")))

    def test_live_unknown_pid_guard_never_signals_to_terminate(self):
        self.guard.stop()
        state = self.root / "state"
        state.mkdir()
        (state / "service.pid").write_text(str(os.getpid()))
        with patch.object(INSTALL.sys, "platform", "darwin"), patch.object(INSTALL, "default_data_dir", return_value=state), patch.object(INSTALL.urllib.request, "urlopen", side_effect=INSTALL.urllib.error.URLError("offline")), patch.object(INSTALL.os, "kill") as kill:
            with self.assertRaisesRegex(INSTALL.InstallError, "live process"):
                INSTALL.frame_running_guard(self.destination)
            kill.assert_called_once_with(os.getpid(), 0)
        self.guard.start()

    def test_runtime_configuration_marketing_rejected(self):
        self.apply("marketing")
        with self.assertRaisesRegex(INSTALL.InstallError, "Marketing-only"):
            INSTALL.configure_runtime(self.destination, "marketing", None)

    def test_interrupted_snapshot_blocks_new_update(self):
        self.apply()
        snapshot = self.root / ".marketing-tools-backup-interrupted"
        snapshot.mkdir()
        (snapshot / "recovery.json").write_text(json.dumps({"destination": str(self.destination)}))
        with self.assertRaisesRegex(INSTALL.InstallError, "interrupted transaction"):
            self.apply()

    def test_credential_allowlist_rejected_even_with_correct_hash(self):
        self.content["apps/frame/.env"] = "Private value placeholder"
        self.write_source()
        with self.assertRaisesRegex(INSTALL.InstallError, "Credentials"):
            self.apply()
        self.assertFalse(self.destination.exists())

    def test_configure_runtime_rejects_old_node_without_writing_metadata(self):
        import subprocess
        self.apply("frame")
        fake = self.root / "node"
        fake.write_text("placeholder")
        result = subprocess.CompletedProcess([], 0, '{"version":"18.20.0","nodePath":"/local/node"}', "")
        with patch("subprocess.run", return_value=result):
            with self.assertRaisesRegex(INSTALL.InstallError, "22.13"):
                INSTALL.configure_runtime(self.destination, "frame", fake)
        self.assertFalse((self.destination / "apps/frame/.frame-runtime.json").exists())

    def test_configure_runtime_records_reported_executable(self):
        import subprocess
        self.apply("frame")
        fake = self.root / "node"
        fake.write_text("placeholder")
        resolved = self.root / "actual-node"
        result = subprocess.CompletedProcess([], 0, json.dumps({"version": "22.17.0", "nodePath": str(resolved)}), "")
        with patch("subprocess.run", return_value=result):
            INSTALL.configure_runtime(self.destination, "frame", fake)
        self.assertEqual(json.loads((self.destination / "apps/frame/.frame-runtime.json").read_text()), {"nodePath": str(resolved)})

    def test_exclusive_install_lock_prevents_second_writer(self):
        lock = INSTALL.install_lock_path(self.destination)
        lock.write_text(json.dumps({"process_id": os.getpid(), "destination": str(self.destination)}))
        with self.assertRaisesRegex(INSTALL.InstallError, "destination lock"):
            self.apply()
        self.assertFalse(self.destination.exists())
        self.assertTrue(lock.exists())

    def test_research_and_private_asset_paths_never_managed(self):
        for path in ("research/report.md", "team-input/report.docx", "scratch/private.txt", "apps/frame/.frame/private.json", ".agents/skills/silo-visual-marketing/assets/product.jpg"):
            with self.subTest(path=path):
                with self.assertRaisesRegex(INSTALL.InstallError, "Private or generated"):
                    INSTALL.safe_relative(path)


if __name__ == "__main__":
    unittest.main()
