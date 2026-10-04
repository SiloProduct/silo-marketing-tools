#!/usr/bin/env python3
"""Build and verify the explicit public file set. Never commits or pushes."""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = 'distribution-files.json'
ROOT_FILES = ['README.md', 'AGENTS.md', '.gitignore', '.gitattributes', 'release.json', 'CHANGELOG.md',
              MANIFEST, 'scripts/manage-install.py', 'scripts/prepare-release.py',
              'docs/install-update.md', '.github/workflows/validate.yml']
APP_FILES = ['AGENTS.md', 'README.md', 'START-HERE-WINDOWS.md', '.env.example',
             '.gitignore', '.prettierignore', 'package.json', 'package-lock.json',
             'vite.config.js', 'playwright.config.js', 'Start Frame.command',
             'Start Frame.bat', 'docs/agent-cli.md']
TREES = ['.agents/skills/silo-visual-marketing', '.agents/skills/frame-creative-workflow',
         'apps/frame/client', 'apps/frame/server', 'apps/frame/shared', 'apps/frame/cli',
         'apps/frame/scripts', 'apps/frame/tests', 'apps/frame/examples', 'tests']
SUFFIXES = {'.md', '.json', '.yaml', '.yml', '.js', '.jsx', '.css', '.html', '.py'}
FORBIDDEN_PARTS = {'research', 'team-input', 'scratch', 'assets', 'node_modules', 'dist',
                   '.frame', '.frame-build-check', 'test-results', 'playwright-report',
                   '__pycache__', '.git', '.silo-marketing-backups'}
SECRET_PATTERNS = [rb'AIza[0-9A-Za-z_-]{30,}', rb'\bAQ\.[0-9A-Za-z_.-]{30,}', rb'gh[pousr]_[0-9A-Za-z]{30,}',
                   rb'github_pat_[0-9A-Za-z_]{30,}', rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
                   rb'(?im)^\s*(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*[^\s#\r\n]+']


def fail(message):
    raise ValueError(message)


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def safe_path(name):
    p = PurePosixPath(name)
    if not name or '\\' in name or p.is_absolute() or '..' in p.parts or str(p) != name:
        fail('Unsafe distribution path: ' + name)
    if any(part in FORBIDDEN_PARTS for part in p.parts):
        fail('Private/generated distribution path: ' + name)
    if any(part.startswith('.env') and part != '.env.example' for part in p.parts):
        fail('Credential path in distribution: ' + name)
    if p.name in {'.frame-runtime.json', '.DS_Store', 'AUTHORING.md', '.silo-marketing-install.json', '.marketing-tools-install.json'} or p.name.startswith('.marketing-tools-backup-') or p.name.endswith('.marketing-tools-update.lock'):
        fail('Local-only distribution path: ' + name)
    return p


def file_at(root, name):
    safe_path(name)
    result = root / name
    for part in [result, *result.parents]:
        if part == root:
            break
        if part.is_symlink():
            fail('Symlink in distribution: ' + name)
    if not result.is_file():
        fail('Required distribution file missing: ' + name)
    return result


def public_files(root):
    names = set(ROOT_FILES + ['apps/frame/' + p for p in APP_FILES])
    for tree in TREES:
        base = root / tree
        if not base.is_dir() or base.is_symlink():
            fail('Required public tree missing: ' + tree)
        for p in base.rglob('*'):
            if p.is_symlink():
                fail('Symlink in public tree: ' + str(p.relative_to(root)))
            if p.is_file():
                name = p.relative_to(root).as_posix()
                if '__pycache__' in p.parts or p.suffix == '.pyc':
                    continue
                if p.suffix not in SUFFIXES:
                    fail('Unexpected public file type: ' + name)
                safe_path(name)
                names.add(name)
    for name in names - {MANIFEST}:
        file_at(root, name)
    return sorted(names)


def scan(root, names, known_secrets=()):
    problems = []
    for name in names:
        content = file_at(root, name).read_bytes()
        for pattern in SECRET_PATTERNS:
            if re.search(pattern, content):
                problems.append(name + ': credential signature')
        if any(secret and secret in content for secret in known_secrets):
            problems.append(name + ': configured credential present')
        if re.search(rb'/Users/[A-Za-z0-9._-]+/', content) or re.search(rb'[A-Z]:\\Users\\[A-Za-z0-9._-]+\\', content):
            problems.append(name + ': personal machine path')
    if problems:
        fail('Public-content checks failed:\n' + '\n'.join(sorted(set(problems))))


def known_local_secrets(root):
    p = root / 'apps/frame/.env'
    if not p.is_file():
        return []
    secrets = []
    for line in p.read_text(encoding='utf-8').splitlines():
        m = re.match(r'^\s*(?:export\s+)?(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(.*?)\s*$', line)
        if m:
            value = m[1].strip().strip('\"\x27').encode()
            if value:
                secrets.append(value)
    return secrets


def check_links(root, names):
    errors = []
    for name in names:
        if not name.endswith('.md'):
            continue
        content = file_at(root, name).read_text(encoding='utf-8')
        for target in re.findall(r'\[[^\]]*\]\(([^\n)]+)\)', content):
            target = target.strip().strip('<>')
            if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) or target.startswith('#'):
                continue
            path = unquote(target.split('#', 1)[0].split('?', 1)[0])
            resolved = (root / name).parent / path
            try:
                rel = resolved.resolve().relative_to(root.resolve()).as_posix()
            except ValueError:
                errors.append(name + ': link leaves public package')
                continue
            if rel not in names:
                errors.append(name + ': unresolved public link ' + target)
    if errors:
        fail('Public link checks failed:\n' + '\n'.join(errors))


