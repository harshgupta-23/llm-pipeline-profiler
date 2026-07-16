from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class MetricSchema(BaseModel):
    timestamp: datetime
    key: str
    value: float

class StageSchema(BaseModel):
    id: str
    name: str
    start_time: datetime
    end_time: datetime
    duration_ms: float
    cpu_percent: float
    ram_used_mb: float
    gpu_util_percent: float
    gpu_mem_used_mb: float
    metrics: List[MetricSchema] = Field(default_factory=list)
    trace_ref: Optional[str] = None

class RunSchema(BaseModel):
    id: str
    name: str
    created_at: datetime
    model_name: Optional[str] = None
    hardware_info: Optional[Dict[str, Any]] = None
    stages: List[StageSchema] = Field(default_factory=list)

    def to_json(self) -> str:
        if hasattr(self, "model_dump_json"):
            return self.model_dump_json()
        return self.json()

    def to_dict(self) -> dict:
        if hasattr(self, "model_dump"):
            return self.model_dump()
        return self.dict()
