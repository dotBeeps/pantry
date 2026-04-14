#!/usr/bin/env fish
# PreToolUse hook (project-scoped): block direct edits to go.sum
#
# go.sum is managed exclusively by `go mod tidy`. Direct edits break
# reproducibility and may corrupt the dependency graph. Never touch it.
#
# Blocks: Edit, Write on any path matching */go.sum

set -l payload (cat)

set -l file_path (echo $payload | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    ti = d.get("tool_input", d)
    print(ti.get("file_path", "") or ti.get("path", ""))
except Exception:
    print("")
' 2>/dev/null)

if string match -q "*/go.sum" -- $file_path; or test "$file_path" = "go.sum"
    echo "BLOCKED: go.sum is managed by 'go mod tidy' — do not edit directly." >&2
    echo "Run: cd <package> && go mod tidy" >&2
    exit 2
end

exit 0
