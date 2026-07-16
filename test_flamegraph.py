"""
test_flamegraph.py
Real PyTorch profiling test using torch.profiler with profile_torch=True.
Runs matrix multiplication operations to generate and export actual op-level Chrome trace event JSONs.
Used to verify that the Flamegraph component correctly parses and renders real PyTorch traces.
"""
from llm_profiler import Tracer
import torch
import time

# Auto-detect device
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Running PyTorch profiling test on device: {device}")

# Connect to your local/ngrok dashboard
tracer = Tracer(
    run_name="pytorch-trace-run",
    model_name="matmul-benchmark",
    dashboard_url="http://localhost:3000"
)

# We enable profile_torch=True here to trigger the PyTorch profiler and record a trace
with tracer.stage("tensor_multiplications", profile_torch=True):
    print("Executing tensor multiplications under active Torch profiler...")
    
    # Generate two random matrices
    x = torch.randn(800, 800, device=device)
    y = torch.randn(800, 800, device=device)
    
    # Perform operations to create trace events
    for i in range(10):
        z = torch.matmul(x, y)
        time.sleep(0.05) # pause slightly so the background thread samples resource usage

print("Operations complete. Exporting trace...")
tracer.export()
print("\nExport complete. Visit your dashboard, view this run, and expand the 'tensor_multiplications' stage to view the live Flamegraph!")
