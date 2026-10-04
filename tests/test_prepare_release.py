import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('prepare_release', Path(__file__).resolve().parents[1] / 'scripts/prepare-release.py')
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class PublicReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name).resolve()
        self.source = self.base / 'source'
        self.source.mkdir()
        for name in release.ROOT_FILES + ['apps/frame/' + p for p in release.APP_FILES]:
            if name == release.MANIFEST:
                continue
            p = self.source / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b'Public source\n')
        for tree in release.TREES:
            p = self.source / tree / 'content.md'
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b'Public source\n')
        for skill in ['silo-visual-marketing', 'frame-creative-workflow']:
            (self.source / '.agents/skills' / skill / 'SKILL.md').write_text('---\nname: ' + skill + '\ndescription: Shared guidance\n---\n')
        (self.source / 'release.json').write_text(json.dumps({'schema_version': 1, 'version': '1.0.0', 'components': {'marketing': {}, 'frame': {}}}))
        self.refresh()

    def tearDown(self):
        self.temp.cleanup()

    def refresh(self):
        names = release.public_files(self.source)
        (self.source / release.MANIFEST).write_text(json.dumps({'schema_version': 1, 'files': names, 'sha256': {n: release.digest(self.source / n) for n in names if n != release.MANIFEST}}))

    def test_private_authoring_files_never_export(self):
        for name in ['AUTHORING.md', 'apps/frame/.env', 'apps/frame/.frame/frame.sqlite', 'scratch/private.json']:
            p = self.source / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('private local work')
        data = release.validate(self.source)
        destination = self.base / 'publication'
        release.export(self.source, destination, data)
        self.assertFalse((destination / 'apps/frame/.env').exists())
        self.assertFalse((destination / 'AUTHORING.md').exists())
        self.assertEqual(set(data['files']), {p.relative_to(destination).as_posix() for p in destination.rglob('*') if p.is_file()})

    def test_source_changes_require_reviewed_manifest(self):
        (self.source / 'README.md').write_text('Changed guidance')
        with self.assertRaisesRegex(ValueError, 'Changed distribution file'):
            release.validate(self.source)

    def test_new_public_file_requires_manifest_refresh(self):
        (self.source / 'apps/frame/server/new.js').write_text('export const value = 1;')
        with self.assertRaisesRegex(ValueError, 'file set changed'):
            release.validate(self.source)

    def test_marketing_media_is_refused(self):
        (self.source / '.agents/skills/silo-visual-marketing/photo.png').write_bytes(b'pixels')
        with self.assertRaisesRegex(ValueError, 'Unexpected public file type'):
            release.public_files(self.source)

    def test_credential_patterns_refused_without_value_in_error(self):
        secret = 'AIza' + 'a' * 36
        (self.source / 'README.md').write_text(secret)
        with self.assertRaises(ValueError) as error:
            release.scan(self.source, ['README.md'])
        self.assertNotIn(secret, str(error.exception))

    def test_known_local_credential_refused_without_printing(self):
        secret = 'a' * 32
        (self.source / 'apps/frame/.env').write_text('GEMINI_API_KEY=' + secret)
        (self.source / 'README.md').write_text(secret)
        with self.assertRaisesRegex(ValueError, 'configured credential present') as error:
            release.scan(self.source, ['README.md'], release.known_local_secrets(self.source))
        self.assertNotIn(secret, str(error.exception))

    def test_dotted_auth_credential_refused_without_printing(self):
        secret = 'AQ.' + 'test-only_' * 35
        (self.source / 'README.md').write_text(secret, encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'credential signature') as error:
            release.scan(self.source, ['README.md'])
        self.assertNotIn(secret, str(error.exception))

    def test_external_local_markdown_links_refused(self):
        (self.source / 'README.md').write_text('[Private](../private.md)')
        with self.assertRaisesRegex(ValueError, 'leaves public package'):
            release.check_links(self.source, release.public_files(self.source))

    def test_broken_public_links_refused(self):
        (self.source / 'README.md').write_text('[Missing](docs/missing.md)')
        with self.assertRaisesRegex(ValueError, 'unresolved public link'):
            release.check_links(self.source, release.public_files(self.source))

    def test_multilingual_package_uses_utf8_with_legacy_default(self):
        content = 'הנחיות לצוות — “Frame”\n[התקנה](docs/install-update.md)\n'
        (self.source / 'README.md').write_bytes(content.encode('utf-8'))
        for skill in ['silo-visual-marketing', 'frame-creative-workflow']:
            (self.source / '.agents/skills' / skill / 'SKILL.md').write_bytes(
                ('---\nname: ' + skill + '\ndescription: הנחיות\n---\n').encode('utf-8'))
        (self.source / 'apps/frame/.env').write_bytes('# הגדרה פרטית\nGEMINI_API_KEY=\n'.encode('utf-8'))
        self.refresh()
        original_read = Path.read_text

        def legacy_read(path, encoding=None, errors=None):
            return original_read(path, encoding=encoding or 'cp1252', errors=errors)

        with patch.object(Path, 'read_text', legacy_read):
            data = release.validate(self.source)
            destination = self.base / 'publication'
            release.export(self.source, destination, data)
        self.assertEqual((destination / 'README.md').read_bytes(), content.encode('utf-8'))
        self.assertFalse((destination / 'apps/frame/.env').exists())

    def test_symlink_source_refused(self):
        p = self.source / 'apps/frame/server/content.md'
        p.unlink()
        try:
            p.symlink_to(self.source / 'README.md')
        except OSError as error:
            if isinstance(error, PermissionError) or getattr(error, 'winerror', None) == 1314:
                self.skipTest('Host lacks symlink creation privilege')
            raise
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            release.public_files(self.source)

    def test_unrecognized_destination_file_is_preserved(self):
        destination = self.base / 'publication'
        destination.mkdir()
        local = destination / '.env'
        local.write_text('preserve local configuration')
        with self.assertRaisesRegex(ValueError, 'unrecognized files'):
            release.export(self.source, destination, release.validate(self.source))
        self.assertEqual(local.read_text(), 'preserve local configuration')

    def test_modified_publication_is_preserved(self):
        destination = self.base / 'publication'
        release.export(self.source, destination, release.validate(self.source))
        (destination / 'README.md').write_text('local publication edit')
        with self.assertRaisesRegex(ValueError, 'Changed distribution file'):
            release.export(self.source, destination, release.validate(self.source))
        self.assertEqual((destination / 'README.md').read_text(), 'local publication edit')

    def test_export_removes_only_pristine_old_public_files(self):
        old = self.source / 'apps/frame/server/obsolete.js'
        old.write_text('previous source')
        self.refresh()
        destination = self.base / 'publication'
        release.export(self.source, destination, release.validate(self.source))
        old.unlink()
        self.refresh()
        release.export(self.source, destination, release.validate(self.source))
        self.assertFalse((destination / 'apps/frame/server/obsolete.js').exists())

    def test_prior_layout_can_be_exported_with_new_required_file(self):
        destination = self.base / 'publication'
        release.export(self.source, destination, release.validate(self.source))
        (destination / '.gitattributes').unlink()
        manifest = json.loads((destination / release.MANIFEST).read_text())
        manifest['files'].remove('.gitattributes')
        del manifest['sha256']['.gitattributes']
        (destination / release.MANIFEST).write_text(json.dumps(manifest))
        release.export(self.source, destination, release.validate(self.source))
        self.assertTrue((destination / '.gitattributes').exists())

    def test_reviewed_draft_needs_prior_manifest_and_refuses_edits(self):
        destination = self.base / 'publication'
        with self.assertRaisesRegex(ValueError, 'requires a verified prior'):
            release.export(self.source, destination, release.validate(self.source), True)
        release.export(self.source, destination, release.validate(self.source))
        (destination / 'README.md').write_text('unreviewed user edit')
        with self.assertRaisesRegex(ValueError, 'Changed distribution file'):
            release.export(self.source, destination, release.validate(self.source), True)

    def test_git_checkout_enforces_release_line_endings(self):
        import subprocess
        subprocess.run(['git', 'init', '-q', str(self.source)], check=True)
        attributes = self.source / '.gitattributes'
        attributes.write_bytes(b'* text eol=lf\n')
        subprocess.run(['git', '-C', str(self.source), 'config', 'core.autocrlf', 'true'], check=True)
        subprocess.run(['git', '-C', str(self.source), 'add', '.gitattributes', 'README.md'], check=True)
        original = (self.source / 'README.md').read_bytes()
        (self.source / 'README.md').unlink()
        subprocess.run(['git', '-C', str(self.source), 'checkout', '--', 'README.md'], check=True)
        self.assertEqual((self.source / 'README.md').read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
