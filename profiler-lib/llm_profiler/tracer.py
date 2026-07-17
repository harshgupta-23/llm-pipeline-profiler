import time
import os
import uuid
import sys
import threading
from datetime import datetime
from contextlib import ContextDecorator
from typing import Optional, List, Dict, Any

from .schema import RunSchema, StageSchema, MetricSchema
from .collectors.cpu_mem import CPUMemCollector
from .collectors.gpu import GPUCollector
from .collectors.torch_profiler import TorchProfilerCollector
from .sampler_bridge import SamplerBridge
from .exporter import Exporter

class Tracer:
    def __init__(self, run_name: str, model_name: Optional[str] = None, dashboard_url: Optional[str] = None, sample_interval_ms: int = 50, auto_instrument: bool = True, profile_torch: bool = False):
        self.run_name = run_name
        self.model_name = model_name
        self.dashboard_url = dashboard_url
        self.sample_interval_ms = sample_interval_ms
        self.auto_instrument = auto_instrument
        self.profile_torch = profile_torch
        
        self.run_id = str(uuid.uuid4())
        self.created_at = datetime.utcnow()
        
        self.cpu_mem_collector = CPUMemCollector()
        self.gpu_collector = GPUCollector()
        self.sampler_bridge = SamplerBridge(sample_interval_ms=self.sample_interval_ms)
        
        # Determine hardware info
        cpu_count = os.cpu_count() or 1
        gpu_info = self.gpu_collector.get_hardware_info()
        self.hardware_info = {
            "cpu_count": cpu_count,
            "gpu_type": gpu_info.get("gpu_type"),
            "gpu_vram_mb": gpu_info.get("gpu_vram_mb")
        }
        
        self.stages: List[StageSchema] = []
        self.exporter = Exporter(dashboard_url=self.dashboard_url)
        self._active_stage_contexts = []
        
        # Export initial empty run
        self._export_current_run()

        if self.auto_instrument:
            from .auto_instrument import register_tracer
            register_tracer(self)

    def stop_auto_instrument(self):
        """
        Stop auto-instrumentation for this Tracer. If no other active
        auto-instrumented Tracers exist, original methods will be restored.
        """
        if self.auto_instrument:
            from .auto_instrument import unregister_tracer
            unregister_tracer(self)
            self.auto_instrument = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop_auto_instrument()

    def _export_current_run(self):
        run_data = RunSchema(
            id=self.run_id,
            name=self.run_name,
            created_at=self.created_at,
            model_name=self.model_name,
            hardware_info=self.hardware_info,
            stages=self.stages
        )
        self.exporter.export(run_data)

    def export(self):
        """
        Export the current run statistics to local file and HTTP endpoint.
        """
        self._export_current_run()

    def stage(self, name: str, profile_torch: bool = False):
        return StageContext(self, name, profile_torch)

    def log_metric(self, key: str, value: float):
        """
        Log a custom metric to the current active stage context.
        """
        if self._active_stage_contexts:
            self._active_stage_contexts[-1].log_metric(key, value)


