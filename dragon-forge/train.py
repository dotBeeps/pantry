#!/usr/bin/env python3
"""Fine-tune Qwen 2.5 7B Instruct on Ember's voice with Unsloth LoRA.

Loads the ChatML corpus from out/dataset.jsonl, wraps seed/containment.jsonl
with the combined persona+user-context system prompt (mirroring extract.py),
upsamples seeds to prevent drowning in ambient signal, and runs LoRA SFT with
response-only loss masking so the model only learns from assistant turns.

Runtime: the shared Unsloth studio env (ROCm 7.2 + unsloth 2026.4+):

    ~/.unsloth/studio/unsloth_studio/bin/python train.py [--dry-run]

Usage:
    python train.py                         # defaults: 2 epochs, r=32, lr=2e-4
    python train.py --dry-run               # build dataset only, print sample
    python train.py --epochs 3 --lr 1e-4    # tune
"""

from __future__ import annotations

# Unsloth MUST import before torch-related things so its patches land.
from unsloth import FastLanguageModel  # noqa: I001 (order-sensitive)
from unsloth.chat_templates import train_on_responses_only

import argparse
import json
import random
import sys
from pathlib import Path
from typing import Iterator

from datasets import Dataset
from transformers import DataCollatorForSeq2Seq
from trl import SFTConfig, SFTTrainer

SCRIPT_DIR = Path(__file__).parent
DATASET_PATH = SCRIPT_DIR / "out" / "dataset.jsonl"
SEED_PATH = SCRIPT_DIR / "seed" / "containment.jsonl"
PERSONA_PATH = SCRIPT_DIR / "config" / "persona.md"
USER_CONTEXT_PATH = SCRIPT_DIR / "config" / "user-context.md"
DEFAULT_OUTPUT_DIR = SCRIPT_DIR / "out" / "checkpoints" / "ember-lora"

# ChatML markers that Qwen 2.5's tokenizer emits. train_on_responses_only
# uses these to mask loss on everything before each assistant turn.
INSTRUCTION_PART = "<|im_start|>user\n"
RESPONSE_PART = "<|im_start|>assistant\n"


def load_system_prompt() -> str:
    """Concatenate persona spec + user context with the same separator
    extract.py uses, so seed rows match corpus rows exactly."""
    if not PERSONA_PATH.exists():
        sys.exit(f"persona spec not found at {PERSONA_PATH}")
    if not USER_CONTEXT_PATH.exists():
        sys.exit(f"user context not found at {USER_CONTEXT_PATH}")
    persona = PERSONA_PATH.read_text(encoding="utf-8").strip()
    user_ctx = USER_CONTEXT_PATH.read_text(encoding="utf-8").strip()
    return f"{persona}\n\n---\n\n{user_ctx}"


def iter_corpus() -> Iterator[dict]:
    """Yield rows from out/dataset.jsonl — already ChatML-shaped with the
    combined system prompt baked in by extract.py."""
    if not DATASET_PATH.exists():
        sys.exit(f"dataset not found at {DATASET_PATH}; run extract.py first")
    with open(DATASET_PATH, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)


def iter_seeds(system_prompt: str) -> Iterator[dict]:
    """Yield seed rows from seed/containment.jsonl wrapped with the combined
    system prompt. Raw seed format is {trigger, user, assistant}; `trigger`
    is authorial metadata and gets dropped."""
    if not SEED_PATH.exists():
        sys.exit(f"seed file not found at {SEED_PATH}")
    with open(SEED_PATH, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            yield {
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": d["user"]},
                    {"role": "assistant", "content": d["assistant"]},
                ]
            }


