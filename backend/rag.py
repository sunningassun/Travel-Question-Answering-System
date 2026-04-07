import numpy as np
import faiss
import json
import os
from typing import List
from .config import INDEX_PATH, MAPPING_PATH, SEMANTIC_WEIGHT, KEYWORD_WEIGHT, TOP_K
from .utils import get_embedding

_index = None
_chunks = None


def load_vector_store():
    global _index, _chunks
    if _index is None:
        if not os.path.exists(INDEX_PATH) or not os.path.exists(MAPPING_PATH):
            raise FileNotFoundError("向量库文件不存在")
        _index = faiss.read_index(INDEX_PATH)
        with open(MAPPING_PATH, "r", encoding="utf-8") as f:
            _chunks = json.load(f)
        print(f"向量库加载成功，共 {len(_chunks)} 个文本块")
    return _index, _chunks


def keyword_score(query_words_set, chunk: str) -> int:
    chunk_lower = chunk.lower()
    return sum(1 for w in query_words_set if w in chunk_lower)


def semantic_search(query: str, top_k: int = TOP_K) -> List[str]:
    """纯语义检索"""
    index, chunks = load_vector_store()
    q_vec = np.array([get_embedding(query)], dtype=np.float32)
    D, I = index.search(q_vec, top_k)
    return [chunks[idx] for idx in I[0]]


def keyword_search(query: str, top_k: int = TOP_K) -> List[str]:
    """纯关键词检索（基于词频排序）"""
    _, chunks = load_vector_store()
    query_words = set(query.lower().split())
    scored = []
    for idx, chunk in enumerate(chunks):
        score = keyword_score(query_words, chunk)
        scored.append((score, idx))
    scored.sort(reverse=True)
    return [chunks[idx] for _, idx in scored[:top_k]]


def hybrid_search(query: str, top_k: int = TOP_K) -> List[str]:
    """混合检索：语义 + 关键词"""
    index, chunks = load_vector_store()
    query_words = set(query.lower().split())
    q_vec = np.array([get_embedding(query)], dtype=np.float32)
    D_sem, I_sem = index.search(q_vec, top_k * 3)

    candidates = []
    for idx, dist in zip(I_sem[0], D_sem[0]):
        sem_score = 1.0 / (1.0 + dist)
        kw_score = keyword_score(query_words, chunks[idx])
        final = SEMANTIC_WEIGHT * sem_score + KEYWORD_WEIGHT * kw_score
        candidates.append((-final, idx))

    candidates.sort()
    return [chunks[idx] for _, idx in candidates[:top_k]]


def retrieve_by_mode(query: str, mode: str, top_k: int = TOP_K) -> List[str]:
    if mode == "semantic":
        return semantic_search(query, top_k)
    elif mode == "keyword":
        return keyword_search(query, top_k)
    else:  # hybrid
        return hybrid_search(query, top_k)


def build_rag_prompt(query: str, context_chunks: List[str]) -> str:
    context = "\n".join(context_chunks)
    return f"已知信息：\n{context}\n\n问题：{query}\n回答："