class StageContext(ContextDecorator):
    def __init__(self, tracer: Tracer, name: str, profile_torch: bool = False):
        self.tracer = tracer
        self.name = name
        self.profile_torch = profile_torch
        
        self.stage_id = None
        self.metrics = []
        self._sampling_active = False
        self._sampling_thread = None
        self.torch_profiler = None
        self.start_time = None
        self.start_perf = None
        
        self.start_cpu = 0.0
        self.start_ram = 0.0
        self.start_gpu_util = 0.0
        self.start_gpu_mem = 0.0
        self.use_sampler_cpp = False

    def log_metric(self, key: str, value: float):
        self.metrics.append(MetricSchema(
            timestamp=datetime.utcnow(),
            key=key,
            value=float(value)
        ))

    def __enter__(self):
        self.stage_id = str(uuid.uuid4())
        self.metrics = []
        
        # Synchronize CUDA if available to get accurate GPU start time
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.synchronize()
        except ImportError:
            pass
            
        self.start_time = datetime.utcnow()
        self.start_perf = time.perf_counter()
        
        # Take start snapshots
        self.start_cpu = self.tracer.cpu_mem_collector.get_cpu_percent()
        self.start_ram = self.tracer.cpu_mem_collector.get_ram_used_mb()
        self.start_gpu_util = self.tracer.gpu_collector.get_gpu_util_percent()
        self.start_gpu_mem = self.tracer.gpu_collector.get_gpu_mem_used_mb()
        
        # Try C++ sampler bridge
        self.use_sampler_cpp = self.tracer.sampler_bridge.connect()
        
        # PyTorch Profiler
        if self.profile_torch:
            self.torch_profiler = TorchProfilerCollector()
            self.torch_profiler.start()
        else:
            self.torch_profiler = None
            
        # Track active context in tracer
        self.tracer._active_stage_contexts.append(self)
        
        # Start background sampler thread
        self._sampling_active = True
        self._sampling_thread = threading.Thread(target=self._sample_loop)
        self._sampling_thread.daemon = True
        self._sampling_thread.start()
        
        return self

    def _sample_loop(self):
        interval = self.tracer.sample_interval_ms / 1000.0
        while self._sampling_active:
            loop_start = time.perf_counter()
            timestamp = datetime.utcnow()
            
            if self.use_sampler_cpp:
                # Read from socket
                samples = self.tracer.sampler_bridge.read_samples()
                for sample in samples:
                    ts_str = sample.get("timestamp")
                    ts = datetime.utcnow()
                    if ts_str:
                        try:
                            ts = datetime.strptime(ts_str, "%Y-%m-%dT%H:%M:%S.%fZ")
                        except Exception:
                            try:
                                ts = datetime.strptime(ts_str.split(".")[0], "%Y-%m-%dT%H:%M:%S")
                            except Exception:
                                pass
                    for key in ["cpu_percent", "ram_used_mb", "gpu_util_percent", "gpu_mem_used_mb"]:
                        if key in sample:
                            self.metrics.append(MetricSchema(
                                timestamp=ts,
                                key=key,
                                value=float(sample[key])
                            ))
            else:
                # Fallback to pure Python sampling
                cpu = self.tracer.cpu_mem_collector.get_cpu_percent()
                ram = self.tracer.cpu_mem_collector.get_ram_used_mb()
                gpu_util = self.tracer.gpu_collector.get_gpu_util_percent()
                gpu_mem = self.tracer.gpu_collector.get_gpu_mem_used_mb()
                
                self.metrics.append(MetricSchema(timestamp=timestamp, key="cpu_percent", value=cpu))
                self.metrics.append(MetricSchema(timestamp=timestamp, key="ram_used_mb", value=ram))
                if self.tracer.gpu_collector.enabled:
                    self.metrics.append(MetricSchema(timestamp=timestamp, key="gpu_util_percent", value=gpu_util))
                    self.metrics.append(MetricSchema(timestamp=timestamp, key="gpu_mem_used_mb", value=gpu_mem))
                    
            # Compute remaining time to sleep to keep interval
            elapsed = time.perf_counter() - loop_start
            sleep_time = interval - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)

    def __exit__(self, exc_type, exc_val, exc_tb):
        # Stop background sampling thread first, wrapping in try/finally to guarantee execution
        try:
            self._sampling_active = False
        finally:
            if self._sampling_thread:
                self._sampling_thread.join(timeout=1.0)
                self._sampling_thread = None
                
        # Clean active context reference
        if self in self.tracer._active_stage_contexts:
            self.tracer._active_stage_contexts.remove(self)
            
        # Synchronize CUDA if available to get accurate GPU end time
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.synchronize()
        except ImportError:
            pass
            
        end_time = datetime.utcnow()
        end_perf = time.perf_counter()
        
        # Stop PyTorch profiler if active and get trace in background
        if self.torch_profiler and self.torch_profiler._active and self.torch_profiler.profiler is None:
            self.torch_profiler = None

        profiler_to_serialize = None
        trace_dir = None
        if self.torch_profiler and self.torch_profiler.profiler:
            try:
                # Stop recording synchronously on the main thread (instantaneous)
                profiler_to_serialize = self.torch_profiler.profiler
                profiler_to_serialize.stop()
                self.torch_profiler._active = False
                trace_dir = self.torch_profiler.trace_dir
            except Exception as e:
                print(f"[llm-profiler] Error stopping torch profiler: {e}")
            self.torch_profiler = None
            
        duration_ms = (end_perf - self.start_perf) * 1000.0
        
        # Take end snapshots
        end_cpu = self.tracer.cpu_mem_collector.get_cpu_percent()
        end_ram = self.tracer.cpu_mem_collector.get_ram_used_mb()
        end_gpu_util = self.tracer.gpu_collector.get_gpu_util_percent()
        end_gpu_mem = self.tracer.gpu_collector.get_gpu_mem_used_mb()
        
        # Close sampler bridge socket
        self.tracer.sampler_bridge.close()
        
        # Compute summaries
        cpu_samples = [m.value for m in self.metrics if m.key == "cpu_percent"]
        ram_samples = [m.value for m in self.metrics if m.key == "ram_used_mb"]
        gpu_util_samples = [m.value for m in self.metrics if m.key == "gpu_util_percent"]
        gpu_mem_samples = [m.value for m in self.metrics if m.key == "gpu_mem_used_mb"]
        
        cpu_percent = sum(cpu_samples) / len(cpu_samples) if cpu_samples else (self.start_cpu + end_cpu) / 2.0
        ram_used_mb = max(ram_samples) if ram_samples else max(self.start_ram, end_ram)
        gpu_util_percent = sum(gpu_util_samples) / len(gpu_util_samples) if gpu_util_samples else (self.start_gpu_util + end_gpu_util) / 2.0
        gpu_mem_used_mb = max(gpu_mem_samples) if gpu_mem_samples else max(self.start_gpu_mem, end_gpu_mem)
        
        stage = StageSchema(
            id=self.stage_id,
            name=self.name,
            start_time=self.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            cpu_percent=cpu_percent,
            ram_used_mb=ram_used_mb,
            gpu_util_percent=gpu_util_percent,
            gpu_mem_used_mb=gpu_mem_used_mb,
            metrics=self.metrics,
            trace_ref=None
        )
        
        self.tracer.stages.append(stage)
        self.tracer._export_current_run()

        # Start the background serialization thread if a profiler was active
        if profiler_to_serialize and trace_dir:
            def serialize_trace(stage_object, tracer_object):
                import tempfile
                try:
                    fd, path = tempfile.mkstemp(suffix=".json", dir=trace_dir)
                    os.close(fd)
                    profiler_to_serialize.export_chrome_trace(path)
                    if os.path.exists(path):
                        with open(path, "r", encoding="utf-8") as f:
                            trace_content = f.read()
                        try:
                            os.remove(path)
                        except Exception:
                            pass
                        # Update the stage with the serialized trace and re-export
                        stage_object.trace_ref = trace_content
                        tracer_object._export_current_run()
                except Exception as e:
                    print(f"[llm-profiler] Background trace export failed: {e}")

            t = threading.Thread(target=serialize_trace, args=(stage, self.tracer))
            t.daemon = True
            t.start()
            
        # Propagate exception if one occurred
        return False
