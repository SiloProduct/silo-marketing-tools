#!/usr/bin/env python3
"""Install selected public components; never manage credentials or user media."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.request

MANIFEST = ".marketing-tools-install.json"
SCOPES = {"marketing": {"marketing"}, "frame": {"frame"}, "both": {"marketing", "frame"}}


class InstallError(Exception):
    pass


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_relative(value):
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        raise InstallError("Invalid distribution path.")
    path = PurePosixPath(value)
    if path.is_absolute() or str(path) != value or any(p in {".", ".."} for p in path.parts):
        raise InstallError("Invalid distribution path.")
    if any(p in {".git", "node_modules", "dist", "data", "output", "outputs", "logs", "research", "team-input", "scratch", "assets", ".frame", ".frame-build-check", "runtimeoutputs"} for p in path.parts):
        raise InstallError("Private or generated path cannot be managed: " + value)
    if any(p.startswith(".env") and p != ".env.example" for p in path.parts):
        raise InstallError("Credentials cannot be managed.")
    if path.name == MANIFEST or path.suffix.lower() in {".sqlite", ".sqlite3", ".db"}:
        raise InstallError("State cannot be managed.")
    if path.name == ".frame-runtime.json":
        raise InstallError("Local runtime settings cannot be managed.")
    return value


def owner(path):
    if path.startswith(".agents/skills/silo-visual-marketing/"):
        return "marketing"
    if path.startswith("apps/frame/") or path.startswith(".agents/skills/frame-creative-workflow/"):
        return "frame"
    return "shared"


def checked_path(root, relative):
    relative = safe_relative(relative)
    candidate = root / relative
    current = root
    if root.is_symlink():
        raise InstallError("Installation/source roots must not be symlinks.")
    for part in PurePosixPath(relative).parts:
        current = current / part
        if current.is_symlink():
            raise InstallError("Symlink is not a managed file: " + relative)
        if current.exists() and current != candidate and not current.is_dir():
            raise InstallError("Parent path is not a directory: " + relative)
    if candidate.exists() and not candidate.is_file():
        raise InstallError("Managed path is not a regular file: " + relative)
    if root.resolve() not in candidate.resolve().parents:
        raise InstallError("Managed path escapes its root: " + relative)
    return candidate


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise InstallError("Cannot read valid JSON: " + str(path)) from error


def source_files(source):
    release = read_json(checked_path(source, "release.json"))
    listing = read_json(checked_path(source, "distribution-files.json"))
    if not isinstance(release, dict) or not isinstance(release.get("version"), str):
        raise InstallError("Invalid release metadata.")
    components = release.get("components")
    if not isinstance(components, dict) or set(components) != {"marketing", "frame"}:
        raise InstallError("Invalid release components.")
    if any(not isinstance(item, dict) or not isinstance(item.get("version"), str) for item in components.values()):
        raise InstallError("Missing component version.")
    if not isinstance(listing, dict) or listing.get("schema_version") != 1 or not isinstance(listing.get("files"), list):
        raise InstallError("Invalid distribution allowlist.")
    files = {}
    for relative in listing["files"]:
        path = checked_path(source, relative)
        if relative in files or not path.is_file():
            raise InstallError("Duplicate or missing source file: " + relative)
        files[relative] = {"sha256": digest(path), "component": owner(relative)}
    hashes = listing.get("sha256")
    expected = set(files) - {"distribution-files.json"}
    if not isinstance(hashes, dict) or set(hashes) != expected:
        raise InstallError("Release hashes must cover every non-self allowlisted file exactly.")
    if any(hashes[p] != files[p]["sha256"] for p in expected):
        raise InstallError("Release integrity check failed; retrieve the approved release again.")
    for required in {"release.json", "distribution-files.json", ".agents/skills/silo-visual-marketing/SKILL.md", ".agents/skills/frame-creative-workflow/SKILL.md", "apps/frame/package.json"}:
        if required not in files:
            raise InstallError("Required release file missing: " + required)
    return release, files


def read_manifest(destination):
    path = destination / MANIFEST
    if path.is_symlink():
        raise InstallError("Install manifest cannot be a symlink.")
    if not path.exists():
        return {"schema_version": 1, "components": {}, "files": {}}
    manifest = read_json(path)
    if not isinstance(manifest, dict) or set(manifest) != {"schema_version", "components", "files"} or manifest["schema_version"] != 1:
        raise InstallError("Unknown install manifest; do not update automatically.")
    if not isinstance(manifest["components"], dict) or not set(manifest["components"]).issubset({"marketing", "frame"}) or any(not isinstance(v, str) for v in manifest["components"].values()):
        raise InstallError("Invalid installed component versions.")
    if not isinstance(manifest["files"], dict):
        raise InstallError("Invalid managed file map.")
    for relative, metadata in manifest["files"].items():
        checked_path(destination, relative)
        if not isinstance(metadata, dict) or set(metadata) != {"sha256", "component"} or metadata["component"] != owner(relative) or not isinstance(metadata["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", metadata["sha256"]):
            raise InstallError("Invalid managed file record: " + relative)
        if owner(relative) != "shared" and owner(relative) not in manifest["components"]:
            raise InstallError("Managed file has no installed component: " + relative)
    return manifest


def roots(source, destination):
    # Check symlink ancestry before resolve removes that evidence.
    for root in (source, destination):
        for path in (root, *root.parents):
            if path.is_symlink():
                raise InstallError("Choose source/destination without symlink ancestors.")
    source, destination = source.resolve(), destination.resolve()
    if source == destination or source in destination.parents or destination in source.parents:
        raise InstallError("Destination must be separate from source, never the authoring folder.")
    if destination.exists() and not destination.is_dir():
        raise InstallError("Destination must be a directory.")
    return source, destination


def env_configuration(app):
    # Read only the two operational values; never return/print key contents.
    result = {}
    env = app / ".env"
    if env.is_file():
        for line in env.read_text(encoding="utf-8").splitlines():
            match = re.match(r"^\s*(?:export\s+)?(FRAME_DATA_DIR|PORT)\s*=\s*(.*?)\s*$", line)
            if match:
                value = match[2]
                if value.startswith(('"', "'")) and value.endswith(value[0]):
                    value = value[1:-1]
                else:
                    value = value.split(" #", 1)[0].strip()
                result[match[1]] = value
    return result


def default_data_dir():
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "Frame"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Frame"
    return Path.home() / ".local" / "share" / "frame"


def frame_running_guard(destination):
    app = destination / "apps" / "frame"
    config = env_configuration(app)
    configured = os.environ.get("FRAME_DATA_DIR") or config.get("FRAME_DATA_DIR")
    states = {default_data_dir().resolve()}
    if configured:
        states.add((app / configured).resolve())
    port = os.environ.get("PORT") or config.get("PORT") or "4310"
    try:
        port_number = int(port)
        if not 1 <= port_number <= 65535:
            raise ValueError()
    except ValueError as error:
        raise InstallError("Invalid Frame port; inspect configuration privately.") from error
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d/api/health" % port_number, timeout=1) as response:
            health = json.loads(response.read(65536))
        if isinstance(health, dict) and health.get("service") == "frame":
            health_root = Path(str(health.get("appRoot", ""))).resolve()
            state_root = Path(str(health.get("stateDir", ""))).resolve()
            if health_root == app.resolve() or state_root in states:
                raise InstallError("Frame is running. Pause/drain its tasks and intentionally stop the verified service before applying an app update.")
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        pass
    for state in states:
        pid_file = state / "service.pid"
        if not pid_file.is_file():
            continue
        try:
            pid = int(pid_file.read_text(encoding="utf-8").strip())
            if pid <= 0:
                raise ValueError()
        except (OSError, ValueError) as error:
            raise InstallError("Invalid Frame service record; inspect it before an update.") from error
        # Windows os.kill(pid, 0) may terminate processes: use tasklist instead.
        if sys.platform == "win32":
            import subprocess
            try:
                result = subprocess.run(["tasklist", "/FI", "PID eq %d" % pid, "/FO", "CSV", "/NH"], capture_output=True, text=True, check=True, timeout=15)
            except (OSError, subprocess.SubprocessError) as error:
                raise InstallError("Cannot verify the recorded process; inspect Frame before updating.") from error
            alive = bool(re.search(r'"%d"' % pid, result.stdout))
        else:
            try:
                os.kill(pid, 0)
                alive = True
            except ProcessLookupError:
                alive = False
            except PermissionError:
                alive = True
        if alive:
            raise InstallError("A live process has Frame's service record. Verify its identity and intentionally stop Frame; this installer never kills a PID.")


def plan(source, destination, scope):
    source, destination = roots(source, destination)
    for snapshot in destination.parent.glob(".marketing-tools-backup-*"):
        record = snapshot / "recovery.json"
        if record.is_file():
            recovery = read_json(record)
            if recovery.get("destination") == str(destination):
                raise InstallError("An interrupted transaction needs recovery before an update: " + str(snapshot))
    release, files = source_files(source)
    manifest = read_manifest(destination)
    selected = SCOPES[scope]
    wanted = {p: item for p, item in files.items() if item["component"] in selected | {"shared"}}
    old = {p: item for p, item in manifest["files"].items() if item["component"] in selected | {"shared"}}
    changes, removed = [], []
    for relative in sorted(set(old) | set(wanted)):
        target = checked_path(destination, relative)
        exists = target.exists()
        current = digest(target) if exists else None
        if relative in old and exists and current != old[relative]["sha256"]:
            raise InstallError("Locally modified managed file; preserve/resolve it first: " + relative)
        if relative not in old and exists:
            raise InstallError("Unowned file conflicts with installation: " + relative)
        if relative in wanted:
            if current != wanted[relative]["sha256"]:
                changes.append(relative)
        elif exists:
            removed.append(relative)
    updated = json.loads(json.dumps(manifest))
    for relative in old:
        updated["files"].pop(relative, None)
    updated["files"].update(wanted)
    for component in selected:
        updated["components"][component] = release["components"][component]["version"]
    return source, destination, changes, removed, updated


def atomic_copy(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".marketing-tools-write-", dir=target.parent)
    os.close(fd)
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def install_lock_path(destination):
    identity = hashlib.sha256(str(destination.resolve()).encode("utf-8")).hexdigest()[:24]
    return destination.parent / (".marketing-tools-lock-" + identity)


def apply(source, destination, scope):
    source, destination = roots(source, destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    lock = install_lock_path(destination)
    try:
        descriptor = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError as error:
        raise InstallError("Another install/update holds the destination lock. Verify its process and any recovery snapshot before removing a stale lock: " + str(lock)) from error
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump({"process_id": os.getpid(), "destination": str(destination)}, handle)
            handle.write("\n")
        return apply_transaction(source, destination, scope)
    finally:
        lock.unlink()


def apply_transaction(source, destination, scope):
    source, destination, changed, removed, manifest = plan(source, destination, scope)
    if "frame" in SCOPES[scope]:
        frame_running_guard(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix=".marketing-tools-backup-", dir=destination.parent))
    touched = changed + removed + [MANIFEST]
    existed = []
    try:
        for relative in touched:
            target = destination / relative
            if target.exists():
                saved = backup / relative
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, saved)
                existed.append(relative)
        (backup / "recovery.json").write_text(json.dumps({"destination": str(destination), "touched": touched, "previously_existing": existed}, indent=2) + "\n", encoding="utf-8")
        destination.mkdir(parents=True, exist_ok=True)
        # Each copy uses a same-directory atomic replace; the snapshot can undo the set.
        for relative in changed:
            candidate = checked_path(source, relative)
            if digest(candidate) != manifest["files"][relative]["sha256"]:
                raise InstallError("Source changed during installation: " + relative)
            atomic_copy(candidate, checked_path(destination, relative))
        for relative in removed:
            checked_path(destination, relative).unlink()
        manifest_file = backup / "new-manifest.json"
        manifest_file.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        atomic_copy(manifest_file, destination / MANIFEST)
    except BaseException as error:
        try:
            for relative in touched:
                target = destination / relative
                if relative in existed:
                    atomic_copy(backup / relative, target)
                elif target.is_file():
                    target.unlink()
        except BaseException:
            raise InstallError("Installation failed; rollback needs attention. Recovery snapshot retained: " + str(backup)) from error
        shutil.rmtree(backup)
        raise
    shutil.rmtree(backup)
    return {"written": changed, "removed": removed, "components": manifest["components"]}


def verify(destination, scope):
    manifest = read_manifest(destination)
    selected = SCOPES[scope]
    if not selected.issubset(manifest["components"]):
        raise InstallError("Requested components are not installed.")
    checked = 0
    for relative, item in manifest["files"].items():
        if item["component"] not in selected | {"shared"}:
            continue
        target = checked_path(destination, relative)
        if not target.is_file() or digest(target) != item["sha256"]:
            raise InstallError("Installed file is missing or changed: " + relative)
        checked += 1
    return {"verified_files": checked, "components": {key: manifest["components"][key] for key in selected}}


def configure_runtime(destination, scope, executable):
    import subprocess
    if "frame" not in SCOPES[scope]:
        raise InstallError("Marketing-only installations do not need a Node runtime.")
    verify(destination, "frame")
    if executable is None or not executable.is_absolute() or not executable.is_file():
        raise InstallError("Provide --node with the verified absolute Node executable path.")
    try:
        result = subprocess.run([str(executable), "-e", "console.log(JSON.stringify({version:process.versions.node,nodePath:process.execPath}))"], capture_output=True, text=True, check=True, timeout=15)
        runtime = json.loads(result.stdout)
        version = tuple(int(part) for part in runtime["version"].split("."))
        if len(version) != 3 or version < (22, 13, 0) or not Path(runtime["nodePath"]).is_absolute():
            raise ValueError()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        raise InstallError("Frame requires a working Node 22.13.0 or newer executable.") from error
    target = destination / "apps" / "frame" / ".frame-runtime.json"
    if target.is_symlink():
        raise InstallError("Runtime metadata must not be a symlink.")
    with tempfile.TemporaryDirectory() as temporary:
        staged = Path(temporary) / "runtime.json"
        staged.write_text(json.dumps({"nodePath": runtime["nodePath"]}, indent=2) + "\n", encoding="utf-8")
        atomic_copy(staged, target)
    return {"node_version": runtime["version"], "runtime_configured": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("plan", "apply", "verify", "configure-runtime"))
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--scope", choices=tuple(SCOPES), required=True)
    parser.add_argument("--node", type=Path, help="Absolute Node executable for configure-runtime only")
    args = parser.parse_args()
    try:
        if args.command == "configure-runtime":
            result = configure_runtime(args.destination.absolute(), args.scope, args.node)
        elif args.command == "verify":
            result = verify(args.destination.absolute(), args.scope)
        elif args.command == "apply":
            result = apply(args.source.absolute(), args.destination.absolute(), args.scope)
        else:
            _, _, written, removed, manifest = plan(args.source.absolute(), args.destination.absolute(), args.scope)
            result = {"written": written, "removed": removed, "components": manifest["components"], "frame_service_check": "required during apply" if "frame" in SCOPES[args.scope] else "not needed"}
        print(json.dumps(result, indent=2))
    except (InstallError, OSError) as error:
        print("Installation blocked: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
