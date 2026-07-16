import psutil
import os

class CPUMemCollector:
    def __init__(self):
        self.process = psutil.Process(os.getpid())
        self.prime_cpu_counter()

    def prime_cpu_counter(self):
        """
        Primes the CPU percent calculation by calling it once.
        This avoids receiving a 0.0 on the first actual measurement.
        """
        try:
            self.process.cpu_percent(interval=None)
        except Exception:
            pass

    def get_cpu_percent(self) -> float:
        """
        Returns the CPU utilization of the current process since the last call.
        """
        try:
            return float(self.process.cpu_percent(interval=None))
        except Exception:
            return 0.0

    def get_ram_used_mb(self) -> float:
        """
        Returns the Resident Set Size (RSS) memory used by the current process in MB.
        """
        try:
            return float(self.process.memory_info().rss / (1024 * 1024))
        except Exception:
            return 0.0
