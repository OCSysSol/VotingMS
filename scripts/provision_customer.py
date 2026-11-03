#!/usr/bin/env python3
"""
Provision a new customer deployment.

Creates a Neon project, runs Alembic migrations, provisions Neon Auth,
creates a Vercel project, sets SMTP_ENCRYPTION_KEY, attaches the production
domain, and invites the initial admin user.

The Neon-Vercel integration automatically injects DATABASE_URL and
DATABASE_URL_UNPOOLED into the Vercel build and Lambda environment — no
manual database env var setup is required.

Usage:
    python scripts/provision_customer.py \
        --name "Acme Strata Management" \
        --slug acme-strata \
        --admin-email admin@acme-strata.com \
        --plan standard

Required env vars (or macOS Keychain):
    NEON_API_KEY     — Keychain: service=agm-survey, account=neon-api-key
    VERCEL_API_TOKEN — Keychain: service=agm-survey, account=vercel-bypass-token
"""

import argparse
import os
import re
import secrets
import subprocess
import sys
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

NEON_API = "https://console.neon.tech/api/v2"
VERCEL_API = "https://api.vercel.com"
VERCEL_TEAM_SLUG = "ocss"

KEYCHAIN_SERVICE = "agm-survey"

VERCEL_GIT_REPO = {
    "type": "github",
    "repo": "OCSysSol/VotingMS",
}

SCRIPT_DIR = Path(__file__).parent
BACKEND_DIR = SCRIPT_DIR.parent / "backend"

# ---------------------------------------------------------------------------
# Credential helpers
# ---------------------------------------------------------------------------


def _keychain(account: str) -> str | None:
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"],
            capture_output=True,
            text=True,
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except FileNotFoundError:
        return None


def get_neon_api_key() -> str:
    key = os.environ.get("NEON_API_KEY") or _keychain("neon-api-key")
    if not key:
        sys.exit("ERROR: NEON_API_KEY not set and not found in Keychain")
    return key


def get_vercel_token() -> str:
    token = os.environ.get("VERCEL_API_TOKEN") or _keychain("vercel-bypass-token")
    if not token:
        sys.exit("ERROR: VERCEL_API_TOKEN not set and not found in Keychain")
    return token


# ---------------------------------------------------------------------------
# Argument parsing + validation
# ---------------------------------------------------------------------------

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Provision a new customer deployment")
    p.add_argument("--name", required=True, help="Customer display name")
    p.add_argument("--slug", required=True, help="URL-safe slug (lowercase alphanumeric + hyphens)")
    p.add_argument("--admin-email", required=True, dest="admin_email", help="Initial admin email")
    p.add_argument("--plan", required=True, choices=["free", "standard", "enterprise"])
    return p.parse_args()


def validate(args: argparse.Namespace) -> None:
    if not SLUG_RE.match(args.slug):
        sys.exit(
            f"ERROR: --slug '{args.slug}' is invalid. "
            "Must be lowercase alphanumeric + hyphens, 3-63 characters, "
            "no leading/trailing hyphens."
        )
    if not EMAIL_RE.match(args.admin_email):
        sys.exit(f"ERROR: --admin-email '{args.admin_email}' is not a valid email address.")


# ---------------------------------------------------------------------------
# Connection-string helpers
# ---------------------------------------------------------------------------


def sanitise_connection_uri(uri: str) -> str:
    """Strip channel_binding, normalise ssl= (same logic as api/index.py)."""
    uri = re.sub(r"[&?]channel_binding=[^&]*", "", uri)
    uri = re.sub(r"channel_binding=[^&]*&?", "", uri)
    uri = uri.replace("sslmode=", "ssl=")
    connector = "&" if "?" in uri else "?"
    if "ssl=" not in uri:
        uri = f"{uri}{connector}ssl=require"
    if uri.startswith("postgresql://") or uri.startswith("postgres://"):
        uri = "postgresql+asyncpg://" + uri.split("://", 1)[1]
    return uri


# ---------------------------------------------------------------------------
# Step 1: Create Neon project (always new — error if slug already taken)
# ---------------------------------------------------------------------------


def create_neon_project(slug: str, neon_key: str) -> dict:
    headers = {"Authorization": f"Bearer {neon_key}", "Content-Type": "application/json"}

    resp = requests.get(f"{NEON_API}/projects", headers=headers, timeout=30)
    resp.raise_for_status()
    project_name = f"{slug}-vms"
    for project in resp.json().get("projects", []):
        if project["name"] == project_name:
            sys.exit(
                f"ERROR: Neon project '{project_name}' already exists (id: {project['id']}). "
                "Choose a different slug or delete the existing project first."
            )
    resp = requests.post(
        f"{NEON_API}/projects",
        headers=headers,
        json={"project": {"name": project_name, "pg_version": 16}},
        timeout=60,
    )
    if not resp.ok:
        sys.exit(f"ERROR: Failed to create Neon project: {resp.status_code} {resp.text}")

    project = resp.json()["project"]
    print(f"  Created Neon project '{project_name}': {project['id']}")
    return project


