import socket
import json
import os
import time
import tempfile
from typing import List, Dict, Any

try:
    import llm_profiler_sampler
    HAS_CPP_SAMPLER = True
except ImportError:
    HAS_CPP_SAMPLER = False

class SamplerBridge:
    def __init__(self, socket_path: str = None, sample_interval_ms: int = 50):
        if socket_path is None:
            socket_path = os.path.join(tempfile.gettempdir(), "llm_profiler_sampler.sock")
        self.socket_path = socket_path
        self.sample_interval_ms = sample_interval_ms
        self.socket = None
        self.connected = False

    def connect(self) -> bool:
        """
        Attempts to connect to the Unix domain socket after starting C++ sampler if available.
        Returns True if successful, False otherwise.
        """
        if not hasattr(socket, "AF_UNIX"):
            self.connected = False
            return False
            
        if HAS_CPP_SAMPLER:
            try:
                llm_profiler_sampler.start_sampler(self.socket_path, self.sample_interval_ms)
                # Give background thread time to bind socket
                time.sleep(0.05)
            except Exception as e:
                print(f"[llm-profiler] Failed to start C++ sampler extension: {e}")
                self.connected = False
                return False

        if not os.path.exists(self.socket_path):
            self.connected = False
            return False
            
        try:
            self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.socket.connect(self.socket_path)
            self.socket.settimeout(0.01)  # Set low timeout to prevent blocking the tracer
            self.connected = True
            return True
        except Exception:
            if HAS_CPP_SAMPLER:
                try:
                    llm_profiler_sampler.stop_sampler()
                except Exception:
                    pass
            self.connected = False
            if self.socket:
                try:
                    self.socket.close()
                except Exception:
                    pass
                self.socket = None
            return False

    def read_samples(self) -> List[Dict[str, Any]]:
        """
        Reads any pending samples from the socket.
        """
        if not self.connected or not self.socket:
            return []
            
        samples = []
        try:
            data = self.socket.recv(4096)
            if data:
                lines = data.decode('utf-8').split('\n')
                for line in lines:
                    if line.strip():
                        try:
                            samples.append(json.loads(line))
                        except json.JSONDecodeError:
                            pass
        except socket.timeout:
            pass
        except Exception:
            self.connected = False
            if self.socket:
                try:
                    self.socket.close()
                except Exception:
                    pass
                self.socket = None
        return samples

    def close(self):
        """
        Closes the socket connection.
        """
        if self.socket:
            try:
                self.socket.close()
            except Exception:
                pass
            self.socket = None
            
        self.connected = False

        if HAS_CPP_SAMPLER:
            try:
                llm_profiler_sampler.stop_sampler()
            except Exception:
                pass
