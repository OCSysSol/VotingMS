from pathlib import Path
import re
import tomllib


_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_PRODUCTION_DEPENDENCY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*")


def _normalized_requirement_name(requirement: str) -> str:
    match = _PRODUCTION_DEPENDENCY.match(requirement.strip())
    assert match is not None
    return re.sub(r"[-_.]+", "-", match.group(0)).lower()


def test_vercel_runtime_manifest_includes_all_production_dependencies() -> None:
    """Vercel installs requirements.txt rather than backend/pyproject.toml."""
    pyproject = tomllib.loads((_PROJECT_ROOT / "backend" / "pyproject.toml").read_text())
    runtime_requirements = {
        _normalized_requirement_name(line)
        for line in (_PROJECT_ROOT / "requirements.txt").read_text().splitlines()
        if line.strip() and not line.lstrip().startswith(("#", "-"))
    }

    production_dependencies = {
        _normalized_requirement_name(requirement)
        for requirement in pyproject["project"]["dependencies"]
    }

    assert production_dependencies <= runtime_requirements
