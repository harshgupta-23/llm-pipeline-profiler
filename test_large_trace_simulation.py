"""
test_large_trace_simulation.py
Simulates a large run by generating 22,000 trace events of varying durations and mocking PyTorch.
Used to stress-test the dashboard Flamegraph renderer and verify that duration-based event capping
(limiting to the top 15,000 longest-duration events) and visual width filtering render cleanly.
"""
from llm_profiler import Tracer
from llm_profiler.collectors.torch_profiler import TorchProfilerCollector
import time
import random
import json

def generate_large_trace_json(num_events=22000):
    print(f"Generating {num_events} simulated Chrome trace events...")
    events = []
    
    # We will mix long-running ops (high duration) and tiny ops (low duration)
    # to verify that our duration-based keep-the-biggest-N logic works correctly.
    for i in range(num_events):
        is_cuda = (i % 5 == 0)
        cat = "cuda_op" if is_cuda else "cpu_op"
        
        # Make a few operations very long
        if i % 100 == 0:
            name = f"aten::heavy_matmul_{i}"
            dur = 50000.0 + random.uniform(0.0, 10000.0)  # Very large duration
        elif i % 20 == 0:
            name = f"aten::activation_{i}"
            dur = 1000.0 + random.uniform(0.0, 500.0)    # Medium duration
        else:
            name = f"aten::tiny_op_{i}"
            dur = 0.5 + random.uniform(0.0, 5.0)         # Tiny sub-microsecond/microsecond op
            
        pid = 1234
        tid = 5 if is_cuda else 1
        ts = i * 10
        
        events.append({
            "ph": "X",
            "cat": cat,
            "name": name,
            "pid": pid,
            "tid": tid,
            "ts": ts,
            "dur": dur
        })
        
    return json.dumps({"traceEvents": events})

# Setup the PyTorch profiler mock to return the large programmatically generated trace
large_trace_json = generate_large_trace_json(22000)
TorchProfilerCollector._active = True
TorchProfilerCollector.stop = lambda self: large_trace_json

print("Initializing Tracer for local dashboard (localhost:3000)...")
tracer = Tracer(
    run_name="large-trace-performance-run",
    model_name="simulated-performance-gpt",
    dashboard_url="http://localhost:3000"
)

# Run a stage with profile_torch=True to trigger the large trace injection
with tracer.stage("generate", profile_torch=True):
    print("Simulating step loops and logging TPS...")
    for step in range(15):
        time.sleep(0.05)
        # Log simulated tokens per second
        simulated_tps = 45.0 + random.uniform(-5.0, 5.0) - (step * 0.5)
        tracer.log_metric("tps", simulated_tps)
        tracer.log_metric("ram_used_mb", 1024.0 + (step * 15.0))
        tracer.log_metric("gpu_mem_used_mb", 800.0 + (step * 25.0))

print("Exporting run data to local dashboard...")
tracer.export()
print("\nSuccess! Run exported successfully.")
print("Open http://localhost:3000/dashboard, select the new run, and expand the 'generate' stage.")
print("You should see the warning banner indicating the trace was capped at 15,000 events, and the flamegraph should render smoothly.")
