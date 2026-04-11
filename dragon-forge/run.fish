#!/usr/bin/env fish
# dragon-forge entry point.
#
# Forces the correct cwd + Unsloth venv + ROCm env so every invocation is
# identical across sessions. Kills the "where do I run train.py from?"
# rediscovery loop and the double unsloth_compiled_cache bug.
#
# Usage:
#   ./run.fish extract          # walk session logs, emit out/dataset.jsonl
#   ./run.fish train [args...]  # full LoRA training run
#   ./run.fish validate         # 1-batch smoke test (cheap gate before train)
#   ./run.fish eval [args...]   # run probes against the latest adapter
#   ./run.fish dry-run          # build dataset + print sample, skip training
#   ./run.fish python [args...] # raw python in the unsloth venv (escape hatch)

set -l script_dir (realpath (dirname (status --current-filename)))
cd $script_dir; or exit 1

set -x HIP_VISIBLE_DEVICES 0
set -l PY ~/.unsloth/studio/unsloth_studio/bin/python

if not test -x $PY
    echo "error: unsloth venv python not found at $PY" >&2
    echo "       check AGENTS.md Startup section" >&2
    exit 1
end

set -l cmd $argv[1]
set -l rest $argv[2..-1]

switch $cmd
    case extract
        $PY extract.py $rest
    case train
        $PY train.py $rest
    case validate
        $PY train.py --validate $rest
    case dry-run
        $PY train.py --dry-run $rest
    case eval
        $PY eval.py $rest
    case python
        $PY $rest
    case '' -h --help help
        echo "usage: ./run.fish {extract|train|validate|dry-run|eval|python} [args...]"
        echo ""
        echo "  extract   walk session logs, emit out/dataset.jsonl"
        echo "  train     full LoRA training run"
        echo "  validate  1-batch smoke test (required before train)"
        echo "  dry-run   build dataset + print sample, skip training"
        echo "  eval      run probes against the latest adapter"
        echo "  python    raw python in the unsloth venv"
        exit 0
    case '*'
        echo "unknown command: $cmd" >&2
        echo "run ./run.fish --help" >&2
        exit 2
end
