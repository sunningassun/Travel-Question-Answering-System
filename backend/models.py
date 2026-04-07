from pydantic import BaseModel
from typing import List, Optional

class ChatRequest(BaseModel):
    query: str
    model: str = "R1"               # 纯模型/RAG模式下使用，合作模式忽略
    mode: str                       # "pure", "rag", "collab"
    retrieval_mode: str = "hybrid"  # 仅RAG模式有效
    collab_type: Optional[str] = None  # 合作模式类型: "R1_to_V3", "V3_to_R1"

class ChatResponse(BaseModel):
    answer: str
    response_time: float
    retrieved_chunks: Optional[List[str]] = None

class EvaluateRequest(BaseModel):
    query: str
    model: str          # 实际使用的模型标识，合作模式为 "R1→V3" 等
    mode: str
    retrieval_mode: str = "none"
    question_type: str
    answer: str
    response_time: float
    retrieved_count: int = 0
    is_accurate: bool

class StatsResponse(BaseModel):
    accuracy_by_mode_model: dict
    response_time_by_mode_model: dict
    avg_retrieved_docs: dict
    accuracy_by_question_type: dict
    total_evaluations: int