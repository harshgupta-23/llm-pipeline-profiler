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

## Quick Start

```python
import os
from llm_profiler import Tracer

# Optional: Enable Mock GPU for testing locally
# os.environ["LLM_PROFILER_MOCK_GPU"] = "1"

# Initialize Tracer (offline mode)
tracer = Tracer(run_name="llama-inference-run", model_name="Llama-3-8B")

# profile stage using context manager
with tracer.stage("model_load"):
    # Load your model here
    import time
    time.sleep(1.0)

# profile stage using decorator
@tracer.stage("tokenize")
def tokenize_text(text):
    time.sleep(0.2)
    return [1, 2, 3]

tokenize_text("Hello world")

# Log custom metric to active stage
with tracer.stage("generate"):
    for i in range(5):
        time.sleep(0.1)
    tracer.log_metric("tokens_generated", 50.0)

# Export results to run.json
tracer._export_current_run()
```