def build_dataset(
    tokenizer,
    seed_upsample: int,
    max_seq_length: int,
    shuffle_seed: int,
) -> Dataset:
    """Load corpus + seeds, upsample seeds, format via Qwen's chat template,
    and drop any row whose tokenized length exceeds max_seq_length."""
    system_prompt = load_system_prompt()
    print(f"  system prompt: {len(system_prompt):,} chars", file=sys.stderr)

    corpus = list(iter_corpus())
    seeds = list(iter_seeds(system_prompt))
    upsampled_seeds = seeds * seed_upsample

    rows = corpus + upsampled_seeds
    rng = random.Random(shuffle_seed)
    rng.shuffle(rows)

    print(f"  corpus rows:   {len(corpus):,}", file=sys.stderr)
    print(
        f"  seed rows:     {len(seeds):,} × {seed_upsample} = {len(upsampled_seeds):,}",
        file=sys.stderr,
    )
    print(f"  total rows:    {len(rows):,}", file=sys.stderr)

    def to_text(row: dict) -> dict:
        text = tokenizer.apply_chat_template(
            row["messages"],
            tokenize=False,
            add_generation_prompt=False,
        )
        return {"text": text}

    ds = Dataset.from_list(rows).map(to_text, remove_columns=["messages"])

    def fits(row: dict) -> bool:
        ids = tokenizer(row["text"], add_special_tokens=False)["input_ids"]
        return len(ids) <= max_seq_length

    before = len(ds)
    ds = ds.filter(fits)
    dropped = before - len(ds)
    if dropped:
        print(
            f"  length filter: dropped {dropped:,} rows > {max_seq_length} tokens",
            file=sys.stderr,
        )
    print(f"  final rows:    {len(ds):,}", file=sys.stderr)
    return ds


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--model",
        default="unsloth/Hermes-3-Llama-3.1-8B-bnb-4bit",
        help="Base model (unsloth pre-quantized preferred for speed)",
    )
    ap.add_argument("--max-seq-length", type=int, default=4096)
    ap.add_argument("--lora-r", type=int, default=32)
    ap.add_argument("--lora-alpha", type=int, default=64)
    ap.add_argument("--lora-dropout", type=float, default=0.05)
    ap.add_argument("--epochs", type=float, default=2.0)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument(
        "--batch-size",
        type=int,
        default=2,
        help="Per-device train batch size",
    )
    ap.add_argument(
        "--grad-accum",
        type=int,
        default=8,
        help="Gradient accumulation steps; effective batch = batch * grad_accum",
    )
    ap.add_argument("--warmup-ratio", type=float, default=0.03)
    ap.add_argument("--weight-decay", type=float, default=0.01)
    ap.add_argument(
        "--seed-upsample",
        type=int,
        default=4,
        help="Multiplier for seed rows (prevents drowning in ambient corpus)",
    )
    ap.add_argument("--seed", type=int, default=3407)
    ap.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Build dataset + print sample, skip training",
    )
    ap.add_argument(
        "--validate",
        action="store_true",
        help="Smoke test: attach LoRA, run 1 micro-batch forward+backward, "
        "assert finite loss, exit. Required before full runs.",
    )
    args = ap.parse_args()

    print("─" * 60, file=sys.stderr)
    print(f"  model:         {args.model}", file=sys.stderr)
    print(f"  max_seq_len:   {args.max_seq_length}", file=sys.stderr)
    print(
        f"  lora:          r={args.lora_r} alpha={args.lora_alpha} dropout={args.lora_dropout}",
        file=sys.stderr,
    )
    print(f"  epochs:        {args.epochs}", file=sys.stderr)
    print(f"  lr:            {args.lr}", file=sys.stderr)
    eff = args.batch_size * args.grad_accum
    print(
        f"  batch:         {args.batch_size} × grad_accum {args.grad_accum} = {eff}",
        file=sys.stderr,
    )
    print(f"  seed_upsample: {args.seed_upsample}×", file=sys.stderr)
    print("─" * 60, file=sys.stderr)

    print("loading model + tokenizer…", file=sys.stderr)
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.model,
        max_seq_length=args.max_seq_length,
        dtype=None,  # auto bf16 on RDNA3
        load_in_4bit=True,
    )

    print("building dataset…", file=sys.stderr)
    ds = build_dataset(
        tokenizer,
        seed_upsample=args.seed_upsample,
        max_seq_length=args.max_seq_length,
        shuffle_seed=args.seed,
    )

    if args.dry_run:
        sample = ds[0]
        print("─" * 60, file=sys.stderr)
        print("  sample row (first 1200 chars):", file=sys.stderr)
        print(sample["text"][:1200], file=sys.stderr)
        print("  …", file=sys.stderr)
        print("─" * 60, file=sys.stderr)
        print("dry run complete — dataset + tokenization verified", file=sys.stderr)
        return 0

    print("attaching LoRA adapters…", file=sys.stderr)
    model = FastLanguageModel.get_peft_model(
        model,
        r=args.lora_r,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=args.seed,
        use_rslora=False,
        loftq_config=None,
    )

    if args.validate:
        import math

        ds_small = ds.select(range(min(4, len(ds))))
        validate_dir = SCRIPT_DIR / "out" / "validate-tmp"
        validate_dir.mkdir(parents=True, exist_ok=True)
        validate_args = SFTConfig(
            output_dir=str(validate_dir),
            per_device_train_batch_size=1,
            gradient_accumulation_steps=1,
            max_steps=1,
            learning_rate=args.lr,
            warmup_ratio=0.0,
            weight_decay=0.0,
            lr_scheduler_type="constant",
            logging_steps=1,
            save_strategy="no",
            report_to="none",
            bf16=True,
            fp16=False,
            optim="adamw_8bit",
            seed=args.seed,
            max_seq_length=args.max_seq_length,
            dataset_text_field="text",
            packing=False,
        )
        v_trainer = SFTTrainer(
            model=model,
            tokenizer=tokenizer,
            train_dataset=ds_small,
            args=validate_args,
            data_collator=DataCollatorForSeq2Seq(tokenizer=tokenizer),
        )
        v_trainer = train_on_responses_only(
            v_trainer,
            instruction_part=INSTRUCTION_PART,
            response_part=RESPONSE_PART,
        )
        print("running 1-batch validation step…", file=sys.stderr)
        v_trainer.train()
        losses = [
            e["loss"] for e in v_trainer.state.log_history if "loss" in e
        ]
        if not losses:
            print("✗ validate failed: no loss recorded", file=sys.stderr)
            return 1
        loss = losses[-1]
        if not math.isfinite(loss):
            print(f"✗ validate failed: loss is not finite ({loss})", file=sys.stderr)
            return 1
        print(
            f"✓ validate passed — 1 step, loss={loss:.4f}, finite",
            file=sys.stderr,
        )
        return 0

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"output dir: {output_dir}", file=sys.stderr)

    training_args = SFTConfig(
        output_dir=str(output_dir),
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        num_train_epochs=args.epochs,
        learning_rate=args.lr,
        warmup_ratio=args.warmup_ratio,
        weight_decay=args.weight_decay,
        lr_scheduler_type="cosine",
        optim="adamw_8bit",
        bf16=True,
        fp16=False,
        logging_steps=10,
        save_strategy="epoch",
        save_total_limit=3,
        report_to="none",
        seed=args.seed,
        max_seq_length=args.max_seq_length,
        dataset_text_field="text",
        packing=False,
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=ds,
        args=training_args,
        data_collator=DataCollatorForSeq2Seq(tokenizer=tokenizer),
    )

    # Mask loss on everything except assistant responses. Without this the
    # model gets rewarded for regurgitating the 12k-char system prompt.
    trainer = train_on_responses_only(
        trainer,
        instruction_part=INSTRUCTION_PART,
        response_part=RESPONSE_PART,
    )

    print("training…", file=sys.stderr)
    trainer.train()

    final_dir = output_dir / "final"
    final_dir.mkdir(exist_ok=True)
    print(f"saving LoRA adapter to {final_dir}…", file=sys.stderr)
    model.save_pretrained(str(final_dir))
    tokenizer.save_pretrained(str(final_dir))
    print("done", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
