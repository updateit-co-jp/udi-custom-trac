#!/usr/bin/env bash
# Smoke test for the uv workflow: lock sync, unit tests, SQLite environment,
# tracd HTTP response, and a translated wheel installed into a fresh uv venv.
# The checkout is copied into a temporary directory first, so the build and
# test artifacts (dist/, build/, Trac.egg-info/) never touch the working tree.
# Usage: contrib/uv-smoke.sh <python-version>   (run from the repository root)
set -euo pipefail

pyver=${1:?usage: contrib/uv-smoke.sh <python-version>}
repo=$(pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/uvsmoke-XXXX")
src="$work/src"
export UV_PROJECT_ENVIRONMENT="$work/venv"
export UV_PYTHON="$pyver"

# Copy only what a clean checkout would contain: tracked files plus untracked,
# non-ignored files (so generated translations such as *.mo and
# htdocs/js/messages/*.js, and build leftovers, are not carried over).
mkdir "$src"
git -C "$repo" ls-files -z -co --exclude-standard -- . ':!:.serena' \
    | rsync -a --from0 --files-from=- "$repo/" "$src/"
cd "$src"

# Install dependencies first, then compile translations, then install Trac.
# A clean checkout has no compiled catalogs, and the editable install of Trac
# fails until `make compile` has produced them (the same as `pip install -e .`).
uv sync --locked --no-install-project
make PYTHON="uv run --no-sync python" compile
uv sync --locked
uv run python -c "
import sys
want = tuple(int(part) for part in '$pyver'.split('.'))
assert sys.version_info[:2] == want, sys.version
"
make PYTHON="uv run python" unit-test

make PYTHON="uv run python" wheel
wheels=("$src"/dist/*.whl)
if [ "${#wheels[@]}" -ne 1 ] || [ ! -f "${wheels[0]}" ]; then
    echo "expected exactly one wheel in dist/, found ${#wheels[@]}" >&2
    exit 1
fi
wheel=${wheels[0]}

# tracd: a free loopback port, a uniquely named environment, and a check that
# the response comes from this environment rather than another server.
port=$(uv run python -c "
import socket
s = socket.socket()
s.bind(('127.0.0.1', 0))
print(s.getsockname()[1])
")
project="uv-smoke-$pyver-$port"
env="$work/env"
uv run trac-admin "$env" initenv "$project" sqlite:db/trac.db

tracd="$UV_PROJECT_ENVIRONMENT/bin/tracd"
"$tracd" --hostname 127.0.0.1 --port "$port" "$env" > "$work/tracd.log" 2>&1 &
pid=$!
body="$work/index.html"
code=000
ok=0
for _ in $(seq 1 30); do
    kill -0 "$pid" 2>/dev/null || break
    code=$(curl -s -o "$body" -w "%{http_code}" "http://127.0.0.1:$port/" || true)
    if [ "$code" = 200 ] && grep -q "$project" "$body"; then
        ok=1
        break
    fi
    sleep 1
done
kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
if [ "$ok" -ne 1 ]; then
    echo "tracd check failed: last HTTP status $code, project $project not found" >&2
    cat "$work/tracd.log" >&2
    exit 1
fi
echo "tracd OK: 127.0.0.1:$port serves project $project"

# Verify the translated wheel in a fresh venv, run from outside the checkout
# so that the copied source tree cannot be picked up.
check_venv="$work/wheel-venv"
uv venv --python "$pyver" "$check_venv"
uv pip install --python "$check_venv/bin/python" "$wheel"
cd "$work"
"$check_venv/bin/python" -I - "$check_venv" <<'PY'
from pathlib import Path
import sys
from importlib.metadata import distribution

venv = Path(sys.argv[1]).resolve()
trac = distribution("Trac")
expected = (
    "trac/locale/ja/LC_MESSAGES/messages.mo",
    "trac/locale/ja/LC_MESSAGES/tracini.mo",
    "trac/htdocs/js/messages/ja.js",
)
for path in expected:
    located = Path(trac.locate_file(path)).resolve()
    if not located.is_file():
        raise SystemExit("Wheel is missing " + path)
    if venv not in located.parents:
        raise SystemExit(path + " resolves outside the installed wheel: " + str(located))
print("wheel OK:", trac.version, "- translation files resolve inside", venv)
PY
echo "PASS py$pyver (work dir: $work)"