def get_neon_connection_uris(project_id: str, neon_key: str) -> tuple[str, str]:
    """Return (pooled_uri, unpooled_uri) for the project's default branch."""
    headers = {"Authorization": f"Bearer {neon_key}"}

    resp = requests.get(f"{NEON_API}/projects/{project_id}/branches", headers=headers, timeout=30)
    resp.raise_for_status()
    branches = resp.json()["branches"]
    default_branch = next((b for b in branches if b.get("default")), branches[0])
    branch_id = default_branch["id"]

    resp = requests.get(
        f"{NEON_API}/projects/{project_id}/endpoints", headers=headers, timeout=30
    )
    resp.raise_for_status()
    endpoints = resp.json()["endpoints"]
    branch_endpoints = [e for e in endpoints if e.get("branch_id") == branch_id]
    if not branch_endpoints:
        sys.exit(f"ERROR: No endpoints found for Neon project {project_id}")

    unpooled_ep = next(
        (e for e in branch_endpoints if e.get("type") == "read_write"), branch_endpoints[0]
    )

    resp = requests.get(
        f"{NEON_API}/projects/{project_id}/connection_uri",
        headers=headers,
        params={"branch_id": branch_id, "endpoint_id": unpooled_ep["id"]},
        timeout=30,
    )
    resp.raise_for_status()
    unpooled_uri = resp.json()["uri"]

    pooled_uri = unpooled_uri.replace(
        unpooled_ep["host"],
        unpooled_ep["host"].replace(".neon.tech", "-pooler.neon.tech", 1),
    )

    return sanitise_connection_uri(pooled_uri), sanitise_connection_uri(unpooled_uri)


# ---------------------------------------------------------------------------
# Step 2: Run Alembic migrations
# ---------------------------------------------------------------------------


def run_migrations(unpooled_uri: str) -> None:
    cmd = ["uv", "run", "alembic", "-x", f"dburl={unpooled_uri}", "upgrade", "head"]
    result = subprocess.run(cmd, cwd=BACKEND_DIR)
    if result.returncode != 0:
        sys.exit("ERROR: Alembic migration failed. See output above.")
    print("  Migrations applied successfully.")


# ---------------------------------------------------------------------------
# Step 3: Provision Neon Auth (Better Auth) — best-effort
# ---------------------------------------------------------------------------


def provision_neon_auth(project_id: str, org_name: str, neon_key: str) -> dict:
    """Enable Neon Auth and return auth env vars. Warns and continues on failure."""
    headers = {"Authorization": f"Bearer {neon_key}", "Content-Type": "application/json"}

    resp = requests.post(
        f"{NEON_API}/projects/{project_id}/auth",
        headers=headers,
        json={"organization_name": org_name},
        timeout=60,
    )
    if not resp.ok:
        print(
            f"  [warn] Neon Auth provisioning returned {resp.status_code}: {resp.text}\n"
            "         Enable Neon Auth manually via the Neon console, then re-run."
        )
        return {}

    data = resp.json()
    auth_vars = {
        "NEON_AUTH_BASE_URL": data.get("auth_base_url", ""),
        "NEON_AUTH_COOKIE_SECRET": data.get("cookie_secret", ""),
    }
    print(f"  Neon Auth provisioned. Base URL: {auth_vars['NEON_AUTH_BASE_URL']}")
    return auth_vars


# ---------------------------------------------------------------------------
# Step 4: Create Vercel project (always new — error if slug already taken)
# ---------------------------------------------------------------------------


def create_vercel_project(slug: str, vercel_token: str) -> dict:
    headers = {"Authorization": f"Bearer {vercel_token}", "Content-Type": "application/json"}
    params = {"teamSlug": VERCEL_TEAM_SLUG}

    resp = requests.get(
        f"{VERCEL_API}/v9/projects", headers=headers, params=params, timeout=30
    )
    resp.raise_for_status()
    project_name = f"{slug}-vms"
    for project in resp.json().get("projects", []):
        if project["name"] == project_name:
            sys.exit(
                f"ERROR: Vercel project '{project_name}' already exists (id: {project['id']}). "
                "Choose a different slug or delete the existing project first."
            )

    payload = {
        "name": project_name,
        "framework": "vite",
        "gitRepository": VERCEL_GIT_REPO,
        "productionBranch": "master",
        "buildCommand": (
            "cd backend && uv run alembic -x dburl=$DATABASE_URL_UNPOOLED upgrade head"
            " && cd ../frontend && npm run build"
        ),
        "outputDirectory": "frontend/dist",
        "installCommand": "cd frontend && npm install && cd ../backend && uv sync",
    }
    resp = requests.post(
        f"{VERCEL_API}/v9/projects", headers=headers, params=params, json=payload, timeout=60
    )
    if not resp.ok:
        sys.exit(f"ERROR: Failed to create Vercel project: {resp.status_code} {resp.text}")

    project = resp.json()
    print(f"  Created Vercel project '{project_name}': {project['id']}")
    return project


# ---------------------------------------------------------------------------
# Step 5: Set SMTP_ENCRYPTION_KEY env var
# ---------------------------------------------------------------------------


