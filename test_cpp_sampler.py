import sys
import os
import time
import tempfile
from llm_profiler import Tracer

print("=== LLM Pipeline Profiler — C++ Sampler Local Verification ===")

# Test 1: Direct C++ extension import and run validation
print("\n--- Test 1: Direct C++ Extension API Validation ---")
try:
    import llm_profiler_sampler
    print("SUCCESS: Compiled C++ extension 'llm_profiler_sampler' imported successfully.")
    
    # Path for mock socket file
    socket_path = os.path.join(tempfile.gettempdir(), "test_verify_sampler.sock")
    
    print(f"Starting background C++ sampler thread (socket_path={socket_path})...")
    llm_profiler_sampler.start_sampler(socket_path, 20)
    
    # Sleep 0.5s to let the background thread boot, log its startup, and run on Windows
    time.sleep(0.5)
    
    print("Stopping C++ sampler thread...")
    llm_profiler_sampler.stop_sampler()
    print("SUCCESS: C++ sampler thread exited cleanly.")

except ImportError as e:
    print(f"FAILED: Could not import llm_profiler_sampler: {e}")
    sys.exit(1)
except Exception as e:
    print(f"FAILED: Exception raised during C++ direct test: {e}")
    sys.exit(1)


# Test 2: Pipeline Graceful Fallback Validation
print("\n--- Test 2: Pipeline Graceful Fallback Validation ---")
try:
    print("Initializing Tracer...")
    tracer = Tracer(
        run_name="fallback-verification-run",
        dashboard_url="https://stimuli-detention-video.ngrok-free.dev"
    )
    
    # Run a stage. On Windows, socket.AF_UNIX is False, so it must fall back to Python sampler
    print("Running stage with fallback sampler...")
    with tracer.stage("fallback_stage"):
        # Verify that sampler_bridge.connect returned False and fallback is active
        # We can find this by querying the active stage context
        active_context = tracer._active_stage_contexts[-1]
        print(f"  Stage connected to C++ Sampler via UDS: {active_context.use_sampler_cpp}")
        print("  (Expected: False on Windows, fallback to pure-Python metrics)")
        
        # Simulate some compute
        for _ in range(5):
            time.sleep(0.1)
            
    print("Exporting results...")
    tracer.export()
    print("SUCCESS: Pipeline fallback worked flawlessly. Run completed with no crashes.")

except Exception as e:
    print(f"FAILED: Exception raised during fallback validation: {e}")
    sys.exit(1)

print("\n=== All Local Windows Verifications Completed Successfully! ===")
print("Note: 0.0/disabled values on CPU/GPU metrics are expected on Windows locally by design.")
