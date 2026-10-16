"""Records MiniCPM5-2B answers locally with mlx-lm, for chapters 12, 16 and 17.

Usage: uv run --with mlx-lm python scripts/record_minicpm.py stages
Every checkpoint gets the same bytes: the chat template with thinking off, greedy decoding.
"""

import json
import platform
import re
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

import mlx.core as mx
from mlx_lm import generate, load
from mlx_lm import __version__ as mlx_lm_version

ROOT = Path(__file__).resolve().parent.parent
LOCALES = ["en", "es-MX"]


def chat_prompt(tokenizer, text: str) -> str:
    messages = [{"role": "user", "content": text}]
    return tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False, enable_thinking=False)


def record_stages() -> None:
    chapter = json.loads((ROOT / "src/content/chapters/12-stages.json").read_text())
    completions = []
    for stage in chapter["stages"]:
        print(f"Loading {stage['repo']}…", flush=True)
        model, tokenizer = load(stage["repo"])
        for prompt in chapter["prompts"]:
            for locale in LOCALES:
                text = chat_prompt(tokenizer, prompt["text"][locale])
                started = time.perf_counter()
                output = generate(model, tokenizer, prompt=text, max_tokens=chapter["maxTokens"], verbose=False)
                seconds = time.perf_counter() - started
                tokens = len(tokenizer.encode(output))
                print(f"  {stage['id']} {prompt['id']} {locale}: {output[:80]!r}", flush=True)
                completions.append(
                    {
                        "stage": stage["id"],
                        "repo": stage["repo"],
                        "promptId": prompt["id"],
                        "locale": locale,
                        "input": text,
                        "output": output,
                        "outputTokens": tokens,
                        "seconds": round(seconds, 2),
                    }
                )
        del model
        mx.clear_cache()
    write("stages", completions)


FINETUNE = {
    "model": "openbmb/MiniCPM5-2B",
    "rank": 8,
    "scale": 20.0,
    "dropout": 0.0,
    "num_layers": 16,
    "iters": 100,
    "batch_size": 4,
    "learning_rate": 2e-5,
    "max_tokens": 300,
    "seed": 0,
}


def answer_sets(model, tokenizer, sets: list) -> list:
    out = []
    for eval_set in sets:
        for case in eval_set["cases"]:
            for locale in LOCALES:
                text = chat_prompt(tokenizer, case["input"][locale])
                output = generate(model, tokenizer, prompt=text, max_tokens=FINETUNE["max_tokens"], verbose=False)
                print(f"  {eval_set['id']} {case['id']} {locale}: {output[:70]!r}", flush=True)
                out.append({"setId": eval_set["id"], "caseId": case["id"], "locale": locale, "input": case["input"][locale], "output": output})
    return out


def record_finetune() -> None:
    """LoRA on the clean rows of chapter 14's set, then both eval sets before and after."""
    dataset = json.loads((ROOT / "src/content/datasets/support-sft.json").read_text())
    rows = [r for r in dataset["rows"] if r["planted"] == "keep"]
    work = ROOT / "node_modules/.cache/finetune"
    data = work / "data"
    data.mkdir(parents=True, exist_ok=True)
    as_chat = lambda r: json.dumps({"messages": [{"role": "user", "content": r["customer"]}, {"role": "assistant", "content": r["reply"]}]}, ensure_ascii=False)
    (data / "train.jsonl").write_text("\n".join(as_chat(r) for r in rows) + "\n")
    (data / "valid.jsonl").write_text("\n".join(as_chat(r) for r in rows[::10]) + "\n")
    config = work / "lora.yaml"
    config.write_text(
        f"lora_parameters:\n  rank: {FINETUNE['rank']}\n  scale: {FINETUNE['scale']}\n  dropout: {FINETUNE['dropout']}\n"
    )
    adapters = work / "adapters"
    started = time.perf_counter()
    log = subprocess.run(
        [sys.executable, "-m", "mlx_lm", "lora", "--model", FINETUNE["model"], "--train", "--data", str(data), "--adapter-path", str(adapters),
         "--iters", str(FINETUNE["iters"]), "--batch-size", str(FINETUNE["batch_size"]), "--learning-rate", str(FINETUNE["learning_rate"]),
         "--num-layers", str(FINETUNE["num_layers"]), "--mask-prompt", "--steps-per-report", "10", "--steps-per-eval", "50", "--seed", str(FINETUNE["seed"]), "-c", str(config)],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=True,
    ).stdout
    seconds = time.perf_counter() - started
    print(log, flush=True)
    # mlx-lm prints a coloured table: strip the colours, keep "step  loss ▼" rows (validation rows say "val").
    plain = re.sub(r"\x1b\[[0-9;]*m", "", log)
    losses = [{"iter": int(m[0]), "train": float(m[1])} for m in re.findall(r"^\s*(\d+)\s+([\d.]+)\s*[▼▲]", plain, re.M)]
    trainable = re.search(r"Trainable parameters: ([\d.]+)% \(([\d.]+)M/([\d.]+)M\)", log)
    sets = [json.loads((ROOT / f"src/content/evals/{i}.json").read_text()) for i in ["support-style", "general-skills"]]
    model, tokenizer = load(FINETUNE["model"])
    before = answer_sets(model, tokenizer, sets)
    del model
    mx.clear_cache()
    model, tokenizer = load(FINETUNE["model"], adapter_path=str(adapters))
    after = answer_sets(model, tokenizer, sets)
    training = {
        "rows": len(rows),
        "seconds": round(seconds, 1),
        "losses": losses,
        "trainablePercent": float(trainable[1]) if trainable else None,
        "trainableMillions": float(trainable[2]) if trainable else None,
        "config": FINETUNE,
    }
    write("finetune", {"training": training, "before": before, "after": after})


def write(name: str, completions) -> None:
    out = ROOT / "src/recordings/minicpm" / f"{name}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "recordedAt": date.today().isoformat(),
        "via": f"mlx-lm {mlx_lm_version}",
        "machine": f"{platform.machine()} · {platform.mac_ver()[0]}",
        "dtype": "bfloat16",
        "decoding": "greedy",
        "thinking": False,
        "completions": completions,
    }
    out.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {out}")


if __name__ == "__main__":
    {"stages": record_stages, "finetune": record_finetune}[sys.argv[1]]()
