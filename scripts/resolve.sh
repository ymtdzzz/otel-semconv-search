#!/usr/bin/env bash
#
# resolve.sh — resolve each semconv release tag (>= FLOOR) into
# $RESOLVED_DIR/<version>.json using a local weaver binary.
#
# Uses `weaver registry generate` with a tojson template (the non-deprecated
# equivalent of `registry resolve -f json`). Output is a cache: immutable tags
# already present are skipped. build-data.ts consumes only this directory and
# derives versions/floor from filenames; weaver provenance is recorded in
# provenance.json.
#
# Registry source:
#   - default: remote git URL. weaver fetches each tag itself (what CI uses).
#   - SEMCONV_REPO set: resolve offline from a local checkout (no network).
#
# Env:
#   WEAVER_BIN    weaver binary (default: weaver)
#   FLOOR         oldest version to resolve (default: 1.26.0)
#   RESOLVED_DIR  output dir (default: data/resolved)
#   SEMCONV_URL   remote registry git URL (default: upstream semantic-conventions)
#   SEMCONV_REPO  local semconv checkout; when set, resolve offline from it
set -euo pipefail

WEAVER_BIN="${WEAVER_BIN:-weaver}"
FLOOR="${FLOOR:-1.26.0}"
RESOLVED_DIR="${RESOLVED_DIR:-data/resolved}"
SEMCONV_URL="${SEMCONV_URL:-https://github.com/open-telemetry/semantic-conventions.git}"
TPL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/weaver-templates"

die() { echo "resolve: error: $*" >&2; exit 1; }
log() { echo "resolve: $*" >&2; }

command -v git >/dev/null || die "git not found in PATH"
command -v "$WEAVER_BIN" >/dev/null || die "weaver not found: $WEAVER_BIN (install it or set WEAVER_BIN)"
[ -f "$TPL_DIR/weaver.yaml" ] || die "weaver templates missing at $TPL_DIR"

# True when version $1 >= FLOOR (FLOOR sorts first iff $1 is not smaller).
ge_floor() { [ "$(printf '%s\n%s\n' "$FLOOR" "$1" | sort -V | head -n1)" = "$FLOOR" ]; }

list_tags() {
  if [ -n "${SEMCONV_REPO:-}" ]; then
    [ -d "$SEMCONV_REPO/.git" ] || die "SEMCONV_REPO is not a git repo: $SEMCONV_REPO"
    git -C "$SEMCONV_REPO" tag
  else
    git ls-remote --tags "$SEMCONV_URL" | sed -e 's#.*refs/tags/##' -e 's/\^{}//'
  fi
}

tags=()
while IFS= read -r tag; do
  [[ "$tag" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
  ge_floor "${tag#v}" || continue
  tags+=("$tag")
done < <(list_tags | sort -V -u)

[ "${#tags[@]}" -gt 0 ] || die "no release tags >= $FLOOR found"

mkdir -p "$RESOLVED_DIR"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Resolve one tag's registry into $2 (a <version>.json file).
resolve_tag() {
  local tag="$1" out="$2" registry outdir="$work/out-${1#v}"
  if [ -n "${SEMCONV_REPO:-}" ]; then
    local m="$work/src-${1#v}"
    mkdir -p "$m"
    git -C "$SEMCONV_REPO" archive "$tag" model | tar -x -C "$m" || die "git archive failed for $tag"
    [ -d "$m/model" ] || die "tag $tag has no model/ directory"
    registry="$m/model"
  else
    registry="$SEMCONV_URL@$tag[model]"
  fi

  rm -rf "$outdir"
  if ! "$WEAVER_BIN" registry generate -r "$registry" -t "$TPL_DIR" --quiet "" "$outdir" 2>"$work/weaver.err"; then
    tail -n 20 "$work/weaver.err" >&2
    die "weaver generate failed for $tag"
  fi
  # Cache only well-formed output, so a partial/garbled run never poisons the cache.
  if [ ! -s "$outdir/registry" ] || ! grep -q '"groups"' "$outdir/registry"; then
    die "weaver produced unexpected output for $tag (no \"groups\")"
  fi
  mv "$outdir/registry" "$out"
}

resolved=0
cached=0
for tag in "${tags[@]}"; do
  ver="${tag#v}"
  out="$RESOLVED_DIR/$ver.json"
  if [ -f "$out" ]; then
    cached=$((cached + 1))
    continue
  fi
  resolve_tag "$tag" "$out"
  resolved=$((resolved + 1))
  log "  resolved $ver"
done

weaver_version="$("$WEAVER_BIN" --version 2>/dev/null | head -n1 | tr -d '\r' || true)"
[ -n "$weaver_version" ] || weaver_version="unknown"
cat >"$RESOLVED_DIR/provenance.json" <<EOF
{
  "weaverVersion": "$weaver_version",
  "source": "${SEMCONV_REPO:-$SEMCONV_URL}",
  "resolvedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

log "done — $resolved resolved, $cached cached -> $RESOLVED_DIR (${tags[0]#v}..${tags[$((${#tags[@]} - 1))]#v}, weaver=$weaver_version)"
