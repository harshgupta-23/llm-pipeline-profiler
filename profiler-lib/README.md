# LLM Pipeline Profiler Library (`llm-profiler`)

A lightweight Python instrumentation library for profiling LLM inference/training pipeline stages run on Kaggle notebooks or locally.

## Features

- **Stage-level Instrumentation**: Context managers and decorators to measure stage durations and resource snapshots.
- **Background Sampling**: CPU (per-process), RSS Memory, and GPU metrics collected in a background thread during active stages.
- **Robust Error Isolation**: Graceful degradation when NVML (GPU) or PyTorch are missing. Network faults in live-streaming mode do not affect your pipeline.
- **Mock GPU Mode**: Simulate GPU metrics locally using `LLM_PROFILER_MOCK_GPU=1` environment variable.
- **Flamegraph Export**: Optional native integration with `torch.profiler` to output chrome-trace profiles for visual op-level flamegraphs.

## Installation

```bash
pip install -e ./profiler-lib
```

## Usage Modes

`llm-profiler` supports two profiling modes: **Auto-Instrumentation** and **Manual Staging**.

### 1. Auto-Instrumentation (Default / Zero-Code Changes)

In this mode, the tracer automatically hooks into standard HuggingFace entry points during initialization. This allows you to profile standard HuggingFace inference pipelines without modifying your code.

The automatically profiled stages are:
- `AutoModelForCausalLM.from_pretrained` (and base `PreTrainedModel.from_pretrained`) → `"model_load"`
- `PreTrainedTokenizerBase.__call__` → `"tokenize"`
- `GenerationMixin.generate` (including dynamic on-the-fly patching for overridden `generate` methods) → `"generate"`
- `PreTrainedTokenizerBase.decode` and `.batch_decode` → `"postprocess"`

```python
from llm_profiler import Tracer
from transformers import AutoModelForCausalLM, AutoTokenizer

# Initialize Tracer (auto_instrument is True by default, profile_torch is False by default)
tracer = Tracer(run_name="auto-pipeline-run", model_name="distilgpt2", profile_torch=False)

# Run your normal pipeline with zero changes
model = AutoModelForCausalLM.from_pretrained("distilgpt2")
tokenizer = AutoTokenizer.from_pretrained("distilgpt2")
inputs = tokenizer("The quick brown fox", return_tensors="pt")
output = model.generate(**inputs, max_new_tokens=40)
text = tokenizer.decode(output[0])

# Export results
tracer.export()
```

### 2. Manual Staging

For custom pipelines, non-HuggingFace models, or fine-grained control over stage boundaries/names, you can disable auto-instrumentation and use context managers or decorators:

```python
import time
from llm_profiler import Tracer

# Initialize Tracer with auto_instrument=False
tracer = Tracer(run_name="manual-pipeline-run", auto_instrument=False)

# Profile using context manager
with tracer.stage("model_load"):
    time.sleep(1.0)  # Load model

# Profile using decorator
@tracer.stage("tokenize")
def tokenize_text(text):
    time.sleep(0.2)
    return [1, 2, 3]

tokenize_text("Hello world")

# Log custom metrics to the active stage
with tracer.stage("generate"):
    for i in range(5):
        time.sleep(0.1)
    tracer.log_metric("tokens_generated", 50.0)

tracer.export()
```

---

## Known Limitations

- **Single-Threaded Assumption**: Auto-instrumentation hooks and context management are designed under the assumption of single-threaded pipeline execution (typical for standard Jupyter/Kaggle notebook execution). Running concurrent overlapping profiling sessions across multiple threads using the same global patched methods is not supported.
- **Multiple Tracer Prioritization**: If multiple `Tracer` instances are active at once, the most-recently-created tracer will receive the auto-instrumentation stages. When that tracer is stopped or exited, priority falls back to the previously active tracer.

