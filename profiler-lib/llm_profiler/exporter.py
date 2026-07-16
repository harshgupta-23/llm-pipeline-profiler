import json
import os
import urllib.request
import urllib.error
import sys
from .schema import RunSchema

class Exporter:
    def __init__(self, dashboard_url: str = None):
        self.dashboard_url = dashboard_url
        if os.path.exists("/kaggle/working"):
            self.output_path = "/kaggle/working/run.json"
        else:
            self.output_path = "run.json"

    def export(self, run: RunSchema):
        """
        Exports the run to local file and optionally POSTs to the dashboard URL.
        Does not raise errors on network failures.
        """
        try:
            json_data = run.to_json()
        except Exception as e:
            print(f"[llm-profiler] Error serializing run data: {e}", file=sys.stderr)
            return

        try:
            dir_name = os.path.dirname(self.output_path)
            if dir_name:
                os.makedirs(dir_name, exist_ok=True)
            with open(self.output_path, "w", encoding="utf-8") as f:
                f.write(json_data)
        except Exception as e:
            print(f"[llm-profiler] Error writing local run.json: {e}", file=sys.stderr)
            
        if self.dashboard_url:
            url = f"{self.dashboard_url.rstrip('/')}/api/runs"
            req = urllib.request.Request(
                url,
                data=json_data.encode('utf-8'),
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            try:
                with urllib.request.urlopen(req, timeout=5) as response:
                    response.read()
            except urllib.error.URLError as e:
                print(f"[llm-profiler] [WARNING] Failed to post run to dashboard at {url} (network error): {e}", file=sys.stderr)
            except Exception as e:
                print(f"[llm-profiler] [WARNING] Unexpected error posting run to dashboard at {url}: {e}", file=sys.stderr)
