#!/usr/bin/env fish
# Stop hook (project-scoped): AGENTS.md + CLAUDE.md drift detection and repair.
#
# What it does:
#   AUTO-FIX:  Extensions on disk but missing from AGENTS.md berrygems table
#              → appends stub row (💭 state, placeholder description)
#   REPORT:    Skills on disk but missing from AGENTS.md morsels table
#   REPORT:    Table entries whose file/directory no longer exists on disk
#   REPORT:    🐣 in-progress extensions missing a per-feature AGENTS.md
#   REPORT:    CLAUDE.md ally table drift vs cc-plugin/agents/
#
# Trigger: only when the session touched a doc- or inventory-relevant path.
# Never blocks. Logs to ~/.claude/logs/stop-hooks.log.

set -l payload (cat)
set -l logdir ~/.claude/logs
set -l log $logdir/stop-hooks.log
mkdir -p $logdir

set -l report (echo $payload | python3 -c '
import json, re, sys
from pathlib import Path

try:
    d = json.loads(sys.stdin.read())
except (json.JSONDecodeError, ValueError):
    sys.exit(0)

tp = d.get("transcript_path")
if not tp or not Path(tp).exists():
    sys.exit(0)

transcript = Path(tp).read_text(errors="replace")

# Only run when the session touched inventory-relevant paths
TRIGGER_PATTERNS = [
    "berrygems/extensions", "morsels/skills", "cc-plugin/agents",
    "AGENTS.md", "CLAUDE.md", ".ts", ".go",
]
if not any(p in transcript for p in TRIGGER_PATTERNS):
    sys.exit(0)

repo = Path(".")
agents_md_path = repo / "AGENTS.md"
claude_md_path = repo / "CLAUDE.md"

if not agents_md_path.exists():
    sys.exit(0)

agents_text = agents_md_path.read_text()
findings = []
fixes = []

# -------------------------------------------------------------------------
# Helper: extract names from a table section between two anchor strings
# -------------------------------------------------------------------------
def extract_table_names(text, section_start, section_end):
    m = re.search(
        re.escape(section_start) + r"(.*?)" + re.escape(section_end),
        text, re.DOTALL,
    )
    if not m:
        return set(), m
    section = m.group(1)
    # Match | emoji | name | desc | — name may have trailing / for dirs
    names = set(re.findall(r"\|\s*[💭🥚🐣🔥💎]\s*\|\s*([\w\-]+)/?", section))
    return names, m


# -------------------------------------------------------------------------
# 1. Extensions: auto-fix missing, report stale
# -------------------------------------------------------------------------
ext_dir = repo / "berrygems" / "extensions"
if ext_dir.exists():
    on_disk_exts = set()
    for p in ext_dir.iterdir():
        # strip .ts suffix for single-file extensions
        name = p.stem if p.is_file() and p.suffix == ".ts" else p.name
        if name.startswith(".") or name == "__pycache__":
            continue
        on_disk_exts.add(name)

    in_table_exts, ext_match = extract_table_names(
        agents_text,
        "### berrygems — Extensions",
        "### berrygems — Library",
    )

    missing_exts = on_disk_exts - in_table_exts
    stale_exts   = in_table_exts - on_disk_exts

    if missing_exts and ext_match:
        # Build new stub rows and insert before the Library section
        stub_rows = ""
        for name in sorted(missing_exts):
            stub_rows += f"\n| 💭  | {name:<19} | _New — add description and set lifecycle emoji_ |"
        # Insert stubs just before the "### berrygems — Library" anchor
        insert_anchor = "### berrygems — Library"
        agents_text = agents_text.replace(
            insert_anchor,
            stub_rows + "\n\n" + insert_anchor,
            1,
        )
        fixes.append(f"AUTO-ADDED {len(missing_exts)} extension stub(s): {', '.join(sorted(missing_exts))}")

    if stale_exts:
        findings.append(f"STALE extensions in table, not on disk: {', '.join(sorted(stale_exts))}")

    # Check 🐣 in-progress extensions for per-feature AGENTS.md
    in_progress_pattern = re.compile(
        r"\|\s*🐣\s*\|\s*([\w\-]+)/?", re.MULTILINE
    )
    for m2 in in_progress_pattern.finditer(agents_text):
        ext_name = m2.group(1).rstrip("/")
        expected = ext_dir / ext_name / "AGENTS.md"
        if not expected.exists():
            findings.append(f"IN-PROGRESS extension '{ext_name}' missing per-feature AGENTS.md at {expected}")


# -------------------------------------------------------------------------
# 2. Skills: report-only (table is curated, not comprehensive)
# -------------------------------------------------------------------------
skills_dir = repo / "morsels" / "skills"
if skills_dir.exists():
    on_disk_skills = {
        p.name for p in skills_dir.iterdir()
        if p.is_dir() and not p.name.startswith(".")
    }

    in_table_skills, _ = extract_table_names(
        agents_text,
        "### morsels — Skills",
        "### storybook-daemon",
    )

    missing_skills = on_disk_skills - in_table_skills
    stale_skills   = in_table_skills - on_disk_skills

    if missing_skills:
        # Split into likely-hoard-specific vs likely-general
        hoard_prefixes = ("dragon-", "hoard-", "kobold-", "pi-", "kitty-", "extension-", "skill-")
        hoard_missing  = {s for s in missing_skills if any(s.startswith(p) for p in hoard_prefixes)}
        general_missing = missing_skills - hoard_missing

        if hoard_missing:
            findings.append(
                f"UNDOCUMENTED hoard skills (consider adding to table): {', '.join(sorted(hoard_missing))}"
            )
        if general_missing:
            findings.append(
                f"UNDOCUMENTED general skills (add to table or delete stub dir): {', '.join(sorted(general_missing))}"
            )

    if stale_skills:
        findings.append(f"STALE skills in table, not on disk: {', '.join(sorted(stale_skills))}")


# -------------------------------------------------------------------------
# 3. CLAUDE.md: ally table vs cc-plugin/agents/
# -------------------------------------------------------------------------
agents_dir = repo / "cc-plugin" / "agents"
if agents_dir.exists() and claude_md_path.exists():
    claude_text = claude_md_path.read_text()

    # Names from cc-plugin/agents/*.md frontmatter name: field
    plugin_allies = set()
    for f in agents_dir.glob("*.md"):
        m3 = re.search(r"^name:\s*(.+)$", f.read_text(), re.MULTILINE)
        if m3:
            plugin_allies.add(m3.group(1).strip())

    # Names from CLAUDE.md ally table (hoard:ally-* pattern)
    table_allies = set(re.findall(r"`hoard:(ally-[\w-]+)`", claude_text))

    missing_allies = {f"hoard:{a}" for a in plugin_allies} - {f"hoard:{a}" for a in table_allies}
    if missing_allies:
        findings.append(f"CLAUDE.md ally table missing: {', '.join(sorted(missing_allies))}")

    # Check for bare names (non-namespaced) in CLAUDE.md ally table
    bare_names = set(re.findall(r"`(ally-[\w-]+)`", claude_text))
    if bare_names:
        findings.append(f"CLAUDE.md ally table has non-namespaced names (should be hoard:ally-*): {', '.join(sorted(bare_names))}")


# -------------------------------------------------------------------------
# Write auto-fixes back to AGENTS.md
# -------------------------------------------------------------------------
if fixes:
    agents_md_path.write_text(agents_text)


# -------------------------------------------------------------------------
# Emit report
# -------------------------------------------------------------------------
lines = []
if fixes:
    lines.append("doc-sync: " + "; ".join(fixes))
if findings:
    lines.append("doc-sync warnings:")
    for f in findings:
        lines.append(f"  • {f}")
if not fixes and not findings:
    lines.append("doc-sync: inventory consistent, no drift detected")

print("\n".join(lines))
')

if test -n "$report"
    echo $report
    echo $report >> $log
end