def set_smtp_encryption_key(project_id: str, vercel_token: str) -> None:
    headers = {"Authorization": f"Bearer {vercel_token}", "Content-Type": "application/json"}
    params = {"teamSlug": VERCEL_TEAM_SLUG}

    payload = {
        "key": "SMTP_ENCRYPTION_KEY",
        "value": secrets.token_hex(32),
        "type": "encrypted",
        "target": ["production", "preview", "development"],
    }
    resp = requests.post(
        f"{VERCEL_API}/v9/projects/{project_id}/env",
        headers=headers,
        params=params,
        json=payload,
        timeout=30,
    )
    if not resp.ok:
        print(f"  [warn] Failed to set SMTP_ENCRYPTION_KEY: {resp.status_code} {resp.text}")
    else:
        print("  SMTP_ENCRYPTION_KEY set.")


# ---------------------------------------------------------------------------
# Step 6: Attach production domain
# ---------------------------------------------------------------------------


def attach_production_domain(project_id: str, slug: str, vercel_token: str) -> str:
    """Attach <slug>-ocss.vercel.app to the production environment."""
    domain = f"{slug}-ocss.vercel.app"
    headers = {"Authorization": f"Bearer {vercel_token}", "Content-Type": "application/json"}
    params = {"teamSlug": VERCEL_TEAM_SLUG}

    # gitBranch omitted → maps to production
    resp = requests.post(
        f"{VERCEL_API}/v9/projects/{project_id}/domains",
        headers=headers,
        params=params,
        json={"name": domain},
        timeout=30,
    )
    if not resp.ok:
        print(
            f"  [warn] Failed to attach domain '{domain}': {resp.status_code} {resp.text}\n"
            "         Attach it manually in the Vercel dashboard."
        )
    else:
        print(f"  Production domain attached: https://{domain}")
    return domain


# ---------------------------------------------------------------------------
# Step 7: Invite initial admin user (Neon Auth)
# ---------------------------------------------------------------------------


def invite_admin_user(
    project_id: str, admin_email: str, auth_base_url: str, neon_key: str
) -> None:
    if not auth_base_url:
        print(
            "  [skip] Neon Auth not provisioned — invite the admin user manually "
            "via the Neon console once auth is enabled."
        )
        return

    headers = {"Authorization": f"Bearer {neon_key}", "Content-Type": "application/json"}
    resp = requests.post(
        f"{NEON_API}/projects/{project_id}/auth/invite",
        headers=headers,
        json={"email": admin_email, "role": "owner"},
        timeout=30,
    )
    if not resp.ok:
        print(
            f"  [warn] Failed to send admin invite: {resp.status_code} {resp.text}\n"
            "         Invite the user manually via the Neon console."
        )
        return

    invite_link = resp.json().get("invite_url", "(not returned by API)")
    print(f"\n  Admin invite link:\n    {invite_link}")
    print(f"  Forward this link to: {admin_email}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    args = parse_args()
    validate(args)

    neon_key = get_neon_api_key()
    vercel_token = get_vercel_token()

    slug = args.slug

    print(f"\n=== Provisioning customer: {args.name!r} (slug: {slug}) ===\n")

    print("[1/7] Creating Neon project...")
    neon_project = create_neon_project(slug, neon_key)
    neon_project_id = neon_project["id"]

    print("[2/7] Fetching connection URIs...")
    _, unpooled_uri = get_neon_connection_uris(neon_project_id, neon_key)

    print("[3/7] Running Alembic migrations...")
    run_migrations(unpooled_uri)

    print("[4/7] Provisioning Neon Auth...")
    auth_vars = provision_neon_auth(neon_project_id, args.name, neon_key)

    print("[5/7] Creating Vercel project...")
    vercel_project = create_vercel_project(slug, vercel_token)
    vercel_project_id = vercel_project["id"]

    print("[6/7] Setting SMTP_ENCRYPTION_KEY...")
    set_smtp_encryption_key(vercel_project_id, vercel_token)

    print("[7/7] Attaching production domain...")
    production_domain = attach_production_domain(vercel_project_id, slug, vercel_token)

    print("\n[+] Inviting initial admin user...")
    invite_admin_user(
        neon_project_id,
        args.admin_email,
        auth_vars.get("NEON_AUTH_BASE_URL", ""),
        neon_key,
    )

    print("\n=== Provisioning complete ===")
    print(f"  Neon project ID  : {neon_project_id}")
    print(f"  Production URL   : https://{production_domain}")
    print(f"  Vercel dashboard : https://vercel.com/{VERCEL_TEAM_SLUG}/{slug}-vms")
    print(
        "\n  Next steps:"
        "\n    1. Connect the Neon project to the Vercel project via the Neon-Vercel "
        "integration in the Neon console (injects DATABASE_URL automatically)"
        "\n    2. Push the repository — Vercel will auto-deploy on the next push"
        "\n    3. Forward the admin invite link (printed above) to the customer"
        "\n    4. Customer sets their password and logs in at /admin/login"
    )


if __name__ == "__main__":
    main()
