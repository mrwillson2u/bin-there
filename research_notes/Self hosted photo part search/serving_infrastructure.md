# Serving infrastructure for self-hosted photo search (image embeddings, VLMs, vector search) — Node 22 + SQLite + Docker, home-lab GPU

Research date: 2026-11-03. Tool budget was limited (about 20 calls), so several "practical numbers" questions are recorded as gaps rather than guessed. Anything not tied to a source is in Inferences or Gaps.

## 1. Image embeddings from Node: transformers.js / onnxruntime-node vs Python sidecar vs Infinity / TEI / Ollama / llama.cpp

### Takeaway
The lightest path is in-process transformers.js (now v4.x, on onnxruntime-node). It runs CLIP, SigLIP/SigLIP2, DINOv2 and DINOv3 ONNX models on CPU, or on CUDA 12 on Linux x64, with no extra container. Of the embedding servers, Ollama has no image-embedding support (the issue has been open since 2024) and TEI is text-only. Infinity v3 lists CLIP but needs an Ampere-or-newer GPU. llama.cpp's server now advertises multimodal embeddings. A Python open_clip sidecar is the fallback with the most flexibility.

### Cited Findings
**transformers.js / onnxruntime-node**
- The latest `@huggingface/transformers` on unpkg is **4.3.2**, so transformers.js has moved past v3. In Node it uses `onnxruntime-node`, and in the browser it uses `onnxruntime-web`. — [unpkg onnx.js](https://app.unpkg.com/@huggingface/transformers/files/src/backends/onnx.js); [transformers.js ONNX backend docs](https://huggingface.co/docs/transformers.js/main/api/backends/onnx)
- Node execution-provider matrix from a source comment ("Updated as of ONNX Runtime 1.23.0-dev.20250612"):
  - **CUDA**: Linux x64 only, "CUDA v12".
  - **WebGPU (experimental)**: Windows, Linux x64 and macOS.
  - **DirectML**: Windows only.
  - **CoreML**: macOS only.
  - Source: [unpkg onnx.js v4.3.2](https://app.unpkg.com/@huggingface/transformers/files/src/backends/onnx.js)
  - The older v3.8.1 source listed CUDA as Linux x64 on CUDA 11.8 (ORT 1.20.1). This shows the CUDA build has changed between versions. — [unpkg onnx.js v3.8.1](https://app.unpkg.com/@huggingface/transformers@3.8.1/files/src/backends/onnx.js)
- In transformers.js v3, `device: "gpu"` expands to `webgpu`, `cuda`, `dml` and `webnn-gpu`. — [unpkg onnx.js v3.5.2](https://app.unpkg.com/@huggingface/transformers@3.5.2/files/src/backends/onnx.js)
- The unofficial `onnxruntime-node-gpu` fork is archived and stuck at 1.14.0, so don't use it. — [GitHub dakenf/onnxruntime-node-gpu](https://github.com/dakenf/onnxruntime-node-gpu)
- Usage pattern: `pipeline("image-feature-extraction", "<repo>", { dtype: "q8" })`. Repos keep their ONNX weights in an `onnx/` subfolder, converted with Optimum. — [onnx-community/ijepa_vith14_22k card](https://huggingface.co/onnx-community/ijepa_vith14_22k)
- **ONNX vision-embedding repos on Hugging Face** (queried via the HF API on 2026-11-03; download counts in parentheses) — [HF API onnx-community](https://huggingface.co/onnx-community), [HF API Xenova](https://huggingface.co/Xenova):
  - **SigLIP2, onnx-community**:
    - Base: `siglip2-base-patch16-224-ONNX` (10.2k), `-256` (3.7k), `-384`, `-512`, `base-patch32-256`, `base-patch16-naflex`.
    - Large: patch16 at 256, 384 and 512.
    - So400m: `siglip2-so400m-patch14-224/384-ONNX` (1.2k for 384) and `siglip2-so400m-patch16-256-ONNX` (3.5k), `-384`, `-512`.
    - Giant-opt: 256 and 384.
  - **SigLIP v1**: `Xenova/siglip-base-patch16-224` (48k), plus 256/384/512 and large variants. Also `onnx-community/siglip-so400m-patch14-384-ONNX`.
  - **CLIP**:
    - Xenova: `Xenova/clip-vit-base-patch16` (97k), `clip-vit-base-patch32` (239k), `clip-vit-large-patch14` and `-336`.
    - onnx-community: `CLIP-ViT-B-32-laion2B-s34B-b79K-ONNX`, `CLIP-ViT-L-14-DataComp.XL-s13B-b90K-ONNX`.
  - **DINOv2**:
    - Xenova: `Xenova/dinov2-small` (36k), `-base`, `-large`.
    - onnx-community: `dinov2-small/base/large(-ONNX)` and `dinov2-with-registers-{small,base,large,giant}`.
  - **DINOv3**: `onnx-community/dinov3-vits16-…-ONNX` (3.1k), `dinov3-vitb16-pretrain-lvd1689m-ONNX` (5.3k), plus vitl16, vith16plus and ConvNeXt variants.
- The third-party `SkyStar-tech/siglip2-large-patch16-384-ONNX` card shows transformers.js use through the `zero-shot-image-classification` pipeline. — [HF](https://huggingface.co/SkyStar-tech/siglip2-large-patch16-384-ONNX/discussions)

**Hugging Face TEI (text-embeddings-inference)**
- TEI supports only text architectures: Nomic, BERT, CamemBERT, XLM-RoBERTa, JinaBERT, Mistral, GTE, Qwen2, Qwen3, MPNet, ModernBERT and Gemma3. CLIP, SigLIP and other vision models are not listed. — [TEI supported models](https://huggingface.co/docs/text-embeddings-inference/supported_models)
- Images: `cpu-1.9`, plus per-architecture GPU images (`turing-1.9` is experimental, `86-1.9`, `89-1.9`, and others). Compute capability below 7.5 is not supported. GPU images need the NVIDIA Container Toolkit and a driver with CUDA 12.2 or newer. — [same](https://huggingface.co/docs/text-embeddings-inference/supported_models)

**Infinity (michaelfeil/infinity)**
- The repo description lists "clip, clap and colpali". The v3 section says "Dense text and multimodal embeddings through `/v1/embeddings`". The README shows only string inputs and doesn't document the image input format. — [GitHub infinity](https://github.com/michaelfeil/infinity)
- v3 image `ghcr.io/michaelfeil/infinity_v3:nvidia-3.0.0` needs an NVIDIA GPU with **SM80 (Ampere) or newer** plus the NVIDIA Container Toolkit. No v3 CPU image is mentioned. The README history places the native v3 server at "2026/10". The v2 Python version had CPU, ONNX and TensorRT options. — [GitHub infinity](https://github.com/michaelfeil/infinity)

**Ollama**
- Issue #5304, "Support for multimodal embedding models" (CLIP-style image embeddings via REST), opened 2024-06-26:
  - It is still **open**, with about 73 upvotes and no maintainer response.
  - The latest activity, on 2026-06-24, marked another request (#16887) as a duplicate.
  - Workarounds people use: an open_clip microservice (`hoeflechner/oclip`), or **vLLM**, which serves multimodal embeddings such as Qwen3-VL-Embedding through `/embeddings`.
  - Source: [ollama#5304](https://github.com/ollama/ollama/issues/5304)
- `/api/embed` (added in 0.3.6) is text-oriented. — [openSUSE ollama.changes](https://build.opensuse.org/projects/home:esampson:AI/packages/ollama/files/ollama.changes?expand=0)

**llama.cpp**
- The llama-server README says multimodal support is "currently an experimental feature" (#12898). It covers the OAI chat endpoint, the non-OAI completions endpoint and the non-OAI embeddings endpoint.
  - For embeddings: "This endpoint also supports multimodal embeddings."
  - Multimodal reranking accepts images in `query` and `documents` (Jina format).
  - `--mmproj-auto` is on by default when you use `-hf`.
  - Source: [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)

### Inferences
- For hundreds to a few thousand photos, CPU inference in-process with transformers.js is probably enough. Indexing runs once, and query photos arrive one at a time. A SigLIP2-base-224/256 (`onnx-community/siglip2-base-patch16-*-ONNX`) or `Xenova/clip-vit-base-patch16` model at q8 or fp16 adds no container and no GPU dependency. DINOv2/DINOv3-base (image-only, no text tower) is the option for photo-to-photo matching of fine part details. Pick by retrieval quality, not by serving cost.
- CUDA inside the Node container is possible because `onnxruntime-node` ships Linux x64 CUDA 12 support. It would make the app image much heavier (CUDA/cuDNN libraries) and tie it to the GPU, so it argues for a separate container if GPU embedding is wanted.
- Infinity v3 is ruled out for pre-Ampere cards such as Turing RTX 20xx and GTX 16xx. TEI is ruled out for image embeddings.
- llama.cpp multimodal embeddings would only make sense with a VLM-based embedding GGUF, such as a Qwen3-VL-Embedding conversion. It does not serve CLIP/SigLIP. This is unverified.

### Gaps
- I found no reliable per-image CPU or GPU latency numbers for CLIP ViT-B/16, SigLIP2 base/so400m or DINOv2-base in transformers.js or onnxruntime-node. A local benchmark is needed. Rough expectations (not sourced): base ViTs at 224px are around 50–300 ms per image on a modern x86 CPU, and so400m at 384px is several times slower.
- Which ONNX dtypes (fp16/q8/q4) exist for each SigLIP2 repo, and the ONNX file sizes, were not checked.
- The Infinity v3 image-input request schema and its SigLIP support are unconfirmed.
- Whether llama.cpp's multimodal `/embedding` works with a specific Qwen3-VL-Embedding GGUF was not verified.

## 2. VLM serving: Ollama, llama.cpp llama-server, vLLM, LM Studio, LocalAI; coexistence with an existing Qwen deployment

### Takeaway
Ollama is the easiest choice for Qwen3-VL. Tags are 2B/4B/8B, with q4_K_M at 1.9/3.3/6.2 GB. It supports JSON-schema structured output with images, and its scheduler loads and unloads multiple models within VRAM limits. llama.cpp llama-server supports Qwen2.5-VL and (since about Oct 2025) Qwen3-VL through mmproj, with an OpenAI-compatible chat API. vLLM is a poor fit for an 8–12 GB card shared with another model, because it preallocates most of the VRAM.

### Cited Findings
**Ollama**
- `qwen3-vl` tags, all with 256K context:
  - 2b: q4_K_M 1.9 GB, q8_0 2.7 GB, bf16 4.3 GB.
  - 4b: q4_K_M 3.3 GB, q8_0 5.1 GB, bf16 8.9 GB.
  - 8b: q4_K_M 6.2 GB, q8_0 9.9 GB, bf16 18 GB.
  - Instruct and thinking variants are available.
  - Source: [ollama.com/library/qwen3-vl/tags](https://ollama.com/library/qwen3-vl/tags)
- Third-party VRAM guidance (lower reliability, and sources conflict):
  - 4B Q4_K_M: minimum 6 GB.
  - 8B Q4_K_M: minimum 8 GB, comfortable at 12–16 GB. Another guide says 12 GB.
  - Sources: [codersera](https://codersera.com/blog/qwen3-vl-4b-vs-qwen3-vl-8b-benchmarks-vram-guide/); [localaimaster](https://localaimaster.com/blog/best-local-vision-models)
- Structured outputs: "Vision models accept the same `format` parameter" (a JSON schema). The docs' example sends an image plus a Pydantic schema at temperature 0. Ollama's cloud does not support structured outputs. — [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)
- Scheduler and VRAM behaviour (from the FAQ):
  - **Keep-alive**: models stay loaded for 5 minutes by default. Use `keep_alive: 0` or `ollama stop` to unload immediately, or `-1` to keep a model loaded. `OLLAMA_KEEP_ALIVE` sets the global default, and a per-request value overrides it.
  - **Concurrency limits**: `OLLAMA_MAX_LOADED_MODELS` defaults to 3 × the number of GPUs. `OLLAMA_NUM_PARALLEL` defaults to 1.
  - **Concurrent loading**: "new models must be able to completely fit in VRAM to allow concurrent model loads". Otherwise requests queue while idle models are unloaded.
  - **Memory settings**: default context is 4096 (`OLLAMA_CONTEXT_LENGTH`). Flash Attention turns on automatically where supported. The KV cache can be quantized with `OLLAMA_KV_CACHE_TYPE=q8_0|q4_0`, which applies globally.
  - Source: [Ollama FAQ](https://docs.ollama.com/faq)
- Vision models report the capabilities `["completion","vision"]`, and some have no `tools`. — [Letta forum](https://forum.letta.com/t/question-about-ollama-vision-model-support/159)

**llama.cpp**
- The multimodal docs list Qwen2.5-VL 3B/7B/32B/72B (for example `-hf ggml-org/Qwen2.5-VL-7B-Instruct-GGUF`), Qwen2-VL, Qwen2.5-Omni and Qwen3-Omni.
  - Run it as `llama-server -m model.gguf --mmproj mmproj.gguf`, or with `-hf` (the projector is fetched automatically, and `--no-mmproj` turns it off).
  - The projector is offloaded to GPU by default (`--no-mmproj-offload` to disable). Some models need `-c 8192`.
  - Images go in through the OpenAI-compatible `/chat/completions`.
  - Source: [llama.cpp multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)
- Qwen3-VL support appears to have landed in PR #16780, "model: add support for qwen3vl series", around 2025-10-30. Qwen published GGUFs from 2B to 235B. This comes from a mirror commit plus a news aggregator, so it is secondary. — [mirror of tools/mtmd](https://git.peisongxiao.com/CS348Project/llama.cpp/src/commit/16724b5b6836a2d4b8936a5824d2ff27c52b4517/tools/mtmd); [toolnavs](https://toolnavs.com/de/article/662-qwen-announces-qwen3-vl-is-now-available-on-llamacpp-with-gguf-weights-ranging-f)
- The server's multimodal support is "experimental". Clients should check `/v1/models` for the `multimodal` capability. — [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)

**vLLM**
- Memory controls (from the docs):
  - `max_model_len` limits context.
  - `limit_mm_per_prompt` reduces the multimodal memory footprint, and setting it to 0 disables a modality.
  - `enforce_eager` turns off CUDA graphs, which "take up extra memory in the GPU".
  - Quantized models are supported.
  - Source: [vLLM conserving memory](https://docs.vllm.ai/en/latest/configuration/conserving_memory.html)
- vLLM serves multimodal embeddings (Qwen3-VL-Embedding) on `/embeddings`. — [ollama#5304 comments](https://github.com/ollama/ollama/issues/5304)

### Inferences
- **Coexistence with the existing Qwen model**:
  - **If it runs in Ollama**: add `qwen3-vl:4b` (3.3 GB) to the same Ollama instance. Ollama loads both when they fit in VRAM. Otherwise it queues requests and evicts idle models. Set `keep_alive` short for the VLM, such as `"30s"`, or `0` for batch jobs, so it doesn't sit on the other project's VRAM.
  - **If it runs in llama.cpp**: a single llama-server serves one model per process. Run a second llama-server on another port with `-ngl` sized to fit, or use a swap proxy such as llama-swap (not verified here).
  - On 8 GB, the 4B q4 VLM plus a resident text Qwen 7–8B q4 (about 5 GB) probably won't fit together, so they will swap. On 12 GB, 4B VLM plus a small text model can coexist.
- vLLM's default behaviour of preallocating about 90% of VRAM (`gpu_memory_utilization`, see Gaps) makes it unsuitable next to another GPU service on a consumer card.
- For attribute extraction, Ollama's `format` JSON schema with images is the simplest typed path from Node. Plain `fetch` to `/api/chat` with base64 images is enough, and no SDK is required.

### Gaps
- No sourced per-image latency for Qwen2.5-VL-3B/7B or Qwen3-VL-4B/8B on 8–12 GB consumer GPUs. Image token count depends on resolution (Qwen-VL uses dynamic resolution), so downscaling 1600px photos to about 768–1024px will matter a lot. Benchmark this locally.
- Ollama multi-image per message wasn't explicitly confirmed in docs fetched here (the `images` field is an array).
- I did not verify these llama-server details:
  - multiple images per request
  - `response_format`/`json_schema` combined with images
  - router/multi-model mode (reportedly added in late 2025)
- LM Studio headless (`lms server`) and LocalAI were not researched within the budget.
- I could not fetch a citation for vLLM's `gpu_memory_utilization` default of 0.9 (stated from general knowledge).

## 3. Vector search in SQLite: sqlite-vec, sqlite-vss, in-memory JS; hybrid with FTS5

### Takeaway
At 1k–10k vectors, any option is fast. sqlite-vec's own benchmarks show 100k × ≤1024-dim float queries in under 75 ms, so 10k is likely single-digit milliseconds. sqlite-vec loads into better-sqlite3 with one call. Plain JS cosine over a Float32Array cache is an equally valid zero-dependency choice at this scale.

### Cited Findings
- Installation: `npm install sqlite-vec`, then `sqliteVec.load(db)` on a better-sqlite3 `Database`. Vectors are bound as `Float32Array`. The docs header shows **v0.1.10-alpha.4**. — [sqlite-vec JS docs](https://alexgarcia.xyz/sqlite-vec/js.html)
- v0.1.0 was released 2024-08-01. Search is brute force only, with no ANN index. — [Alex Garcia blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html)
- Benchmarks on an M1 Mac mini with 8 GB RAM:
  - 100k vectors at 1024, 768, 384 or 192 dims (float): under 75 ms.
  - 100k × 1536: 105 ms.
  - 100k × 3072 bit-quantized: 11 ms.
  - Source: [Alex Garcia blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html)
- Binary quantization: `vec_quantize_binary()` gives 32x smaller vectors and roughly 10x faster queries, at an estimated 5–10% quality loss. Metadata filtering and partition keys were planned after v0.1.0. — [same](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html)
- A third-party benchmark from a competing vendor's author measured a full scan of 100k × 384 float32 at 67.84 ms with sqlite-vec on an M1 Pro. — [Marco Bambini, "State of Vector Search in SQLite"](https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite)
- sqlite-vec is still being adopted downstream in 2026, for example by exomem 0.6.0 (2026-07-04). — [exomem release](https://github.com/artexis10/exomem/releases/tag/v0.6.0)

### Inferences
- Scaling linearly from "<75 ms at 100k" puts 5k × 768 at roughly 4 ms or less, which is negligible. The choice between sqlite-vec and JS cosine comes down to convenience: SQL joins with FTS5 and item tables versus no native extension.
- The sqlite-vec npm package ships prebuilt per-platform binaries. Use a glibc base image (`node:22-slim`/bookworm) rather than Alpine/musl to avoid loader problems. The docs fetched don't cover Docker or musl, so this is unverified.
- Hybrid search: run the FTS5 `bm25()` query and the vec KNN query separately, then merge with reciprocal-rank fusion in TS. Both live in the same SQLite file.
- sqlite-vss is the predecessor (Faiss-based) and has been superseded by sqlite-vec. Not freshly verified here.

### Gaps
- I didn't find the current sqlite-vec version or 2025–2026 release status (whether metadata columns, partition keys and ANN shipped), apart from the "v0.1.10-alpha.4" doc header.
- No source confirms sqlite-vss's deprecation status.

## 4. Docker GPU setup and keeping the app container light

### Takeaway
Keep the Hono/Node app container CPU-only and slim. Put any GPU work in separate service containers (Ollama/llama.cpp, and optionally a GPU embedding service) that you reserve the GPU for in Compose. This requires the NVIDIA Container Toolkit on the host.

### Cited Findings
- Compose GPU reservation: under the service, `deploy.resources.reservations.devices: - driver: nvidia, count: 1, capabilities: [gpu]`. The docs' example image is `nvidia/cuda:12.9.0-base-ubuntu22.04`. — [Docker Compose GPU support](https://docs.docker.com/compose/how-tos/gpu-support/)
- TEI and Infinity GPU images require the NVIDIA Container Toolkit. TEI also needs drivers with CUDA 12.2 or newer. — [TEI](https://huggingface.co/docs/text-embeddings-inference/supported_models); [Infinity](https://github.com/michaelfeil/infinity)
- The `onnxruntime-node` CUDA EP in transformers.js is Linux x64 with CUDA 12. — [unpkg onnx.js](https://app.unpkg.com/@huggingface/transformers/files/src/backends/onnx.js)

### Inferences
Recommended architecture options:
- **A (simplest, CPU-only embeddings)**: transformers.js plus sqlite-vec (or JS cosine) inside the existing app container. Add the VLM later by calling the existing Ollama or llama-server over HTTP at `http://ollama:11434`, or via the host network.
- **B (GPU embeddings)**: a small separate embedding container.
  - Option 1: a Python FastAPI + open_clip/transformers service on a CUDA runtime image.
  - Option 2: a Node container running onnxruntime-node with CUDA 12 libraries.
  - Either one exposes `/embed` and holds about 0.5–2 GB of VRAM.
  - The main app stays light.
- **C (single GPU runtime)**: reuse the existing Ollama for the VLM and keep embeddings on CPU in-app. This avoids a second CUDA process competing for VRAM with the other project's Qwen. It is probably the best fit for 8 GB.

### Gaps
- No measured image sizes were fetched. As general knowledge, not sourced here: CUDA runtime/cuDNN images and PyTorch-based sidecars are typically several GB, while `node:22-slim` is about 200 MB.
- I didn't fetch the NVIDIA Container Toolkit install doc.

## 5. Practical numbers (memory and latency)

### Takeaway
I only found sourced numbers for model download sizes and sqlite-vec query times. Embedding-model and VLM latency on the target hardware is unsourced and must be benchmarked locally.

### Cited Findings
- Qwen3-VL Ollama sizes: 2B 1.9 GB, 4B 3.3 GB, 8B 6.2 GB (q4_K_M); 8B q8_0 9.9 GB. — [Ollama tags](https://ollama.com/library/qwen3-vl/tags)
- The Ollama default context is 4096, and the KV cache can be quantized to q8_0/q4_0 to save VRAM. — [Ollama FAQ](https://docs.ollama.com/faq)
- sqlite-vec takes under 75 ms for 100k vectors at ≤1024 dims. — [Alex Garcia](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html)

### Inferences
- VRAM budget for the VLM: model file plus the mmproj/vision encoder plus KV cache for the image tokens. Qwen3-VL-4B q4 at 4K context plausibly needs about 4–5 GB, and 8B q4 about 7.5–9 GB, which fits 12 GB but is tight on 8 GB. These are estimates, not measurements.
- Embedding model parameter counts (general knowledge): CLIP ViT-B/16 is about 150M total (about 86M vision), SigLIP2-base about 375M total, so400m vision about 400M, and DINOv2-base about 86M. All fit easily in CPU RAM (under 1–2 GB at fp32).

### Gaps
- Per-image latency for CLIP B/16, SigLIP2 base/so400m and DINOv2-base on CPU vs GPU (transformers.js/ORT) was not found in a citable source.
- Per-image latency for Qwen2.5-VL 3B/7B and Qwen3-VL 4B/8B on 8–12 GB consumer GPUs in Ollama or llama.cpp was not found in a citable source. Community r/LocalLLaMA numbers weren't reachable within the budget.
