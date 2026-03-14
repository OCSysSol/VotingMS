#!/bin/bash
set -euo pipefail

# Normalise DATABASE_URL_UNPOOLED for asyncpg / alembic
DB=$(python3 - <<'PYEOF'
import os
u = os.environ["DATABASE_URL_UNPOOLED"]
u = u.replace("postgres://", "postgresql+asyncpg://", 1) \
     .replace("postgresql://", "postgresql+asyncpg://", 1) \
     .replace("sslmode=require", "ssl=require") \
     .replace("&channel_binding=require", "") \
     .replace("channel_binding=require&", "") \
     .replace("channel_binding=require", "")
print(u)
PYEOF
)

cd backend
python -m alembic -x dburl="$DB" upgrade head
