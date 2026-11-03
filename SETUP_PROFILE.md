# Profile maintenance

This profile is evidence-first. Every metric in `README.md` is reproducible from
a public repository. This file records how to re-verify it and what not to add.

## Re-verify the profile numbers

### Aegis MCP

```bash
cd aegis-mcp
python -m venv .venv && source .venv/bin/activate
pip install -e .[dev]
pytest --cov          # 171 passed, 91.74% coverage
aegis-mcp eval        # 12/12 scenarios
ruff check . && ruff format --check .
mypy
```

CI and security status: <https://github.com/ajaybe-ops/aegis-mcp/actions>

### Enterprise RAG

```bash
cd enterprise-rag
uv sync --extra dev
uv run pytest -q      # 149 passed
uv run python scripts/generate_corpus.py
uv run python scripts/evaluate.py \
  --corpus evals/datasets/docs \
  --probes evals/datasets/probes.json \
  --out runs/baseline.json
```

The current committed corpus is 87 documents and 90 probes. Re-run the command
before quoting retrieval numbers; the README's older result table predates the
current revision.

### TensorTonic

```bash
# 105 problem directories, 105 Python implementations
ls -d */ | wc -l
find . -name '*.py' | wc -l
```

### Llama 3.2 3B fine-tune

Open `Finetuning-Llama3.2-3B-/Untitled18.ipynb` and read the committed outputs
from the training cell. The numbers quoted on the profile come from those
outputs: 24,313,856 trainable parameters of 3,237,063,680 (0.75%), training loss
1.0173590699831645, and 780.2905 seconds on a Tesla T4.

## Editing rules

1. **No metric without a command or committed output.** If it cannot be re-run,
   it does not go on the profile.
2. **No "production-ready" without production evidence.** Aegis is described as
   production-oriented and Beta because that is what its README says.
3. **No placeholder links.** Check every URL after editing.
4. **No invented certifications, awards, users, stars, or scale claims.**
5. **Update the verification date** at the bottom of `README.md` when numbers
   change.
6. **Keep the site in sync.** The profile links to
   <https://ajaybe-ops.github.io/>; update its content when the profile changes.
