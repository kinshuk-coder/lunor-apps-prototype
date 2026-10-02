"""Single source of truth for model names, provider URL and limits.

Every value can be overridden with an environment variable, so swapping a
model (e.g. if a Groq preview model is retired) is a one-line .env change.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# Explicit path (the uvicorn reload worker can't auto-locate it) and override, so a blank
# GROQ_API_KEY inherited from the shell doesn't mask the local .env value.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")

# Strong coding model: Plan, Build, auto-fix, challenge checking.
STRONG_MODEL = os.getenv("STRONG_MODEL", "qwen/qwen3.8-27b")
# Used when the strong model is rate-limited (Groq limits are per model, so this
# also spreads load). On Groq's free tier qwen3.8-27b allows only 1K output tokens/min.
STRONG_FALLBACK_MODEL = os.getenv("STRONG_FALLBACK_MODEL", "openai/gpt-oss-120b")
# Fast, cheap model: Understand, Explain, Learn.
FAST_MODEL = os.getenv("FAST_MODEL", "openai/gpt-oss-20b")

# Groq caps qwen3.8-27b at 16,384 output tokens per call.
STRONG_MAX_TOKENS = int(os.getenv("STRONG_MAX_TOKENS", "16000"))
FAST_MAX_TOKENS = int(os.getenv("FAST_MAX_TOKENS", "8000"))

LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "3"))  # SDK retries with backoff on 429/5xx
MAX_FIX_RETRIES = int(os.getenv("MAX_FIX_RETRIES", "2"))
RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "30"))

DB_PATH = os.getenv("DB_PATH", "lunor.db")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
