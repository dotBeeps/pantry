#!/usr/bin/env fish
# Stop hook (project-scoped): parity drift audit across the pi/cc boundary.
# Warning-only.
#
# Fires only when the current session touched a parity-relevant path
# (morsels/skills/, cc-plugin/skills/, cc-plugin/agents/). Reads
# .claude/parity-map.json and reports:
#
#   1. On-disk skills/agents not registered in the map (new, unmapped).
#   2. Map entries whose cross-ref points at a missing file (stale).
#
# Same texture as stop-phase-gate.fish: warn, log, never block.

set -l payload (cat)
set -l logdir ~/.claude/logs
set -l log $logdir/stop-hooks.log
mkdir -p $logdir

set -l report (echo $payload | python3 -c '
import json
import re
import sys
from pathlib import Path

try:
    d = json.loads(sys.stdin.read())
except json.JSONDecodeError:
    sys.exit(0)

tp = d.get("transcript_path")
if not tp or not Path(tp).exists():
    sys.exit(0)

text = Path(tp).read_text(errors="replace")
fps = re.findall(r"\"file_path\"\s*:\s*\"([^\"]+)\"", text)

relevant_re = re.compile(
    r"(morsels/skills/|cc-plugin/skills/|cc-plugin/agents/|\.claude/parity-map\.json)"
)
touched = [f for f in fps if relevant_re.search(f)]
if not touched:
    sys.exit(0)

root = Path.cwd()
map_path = root / ".claude" / "parity-map.json"
if not map_path.exists():
    print(f"parity-check: {map_path} missing — cannot audit")
    sys.exit(0)

try:
    pmap = json.loads(map_path.read_text())
except json.JSONDecodeError as e:
    print(f"parity-check: parity-map.json invalid JSON: {e}")
    sys.exit(0)

warnings = []

def list_dirs(p):
    return sorted(x.name for x in p.iterdir() if x.is_dir()) if p.exists() else []

def list_agent_files(p):
    if not p.exists():
        return []
    return sorted(x.stem for x in p.glob("*.md"))

morsels_on_disk = list_dirs(root / "morsels" / "skills")
cc_skills_on_disk = list_dirs(root / "cc-plugin" / "skills")
cc_agents_on_disk = list_agent_files(root / "cc-plugin" / "agents")

morsels_map = pmap.get("morsels", {})
cc_skills_map = pmap.get("cc-plugin-skills", {})
cc_agents_map = pmap.get("cc-plugin-agents", {})

for name in morsels_on_disk:
    if name not in morsels_map:
        warnings.append(f"unregistered morsel: morsels/skills/{name} — add to parity-map.json[morsels]")

for name in cc_skills_on_disk:
    if name not in cc_skills_map:
        warnings.append(f"unregistered cc skill: cc-plugin/skills/{name} — add to parity-map.json[cc-plugin-skills]")

for name in cc_agents_on_disk:
    if name not in cc_agents_map:
        warnings.append(f"unregistered cc agent: cc-plugin/agents/{name}.md — add to parity-map.json[cc-plugin-agents]")

def check_xref(label, ref):
    if ref is None:
        return None
    if not isinstance(ref, str):
        return f"{label}: cross-ref is not a string"
    if ref.startswith("cc-builtin:") or ref.startswith("pi-builtin:"):
        return None
    if ref.startswith("morsels:"):
        target = root / "morsels" / "skills" / ref.split(":", 1)[1]
        return None if target.is_dir() else f"{label}: cross-ref {ref} missing on disk ({target})"
    if ref.startswith("cc-plugin:"):
        slug = ref.split(":", 1)[1]
        if (root / "cc-plugin" / "skills" / slug).is_dir():
            return None
        if (root / "cc-plugin" / "agents" / f"{slug}.md").is_file():
            return None
        return f"{label}: cross-ref {ref} missing on disk"
    if ref.startswith("berrygems:"):
        slug = ref.split(":", 1)[1]
        ext_dir = root / "berrygems" / "extensions"
        if (ext_dir / slug).is_dir():
            return None
        if (ext_dir / f"{slug}.ts").is_file():
            return None
        return f"{label}: cross-ref {ref} missing on disk (expected {ext_dir}/{slug} or {slug}.ts)"
    return f"{label}: cross-ref {ref} uses unknown scheme"

for name, entry in morsels_map.items():
    if name.startswith("$") or not isinstance(entry, dict):
        continue
    if (root / "morsels" / "skills" / name).is_dir() is False:
        warnings.append(f"stale morsel entry: {name} in map but morsels/skills/{name} missing")
    w = check_xref(f"morsels/{name}.cc", entry.get("cc"))
    if w:
        warnings.append(w)

for name, entry in cc_skills_map.items():
    if not isinstance(entry, dict):
        continue
    if (root / "cc-plugin" / "skills" / name).is_dir() is False:
        warnings.append(f"stale cc skill entry: {name} in map but cc-plugin/skills/{name} missing")
    w = check_xref(f"cc-plugin-skills/{name}.pi", entry.get("pi"))
    if w:
        warnings.append(w)

for name, entry in cc_agents_map.items():
    if not isinstance(entry, dict):
        continue
    if (root / "cc-plugin" / "agents" / f"{name}.md").is_file() is False:
        warnings.append(f"stale cc agent entry: {name} in map but cc-plugin/agents/{name}.md missing")
    w = check_xref(f"cc-plugin-agents/{name}.pi", entry.get("pi"))
    if w:
        warnings.append(w)

if warnings:
    print("parity drift detected:")
    for w in warnings:
        print(f"  - {w}")
' 2>/dev/null)

if test -n "$report"
    set -l ts (date +%Y-%m-%dT%H:%M:%S)
    printf '%s parity-check: %s\n' $ts $report >> $log
    for line in $report
        echo "⚠ parity-check: $line"
    end
end
