from llm_profiler import Tracer
from llm_profiler.collectors.torch_profiler import TorchProfilerCollector
import time
import random

# Mock the PyTorch profiler's stop method to return a valid Chrome trace string
mock_trace_json = """{
  "traceEvents": [
    {"ph": "X", "cat": "cpu_op", "name": "aten::linear", "pid": 1234, "tid": 1, "ts": 1000, "dur": 600},
    {"ph": "X", "cat": "cpu_op", "name": "aten::add", "pid": 1234, "tid": 1, "ts": 1100, "dur": 200},
    {"ph": "X", "cat": "cpu_op", "name": "aten::mul", "pid": 1234, "tid": 1, "ts": 1200, "dur": 100},
    {"ph": "X", "cat": "cpu_op", "name": "aten::softmax", "pid": 1234, "tid": 1, "ts": 1400, "dur": 150},
    
    {"ph": "X", "cat": "runtime", "name": "cudaLaunchKernel", "pid": 1234, "tid": 1, "ts": 1050, "dur": 50},
    
    {"ph": "X", "cat": "cuda_op", "name": "void sgemm_kernel", "pid": 1234, "tid": 5, "ts": 1060, "dur": 520},
    {"ph": "X", "cat": "cuda_op", "name": "void elementwise_add_kernel", "pid": 1234, "tid": 5, "ts": 1190, "dur": 180}
  ]
}"""

# Override the collector's stop method so it works without PyTorch installed
TorchProfilerCollector._active = True
TorchProfilerCollector.stop = lambda self: mock_trace_json

print("Initializing tracer with mock trace injector...")
tracer = Tracer(
    run_name="simulated-all-visuals-run",
    model_name="gpt2-simulated",
    dashboard_url="https://stimuli-detention-video.ngrok-free.dev"
)

# Run a stage with profile_torch=True to trigger the mocked flamegraph trace
with tracer.stage("generate", profile_torch=True):
    print("Executing simulated generation loop...")
    
    # Simulate logging tokens per second over a generation loop
    for i in range(12):
        time.sleep(0.15)
        # Log a changing tokens/sec metric for the throughput chart
        current_tps = 32.5 + random.uniform(-4.0, 4.0)
        tracer.log_metric("tps", current_tps)
        
        # Log batch size as well
        tracer.log_metric("batch_size", 1.0)

print("Exporting run data to dashboard...")
tracer.export()
print("\nSuccess! Open the dashboard, click on this run, and you will see:")
print("1. The Throughput Chart showing tokens/sec.")
print("2. The Stages Profile Details with a 'Trace Flamegraph' button showing CPU/GPU operators.")
