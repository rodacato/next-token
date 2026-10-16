"""Records MiniCPM5-2B answers locally with mlx-lm, for chapters 12, 16 and 17.

Usage: uv run --with mlx-lm python scripts/record_minicpm.py stages
Every checkpoint gets the same bytes: the chat template with thinking off, greedy decoding.
"""

import json
import platform
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


def write(name: str, completions: list) -> None:
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
    {"stages": record_stages}[sys.argv[1]]()
