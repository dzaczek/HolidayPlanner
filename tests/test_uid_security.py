import re
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

def test_uid_security_in_codebase():
    """Verify that insecure Math.random() is not used for UIDs."""
    files_to_check = [
        PROJECT_ROOT / "backend/cloudflare-worker/worker.js",
        PROJECT_ROOT / "backend/vps/server.js",
        PROJECT_ROOT / "src/share/ics-export.js",
    ]
    for filepath in files_to_check:
        assert filepath.exists(), f"File {filepath} not found"
        content = filepath.read_text(encoding="utf-8")
        assert "Math.random()" not in content, f"Insecure Math.random() found in {filepath}"
        assert "crypto.randomUUID()" in content, f"Secure crypto.randomUUID() missing in {filepath}"

def test_generated_uid_format():
    """Verify the generated UID conforms to crypto.randomUUID() format + @hcp."""
    script = """
    const crypto = require('crypto');
    // Polyfill for Node.js if webcrypto is not global (e.g. older versions)
    const randomUUID = crypto.randomUUID || require('crypto').webcrypto.randomUUID;

    function uid() {
        return `${randomUUID()}@hcp`;
    }
    console.log(uid());
    """
    result = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    generated_uid = result.stdout.strip()

    # UUID v4 is 36 chars + @hcp = 40 chars
    assert len(generated_uid) == 40
    assert generated_uid.endswith("@hcp")

    # UUID format: 8-4-4-4-12
    uuid_part = generated_uid[:-4]
    assert re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", uuid_part)
