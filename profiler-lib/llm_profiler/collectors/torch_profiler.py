import os
import tempfile
from typing import Optional

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False


class TorchProfilerCollector:
    def __init__(self, trace_dir: Optional[str] = None):
        self.trace_dir = trace_dir or tempfile.gettempdir()
        self.profiler = None
        self._active = False

    def start(self):
        if not TORCH_AVAILABLE:
            return
        try:
            os.makedirs(self.trace_dir, exist_ok=True)
            activities = [torch.profiler.ProfilerActivity.CPU]
            if torch.cuda.is_available():
                activities.append(torch.profiler.ProfilerActivity.CUDA)

            self.profiler = torch.profiler.profile(
                activities=activities,
                record_shapes=True,
                profile_memory=True,
                with_stack=False
            )
            self.profiler.start()
            self._active = True
        except Exception as e:
            print(f"[llm-profiler] Failed to start torch profiler: {e}")
            self.profiler = None
            self._active = False

    def stop(self) -> Optional[str]:
        if not self._active or self.profiler is None:
            return None
        try:
            self.profiler.stop()
            self._active = False

            fd, path = tempfile.mkstemp(suffix=".json", dir=self.trace_dir)
            os.close(fd)

            try:
                self.profiler.export_chrome_trace(path)
                if os.path.exists(path):
                    with open(path, "r", encoding="utf-8") as f:
                        trace_content = f.read()
                    try:
                        os.remove(path)
                    except Exception:
                        pass
                    return trace_content
            except Exception as e:
                print(f"[llm-profiler] Error exporting chrome trace: {e}")
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except Exception:
                        pass
        except Exception as e:
            print(f"[llm-profiler] Error stopping torch profiler: {e}")
        return None
