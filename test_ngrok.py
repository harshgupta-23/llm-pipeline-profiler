from llm_profiler import Tracer
import time

tracer = Tracer(run_name="ngrok-test-run", dashboard_url="https://stimuli-detention-video.ngrok-free.dev")

with tracer.stage("dummy_stage"):
    time.sleep(2)

tracer.export()