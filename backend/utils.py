import requests
import time
from .config import API_KEY, BASE_URL, EMBEDDING_MODEL

def get_embedding(text: str):
    url = f"{BASE_URL}/embeddings"
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    text = text[:800].strip()
    data = {"model": EMBEDDING_MODEL, "input": [text]}
    try:
        resp = requests.post(url, headers=headers, json=data, timeout=30)
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]
    except Exception as e:
        print(f"Embedding 失败: {e}")
        return [0.0] * 1024

def call_llm(prompt: str, model_name: str, max_tokens: int = 500) -> tuple[str, float]:
    url = f"{BASE_URL}/chat/completions"
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    data = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": max_tokens,
        "stream": False
    }
    start = time.time()
    resp = requests.post(url, headers=headers, json=data, timeout=120)
    elapsed = time.time() - start
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    return content, elapsed