import os

# 硅基流动 API 配置
API_KEY = "sk-uzdvurtsnnxxdrkyomuokdxqdxkojwpjbbzwcvkqjatqmmpw"
BASE_URL = "https://api.siliconflow.cn/v1"

# 模型名称（硅基流动上的模型标识）
MODEL_R1 = "deepseek-ai/DeepSeek-R1"
MODEL_V3 = "deepseek-ai/DeepSeek-V3"

# Embedding 模型
EMBEDDING_MODEL = "BAAI/bge-m3"

# 检索参数
SEMANTIC_WEIGHT = 0.7
KEYWORD_WEIGHT = 0.3
TOP_K = 5

# 向量库路径
INDEX_PATH = "data/faiss_tour.index"
MAPPING_PATH = "data/chunk_mapping.json"