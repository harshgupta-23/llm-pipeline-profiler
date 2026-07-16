"""
test_ngrok.py
Sanity check script to verify the HTTP connectivity from the tracer to the dashboard URL.
Runs a dummy 2-second stage with no heavy libraries or hardware dependencies.
"""
from llm_profiler import Tracer
import time

tracer = Tracer(run_name="ngrok-test-run", dashboard_url="http://localhost:3000")

with tracer.stage("dummy_stage"):
    time.sleep(2)

tracer.export()