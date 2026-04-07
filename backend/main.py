from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import time
import json
from typing import List
from datetime import datetime

from .models import ChatRequest, ChatResponse, EvaluateRequest, StatsResponse
from .utils import call_llm
from .rag import retrieve_by_mode, build_rag_prompt
from .config import MODEL_R1, MODEL_V3

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

EVAL_FILE = "backend/data/evaluations.json"
os.makedirs(os.path.dirname(EVAL_FILE), exist_ok=True)


def load_evaluations() -> List[dict]:
    if not os.path.exists(EVAL_FILE):
        return []
    with open(EVAL_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_evaluation(record: dict):
    records = load_evaluations()
    records.append(record)
    with open(EVAL_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


MODEL_MAP = {
    "R1": MODEL_R1,
    "V3": MODEL_V3
}


@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    # 合作模式处理
    if req.mode == "collab":
        if not req.collab_type:
            raise HTTPException(status_code=400, detail="collab_type required")

        # 解析组合
        parts = req.collab_type.split("_to_")
        if len(parts) != 2:
            raise HTTPException(status_code=400, detail="Invalid collab_type format")
        think_model_code, answer_model_code = parts[0], parts[1]

        # 禁止思考模型与回答模型相同（R1->R1 或 V3->V3）
        if think_model_code == answer_model_code:
            raise HTTPException(status_code=400, detail="合作模式中思考模型和回答模型不能相同")

        think_model = MODEL_MAP.get(think_model_code, MODEL_R1)
        answer_model = MODEL_MAP.get(answer_model_code, MODEL_V3)

        # 可选检索
        retrieved = []
        if req.retrieval_mode != "none":
            retrieved = retrieve_by_mode(req.query, req.retrieval_mode)
            context = "\n".join(retrieved)
        else:
            context = ""

        # 第一步：思考
        prompt_think = f"请详细思考以下问题，给出推理过程（不要直接给出最终答案）。\n问题：{req.query}\n"
        if context:
            prompt_think = f"已知信息：\n{context}\n\n" + prompt_think
        thinking, time_think = call_llm(prompt_think, think_model, max_tokens=1000)

        # 第二步：总结
        prompt_answer = f"基于以下思考过程，给出简洁准确的最终答案。\n问题：{req.query}\n思考过程：{thinking}\n最终答案："
        if context:
            prompt_answer = f"已知信息：\n{context}\n\n" + prompt_answer
        answer, time_answer = call_llm(prompt_answer, answer_model, max_tokens=800)

        elapsed = time_think + time_answer
        return ChatResponse(answer=answer, response_time=elapsed, retrieved_chunks=retrieved if retrieved else None)

    # 纯模型模式
    elif req.mode == "pure":
        if req.model not in MODEL_MAP:
            raise HTTPException(status_code=400, detail="Invalid model")
        api_model = MODEL_MAP[req.model]
        prompt = f"问题：{req.query}\n回答："
        start = time.time()
        answer, _ = call_llm(prompt, api_model)
        elapsed = time.time() - start
        return ChatResponse(answer=answer, response_time=elapsed)

    # RAG 模式
    elif req.mode == "rag":
        if req.model not in MODEL_MAP:
            raise HTTPException(status_code=400, detail="Invalid model")
        api_model = MODEL_MAP[req.model]
        retrieved = retrieve_by_mode(req.query, req.retrieval_mode)
        prompt = build_rag_prompt(req.query, retrieved)
        start = time.time()
        answer, _ = call_llm(prompt, api_model)
        elapsed = time.time() - start
        return ChatResponse(answer=answer, response_time=elapsed, retrieved_chunks=retrieved)

    else:
        raise HTTPException(status_code=400, detail="Invalid mode")


@app.get("/questions")
async def get_questions():
    q_file = "data/questions.json"
    if os.path.exists(q_file):
        with open(q_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"factual": [], "reasoning": [], "multi-hop": []}


@app.post("/evaluate")
async def evaluate(eval_req: EvaluateRequest):
    # 确保所有字段存在
    record = eval_req.dict()
    record["timestamp"] = datetime.now().isoformat()
    save_evaluation(record)
    return {"status": "ok", "total": len(load_evaluations())}


@app.get("/stats")
async def get_stats():
    records = load_evaluations()
    if not records:
        return {
            "total_evaluations": 0,
            "pure_accuracy": 0,
            "rag_accuracy": 0,
            "collab_accuracy": 0,
            "pure_response_time": 0,
            "rag_response_time": 0,
            "collab_response_time": 0,
            "avg_retrieved_docs_rag": 0,
            "question_type_accuracy": {},
            "retrieval_method_accuracy": {},
            "retrieval_method_response_time": {},
            "model_accuracy": {"R1": 0, "V3": 0},
            "model_response_time": {"R1": 0, "V3": 0},
            "collab_combinations": {
                "R1→V3": {"accuracy": 0, "response_time": 0, "total": 0},
                "V3→R1": {"accuracy": 0, "response_time": 0, "total": 0},
            },
            "radar_labels": ["准确率", "响应时间(秒)", "检索文档数"],
            "radar_datasets": []
        }

    # 整体统计（按模式分组）
    pure_records = [r for r in records if r["mode"] == "pure"]
    rag_records = [r for r in records if r["mode"] == "rag"]
    collab_records = [r for r in records if r["mode"] == "collab"]

    pure_acc = sum(r["is_accurate"] for r in pure_records) / len(pure_records) if pure_records else 0
    rag_acc = sum(r["is_accurate"] for r in rag_records) / len(rag_records) if rag_records else 0
    collab_acc = sum(r["is_accurate"] for r in collab_records) / len(collab_records) if collab_records else 0

    pure_time = sum(r["response_time"] for r in pure_records) / len(pure_records) if pure_records else 0
    rag_time = sum(r["response_time"] for r in rag_records) / len(rag_records) if rag_records else 0
    collab_time = sum(r["response_time"] for r in collab_records) / len(collab_records) if collab_records else 0

    # 平均检索文档数（仅RAG）
    rag_retrieved = [r["retrieved_count"] for r in rag_records if r.get("retrieved_count", 0) > 0]
    avg_retrieved = sum(rag_retrieved) / len(rag_retrieved) if rag_retrieved else 0

    # 问题类型准确率
    qtype_acc = {}
    for qtype in ["factual", "reasoning", "multi-hop"]:
        q_records = [r for r in records if r["question_type"] == qtype]
        qtype_acc[qtype] = sum(r["is_accurate"] for r in q_records) / len(q_records) if q_records else 0

    # 检索方式统计（仅RAG模式）
    retrieval_methods = ["hybrid", "semantic", "keyword"]
    retrieval_acc = {}
    retrieval_time = {}
    for method in retrieval_methods:
        method_records = [r for r in rag_records if r.get("retrieval_mode") == method]
        if method_records:
            retrieval_acc[method] = sum(r["is_accurate"] for r in method_records) / len(method_records)
            retrieval_time[method] = sum(r["response_time"] for r in method_records) / len(method_records)
        else:
            retrieval_acc[method] = 0
            retrieval_time[method] = 0

    # 模型对比（纯模型 + RAG，不含合作）
    model_records = {"R1": [], "V3": []}
    for r in records:
        if r["mode"] in ["pure", "rag"] and r["model"] in ["R1", "V3"]:
            model_records[r["model"]].append(r)
    model_acc = {}
    model_time = {}
    for model, recs in model_records.items():
        model_acc[model] = sum(r["is_accurate"] for r in recs) / len(recs) if recs else 0
        model_time[model] = sum(r["response_time"] for r in recs) / len(recs) if recs else 0

    # 合作模式组合统计（仅保留 R1→V3 和 V3→R1）
    collab_combinations = {
        "R1→V3": {"total": 0, "correct": 0, "response_times": []},
        "V3→R1": {"total": 0, "correct": 0, "response_times": []},
    }
    for r in collab_records:
        model_name = r.get("model", "")
        # 只统计允许的组合，忽略自组合（如 R1→R1, V3→V3）
        if model_name in collab_combinations:
            comb = collab_combinations[model_name]
            comb["total"] += 1
            if r["is_accurate"]:
                comb["correct"] += 1
            comb["response_times"].append(r["response_time"])
    collab_stats = {}
    for name, data in collab_combinations.items():
        if data["total"] > 0:
            acc = data["correct"] / data["total"]
            avg_time = sum(data["response_times"]) / len(data["response_times"])
        else:
            acc = 0
            avg_time = 0
        collab_stats[name] = {
            "accuracy": acc,
            "response_time": avg_time,
            "total": data["total"]
        }

    # 雷达图数据
    radar_configs = [
        {"label": "纯模型 R1", "filter": lambda r: r["mode"]=="pure" and r["model"]=="R1"},
        {"label": "纯模型 V3", "filter": lambda r: r["mode"]=="pure" and r["model"]=="V3"},
        {"label": "RAG R1 混合检索", "filter": lambda r: r["mode"]=="rag" and r["model"]=="R1" and r.get("retrieval_mode")=="hybrid"},
        {"label": "RAG V3 混合检索", "filter": lambda r: r["mode"]=="rag" and r["model"]=="V3" and r.get("retrieval_mode")=="hybrid"},
    ]
    # 添加有数据的合作模式组合（只有 R1→V3 和 V3→R1）
    for combo_name, combo_data in collab_stats.items():
        if combo_data["total"] > 0:
            radar_configs.append({
                "label": f"合作 {combo_name}",
                "filter": lambda r, cn=combo_name: r["mode"]=="collab" and r.get("model")==cn
            })
    radar_labels = ["准确率", "响应时间(秒)", "检索文档数"]
    radar_datasets = []
    for cfg in radar_configs:
        recs = [r for r in records if cfg["filter"](r)]
        if recs:
            acc = sum(r["is_accurate"] for r in recs) / len(recs)
            time_avg = sum(r["response_time"] for r in recs) / len(recs)
            retrieved_avg = sum(r.get("retrieved_count", 0) for r in recs) / len(recs)
            radar_datasets.append({
                "label": cfg["label"],
                "data": [acc, time_avg, retrieved_avg],
                "borderColor": get_random_color(),
                "fill": False
            })

    return {
        "total_evaluations": len(records),
        "pure_accuracy": pure_acc,
        "rag_accuracy": rag_acc,
        "collab_accuracy": collab_acc,
        "pure_response_time": pure_time,
        "rag_response_time": rag_time,
        "collab_response_time": collab_time,
        "avg_retrieved_docs_rag": avg_retrieved,
        "question_type_accuracy": qtype_acc,
        "retrieval_method_accuracy": retrieval_acc,
        "retrieval_method_response_time": retrieval_time,
        "model_accuracy": model_acc,
        "model_response_time": model_time,
        "collab_combinations": collab_stats,
        "radar_labels": radar_labels,
        "radar_datasets": radar_datasets
    }

def get_random_color():
    import random
    return f"hsl({random.randint(0,360)}, 70%, 50%)"


# 静态文件
app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
async def welcome(): return FileResponse("frontend/welcome.html")


@app.get("/test")
async def test(): return FileResponse("frontend/test.html")


@app.get("/eval")
async def eval_page(): return FileResponse("frontend/eval.html")


@app.get("/chat")
async def chat_page(): return FileResponse("frontend/chat.html")