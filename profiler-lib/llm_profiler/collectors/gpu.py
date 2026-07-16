import os
import time
import random
import math
from typing import Dict, Any

try:
    import pynvml
    PYNVML_AVAILABLE = True
except ImportError:
    PYNVML_AVAILABLE = False


class GPUCollector:
    def __init__(self):
        self.mock_mode = os.environ.get("LLM_PROFILER_MOCK_GPU") == "1"
        self.enabled = False
        self.handle = None
        self.device_count = 0

        if self.mock_mode:
            self.enabled = True
        elif PYNVML_AVAILABLE:
            try:
                pynvml.nvmlInit()
                self.device_count = pynvml.nvmlDeviceGetCount()
                if self.device_count > 0:
                    self.handle = pynvml.nvmlDeviceGetHandleByIndex(0)
                    self.enabled = True
            except Exception:
                self.enabled = False

    def get_gpu_util_percent(self) -> float:
        if not self.enabled:
            return 0.0

        if self.mock_mode:
            # Plausible oscillating GPU utilization between 30% and 85%
            t = time.time()
            util = 57.5 + 27.5 * math.sin(t * 2 * math.pi / 10.0)
            util += random.uniform(-2.0, 2.0)
            return max(0.0, min(100.0, float(util)))

        try:
            util = pynvml.nvmlDeviceGetUtilizationRates(self.handle)
            return float(util.gpu)
        except Exception:
            return 0.0

    def get_gpu_mem_used_mb(self) -> float:
        if not self.enabled:
            return 0.0

        if self.mock_mode:
            # Plausible VRAM usage (e.g. around 4000 MB to 6000 MB)
            t = time.time()
            mem_base = 5120.0  # 5 GB base
            mem_var = 1024.0 * math.sin(t * 2 * math.pi / 15.0)
            mem = mem_base + mem_var + random.uniform(-50.0, 50.0)
            return max(0.0, float(mem))

        try:
            mem = pynvml.nvmlDeviceGetMemoryInfo(self.handle)
            return float(mem.used / (1024 * 1024))
        except Exception:
            return 0.0

    def get_hardware_info(self) -> Dict[str, Any]:
        if not self.enabled:
            return {}

        if self.mock_mode:
            return {
                "gpu_type": "NVIDIA Tesla T4 (Mock)",
                "gpu_vram_mb": 15360.0
            }

        try:
            name = pynvml.nvmlDeviceGetName(self.handle)
            if isinstance(name, bytes):
                name = name.decode('utf-8')
            mem = pynvml.nvmlDeviceGetMemoryInfo(self.handle)
            return {
                "gpu_type": name,
                "gpu_vram_mb": float(mem.total / (1024 * 1024))
            }
        except Exception:
            return {}