def validate(root, exact_layout=True):
    data = json.loads(file_at(root, MANIFEST).read_text(encoding='utf-8'))
    names = data.get('files')
    if data.get('schema_version') != 1 or not isinstance(names, list) or names != sorted(set(names)):
        fail('Invalid distribution manifest')
    if exact_layout and names != public_files(root):
        fail('Distribution file set changed; review and refresh manifest')
    hashes = data.get('sha256', {})
    if set(hashes) != set(names) - {MANIFEST}:
        fail('Incomplete distribution hashes')
    for name, expected in hashes.items():
        if digest(file_at(root, name)) != expected:
            fail('Changed distribution file; review and refresh: ' + name)
    scan(root, names, known_local_secrets(root))
    check_links(root, names)
    for skill in ['silo-visual-marketing', 'frame-creative-workflow']:
        text = (root / '.agents/skills' / skill / 'SKILL.md').read_text(encoding='utf-8')
        if not text.startswith('---\n') or not re.search(r'^name:\s*' + skill + r'\s*$', text, re.M) or 'description:' not in text.split('---', 2)[1]:
            fail('Invalid skill metadata: ' + skill)
    release = json.loads((root / 'release.json').read_text(encoding='utf-8'))
    if release.get('schema_version') != 1 or set(release.get('components', {})) != {'marketing', 'frame'}:
        fail('Invalid release metadata')
    return data


def export(root, destination, data, update_reviewed_draft=False):
    destination = destination.expanduser()
    if destination.is_symlink() or any(p.is_symlink() for p in destination.parents):
        fail('Publication destination cannot use a symlink')
    destination = destination.resolve()
    if destination == root or destination in root.parents or root in destination.parents:
        fail('Publication destination must be separate from authoring source')
    destination.mkdir(parents=True, exist_ok=True)
    if (destination / '.git').exists():
        remote = subprocess.run(['git', '-C', str(destination), 'remote', 'get-url', 'origin'], capture_output=True, text=True, check=True).stdout.strip()
        if remote not in {'https://github.com/SiloProduct/silo-marketing-tools.git', 'https://github.com/SiloProduct/silo-marketing-tools', 'git@github.com:SiloProduct/silo-marketing-tools.git'}:
            fail('Publication checkout origin is not SiloProduct/silo-marketing-tools')
        status = subprocess.run(['git', '-C', str(destination), 'status', '--porcelain'], capture_output=True, text=True, check=True).stdout
        if status.strip() and not update_reviewed_draft:
            fail('Publication checkout has local changes; inspect before exporting')
    prior = None
    if (destination / MANIFEST).is_file():
        prior = validate(destination, exact_layout=False)
    if update_reviewed_draft and prior is None:
        fail('Updating a reviewed draft requires a verified prior distribution manifest')
    existing = set()
    for p in destination.rglob('*'):
        if '.git' in p.relative_to(destination).parts:
            continue
        if p.is_symlink():
            fail('Symlink in publication destination')
        if p.is_file():
            existing.add(p.relative_to(destination).as_posix())
    if existing - set(prior['files'] if prior else []):
        fail('Publication destination has unrecognized files; use a clean checkout')
    staged = destination.parent / ('.' + destination.name + '-release-stage')
    if staged.exists():
        fail('Previous publication stage exists; inspect it first')
    staged.mkdir()
    try:
        for name in data['files']:
            output = staged / name
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file_at(root, name), output)
        validate(staged)
        for name in sorted(existing - set(data['files'])):
            (destination / name).unlink()
        for name in data['files']:
            output = destination / name
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(staged / name, output)
        validate(destination)
    finally:
        shutil.rmtree(staged)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['refresh', 'check', 'export'])
    parser.add_argument('--source', type=Path, default=ROOT)
    parser.add_argument('--destination', type=Path)
    parser.add_argument('--update-reviewed-draft', action='store_true', help='Update a pending export only when its existing files still match the previous reviewed manifest')
    args = parser.parse_args()
    root = args.source.resolve()
    if args.command == 'refresh':
        names = public_files(root)
        scan(root, [n for n in names if n != MANIFEST], known_local_secrets(root))
        check_links(root, names)
        data = {'schema_version': 1, 'files': names,
                'sha256': {n: digest(file_at(root, n)) for n in names if n != MANIFEST}}
        (root / MANIFEST).write_bytes((json.dumps(data, indent=2) + '\n').encode('utf-8'))
    data = validate(root)
    if args.command == 'export':
        if args.destination is None:
            fail('Supply --destination for export')
        export(root, args.destination, data, args.update_reviewed_draft)
    print(json.dumps({'ok': True, 'command': args.command, 'version': json.loads((root / 'release.json').read_text(encoding='utf-8'))['version'], 'public_files': len(data['files'])}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, json.JSONDecodeError, subprocess.CalledProcessError) as error:
        print(json.dumps({'ok': False, 'error': str(error)}), file=sys.stderr)
        sys.exit(1)
