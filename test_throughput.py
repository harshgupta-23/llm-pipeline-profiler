"""
test_throughput.py
Real LLM pipeline benchmark script using HuggingFace 'transformers' (distilgpt2).
Tests actual model loading, tokenization, autoregressive token generation, and decoding stages.
Calculates and logs tokens-per-second (tps) metrics and monitors active CPU/RAM/GPU usage.
"""
from llm_profiler import Tracer
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch
import time

# Auto-detect CUDA capability
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Running throughput test on device: {device}")

# Paste your CURRENT ngrok URL here
tracer = Tracer(
    run_name="gpt2-real-throughput-run",
    model_name="distilgpt2",
    dashboard_url="https://stimuli-detention-video.ngrok-free.dev"
)

with tracer.stage("model_load"):
    model = AutoModelForCausalLM.from_pretrained("distilgpt2").to(device)
    tokenizer = AutoTokenizer.from_pretrained("distilgpt2")

with tracer.stage("tokenize"):
    inputs = tokenizer("The quick brown fox jumps over", return_tensors="pt").to(device)

with tracer.stage("generate", profile_torch=True):
    # Generate 50 tokens one-by-one to log live throughput (tps) time-series
    input_ids = inputs["input_ids"]
    attention_mask = inputs["attention_mask"]
    
    start_time = time.perf_counter()
    tokens_generated = 0
    max_new_tokens = 50

    for i in range(max_new_tokens):
        with torch.no_grad():
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            next_token = torch.argmax(outputs.logits[:, -1, :], dim=-1, keepdim=True)
            
            # Concatenate token and attention mask
            input_ids = torch.cat([input_ids, next_token], dim=-1)
            attention_mask = torch.cat([
                attention_mask,
                torch.ones((1, 1), device=device, dtype=torch.long)
            ], dim=-1)
            
        tokens_generated += 1
        elapsed = time.perf_counter() - start_time
        
        # Calculate tokens per second
        tps = tokens_generated / elapsed if elapsed > 0 else 0.0
        tracer.log_metric("tps", tps)
        
        # Small sleep (e.g. 30ms) to allow the background thread to sample memory utilization
        time.sleep(0.03)

with tracer.stage("postprocess"):
    text = tokenizer.decode(input_ids[0], skip_special_tokens=True)

print("\n--- Model Output ---")
print(text)
print("--------------------")

tracer.export()
print("\nExport complete. Check the dashboard now!")
