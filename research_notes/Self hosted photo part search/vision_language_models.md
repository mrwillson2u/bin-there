# Small self-hostable vision-language models (VLMs) for identifying parts and reading markings (state as of Nov 2026)

Scope: open-weight VLMs that can run at $0 on a home-lab Ubuntu box. GPU tiers: 8–12 GB, 16 GB and 24 GB VRAM, plus a CPU-only fallback. Two jobs: (a) describe a part and extract its attributes and marking text, and (b) rerank a shortlist of catalog photos. Research date: 2026-11-03. 17 tool calls were used, so some candidates on the list were not checked (see the Gaps sections).

## 1. Candidates: current versions, parameters, VRAM, image handling, license

### Takeaway
By late 2026 the strongest small open VLMs are the Qwen family and Gemma 4. Qwen3.5 Small (0.8B/2B/4B/9B) came out in Feb–Mar 2026 with native vision. Qwen3-VL (2B/4B/8B/30B-A3B/32B, Instruct and Thinking) came out in late 2025. Gemma 4 (E2B/E4B/26B-A4B/31B) came out in April 2026. All of these are Apache-2.0. MiniCPM-V 4.5 (8B, Apache-2.0) and InternVL3.5 are solid alternatives. Moondream 3 has a restrictive BSL license, and Florence-2 (MIT, 0.77B) is a cheap specialist for detection and OCR. Every Qwen3-VL and Qwen3.5 size up to about 9B fits in 8 GB at Q4 in Ollama.

### Cited Findings
**Qwen3.5 Small (newest Qwen generation with native vision)**
- Released early March 2026 as four dense models (0.8B, 2B, 4B, 9B) plus base versions. All process text, images and video in one unified architecture. — [Artificial Analysis](https://artificialanalysis.ai/articles/qwen3-5-small-models); [Gigazine](https://gigazine.net/gsc_news/en/20260303-qwen-3-5-small)
- Qwen3.5-9B model card: Apache-2.0. Citation dated February 2026. About 10B parameters. Uses "early fusion training on multimodal tokens." Hybrid Gated DeltaNet + Gated Attention layout. Context is 262,144 tokens natively, extensible to 1,010,000. — [HF Qwen/Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B)
- **Thinking mode is the default.** Qwen3.5 models "operate in thinking mode by default", and non-thinking output needs `enable_thinking=False`. This matters for latency and JSON extraction. — [HF Qwen/Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B)
- Ollama sizes (from a benchmark list): `qwen3.5:2b` 2.7 GB, `qwen3.5:4b` 3.4 GB, `qwen3.5:9b` 6.6 GB. — [PhotoPrism model comparison](https://docs.photoprism.app/developer-guide/vision/model-comparison/)
- The official card lists serving through SGLang, vLLM, KTransformers and HF Transformers. It mentions llama.cpp, Ollama and LM Studio only in passing. — [HF Qwen/Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B)

**Qwen3-VL (late 2025)**
- Tech report v1 is dated 27 Nov 2025. Grounding coordinates are normalized to [0,1000]. The default vision encoder is SigLIP2-SO-400M, and the 2B/4B models use SigLIP2-Large (300M). — [Qwen3-VL Technical Report, arXiv 2511.21631](https://arxiv.org/html/2511.21631)
- 8B-Instruct card: Apache-2.0. About 9B parameters. Context is 256K native, expandable to 1M. OCR covers 32 languages and is "robust to low light, blur, and tilt." It has stronger 2D grounding plus 3D grounding, and supports multi-image and video. The family includes dense and MoE models in Instruct and Thinking editions. — [HF Qwen/Qwen3-VL-8B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct)
- Ollama tags: `qwen3-vl:2b` 1.9 GB, `4b` 3.3 GB, `8b` 6.2 GB, `30b` (A3B MoE) 20 GB, `32b` 21 GB, `235b` 143 GB. All have a 256K context. Requires Ollama ≥ 0.12.7. — [Ollama library qwen3-vl](https://ollama.com/library/qwen3-vl)
- VRAM guidance (secondary source): 4B Q4_K_M GGUF is about 3.3 GB, needs at least 6 GB VRAM, and is comfortable at 8 GB. 8B Q4_K_M is about 6.1 GB, needs at least 8 GB, and is comfortable at 12–16 GB. Q8_0 "roughly doubles" the requirement (16 GB+ suggested for 8B). — [Codersera 4B vs 8B guide (Apr 2026, updated Jun 2026)](https://codersera.com/blog/qwen3-vl-4b-vs-qwen3-vl-8b-benchmarks-vram-guide/)

**Gemma 4 (April 2026)**
- Launched 2 April 2026 in four sizes: E2B, E4B, 26B MoE (3.8B active) and 31B dense. **Apache 2.0**, a change from the custom Gemma Terms of Use on Gemma 3. — [Wikipedia: Gemma](https://en.wikipedia.org/wiki/Gemma_(language_model)); [NYU Shanghai RITS summary](https://rits.shanghai.nyu.edu/ai/google-releases-gemma-4-frontier-open-models-under-apache-2-0/)
- E4B card: "4.5B effective (8B with embeddings)". Vision encoder is about 150M parameters, plus about 300M for audio. Context is 128K. **Configurable image token budget of 70/140/280/560/1120 tokens.** Higher budgets are recommended for OCR and small text. Variable aspect ratio is supported. Listed capabilities include object detection, OCR, handwriting and pointing. — [HF google/gemma-4-E4B-it](https://huggingface.co/google/gemma-4-E4B-it)
- Ollama sizes: `gemma4:latest` (e4b) 9.6 GB, `gemma4:e2b` 7.2 GB. These are large for their effective size because of the embedding parameters. — [PhotoPrism model comparison](https://docs.photoprism.app/developer-guide/vision/model-comparison/)
- llama.cpp mtmd lists Gemma 4 E2B, E4B, 26B-A4B and 31B, with E2B/E4B also taking audio. — [llama.cpp docs/multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)

**Gemma 3 (2025, older)**
- llama.cpp supports Gemma 3 4B/12B/27B. — [llama.cpp multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)
- Ollama `gemma3:4b` is 3.3 GB, with image prefill of about 770 ms per image on an RTX 4060. — [PhotoPrism](https://docs.photoprism.app/developer-guide/vision/model-comparison/)

**MiniCPM-V 4.5 (Aug 2025) / 4.6**
- 8B total (8.7B in the efficiency table), built on Qwen3-8B + SigLIP2-400M. Apache-2.0 with an optional registration questionnaire. Images up to 1.8 MP (e.g. 1344×1344). Uses "4x less visual tokens than most MLLMs." Switchable fast/deep thinking. Multi-image chat and few-shot in-context examples are supported. int4/GGUF/AWQ quants available. llama.cpp support since b6282 and vLLM since v0.10.2. Ollama support was still "waiting for official release" in the card snapshot (Aug 2025). — [HF openbmb/MiniCPM-V-4_5](https://huggingface.co/openbmb/MiniCPM-V-4_5)
- It is now in Ollama: `minicpm-v4.5:8b` (6.1 GB). A smaller `minicpm-v4.6:1b` (1.6 GB) also exists and was the fastest labeler in PhotoPrism's test. — [PhotoPrism](https://docs.photoprism.app/developer-guide/vision/model-comparison/)

**InternVL3.5 (Aug 2025)**
- OCRBench: 836 (2B), 822 (4B), 840 (8B). Overall average across nine benchmarks: 76.7 (2B), 80.0 (4B), 81.2 (8B). Caveat: the OCRBench column was matched by position in a table with no header row. — [InternVL3.5 paper, arXiv 2508.18265](https://arxiv.org/pdf/2508.18265)
- llama.cpp's official list names InternVL 2.5 (1B/4B) and InternVL 3 (1B/2B/8B/14B), **not InternVL3.5**. — [llama.cpp multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)

**Moondream 3 Preview**
- 9B MoE with about 2B active parameters and a 32K context. Skills: detect (bounding boxes), point (normalized 0–1), query and caption. FP16/BF16 needs about 18 GB VRAM, and one guide recommends ≥20 GB. **License: Business Source License 1.1 with an Additional Use Grant** ("free for personal, research and most commercial uses"). This is not OSI open source. — [HF moondream3-preview](https://huggingface.co/moondream/moondream3-preview); [DebuggerCafe](https://debuggercafe.com/introduction-to-moondream3-and-tasks/); [FiftyOne plugin docs](https://docs.voxel51.com/plugins/plugins_ecosystem/moondream3.html)
- llama.cpp supports only Moondream2 (the 20250414 version), not Moondream 3. — [llama.cpp multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)

**Florence-2 (Microsoft; older, 2024)**
- Florence-2-large has 0.77B parameters and an MIT license. Task prompts include `<OD>` (boxes + labels, 37.5 mAP on COCO for large) and `<OCR_WITH_REGION>` (quad boxes + text). — [HF microsoft/Florence-2-large README](https://huggingface.co/microsoft/Florence-2-large/blob/refs%2Fpr%2F1/README.md); [Azion docs](https://www.azion.com/en/documentation/products/ai/edge-ai/models/florence-2); [NVIDIA build page](https://build.nvidia.com/microsoft/microsoft-florence-2.md)

**Others in llama.cpp mtmd's list:** SmolVLM (256M/500M) and SmolVLM2 (2.2B; 256M/500M Video), Pixtral 12B, Qwen2-VL 2B/7B, Qwen2.5-VL 3B/7B/32B/72B, Mistral Small 3.1 24B, Llama 4 Scout, and Qwen2.5-Omni/Qwen3-Omni. — [llama.cpp multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)

**Qwen2.5-VL (early 2025, older):** Ollama `qwen2.5vl:7b` is 6.0 GB. — [PhotoPrism](https://docs.photoprism.app/developer-guide/vision/model-comparison/)

### Inferences
- **8–12 GB tier:** Qwen3-VL-8B-Instruct Q4 (6.2 GB), Qwen3.5-9B Q4 (6.6 GB), MiniCPM-V 4.5 Q4 (6.1 GB) and Qwen3-VL-4B or Qwen3.5-4B (about 3.3 GB) all fit, with room left for image tokens and KV cache. Gemma 4 E4B (9.6 GB in Ollama) is tight on 8 GB.
- **16 GB tier:** 8–9B models at Q8, or Qwen3-VL-30B-A3B at a lower quant.
- **24 GB tier:** Qwen3-VL-30B-A3B Q4 (20 GB) or Qwen3-VL-32B Q4 (21 GB) fit. Moondream 3 at BF16 (about 18 GB) also fits.
- Since the user already runs Qwen, sticking with the Qwen family (Qwen3-VL or Qwen3.5) is the lowest-friction choice: same tooling, same licensing (Apache-2.0), and the best-documented grounding.

### Gaps
- Not checked with sources: Phi-4-multimodal, Mistral Small 3.2 vision details, Llama 3.2 Vision (its llama.cpp mtmd status and the Llama Community License), GLM-4.1V/4.5V, LLaVA-OneVision, SmolVLM2 benchmarks, Gemma 3n. No license or VRAM numbers were gathered for these.
- No authoritative per-quant VRAM table (Q4/Q8/FP16 including mmproj) was found for any model. The numbers above are Ollama download sizes plus one secondary guide.
- Qwen3-VL's per-image token cost (patch size, min/max pixels) was not confirmed from a primary source.
- Whether Ollama supports Qwen3-VL-30B-A3B "Thinking" vs "Instruct" tags separately was not fully confirmed. PhotoPrism shows `qwen3-vl:4b-instruct` and a reasoning build, so separate tags exist at least for 4B.

## 2. OCR quality on small text, fine-grained recognition, and electronic-component markings

### Takeaway
On standard OCR benchmarks the small Qwen models lead. Qwen3.5-9B scores OCRBench 89.2 and CC-OCR 79.3. Qwen3.5-4B scores 85.0 and 76.7. Qwen3-VL-8B is reported at about 89.6 OCRBench, and InternVL3.5-2B/4B/8B score 836/822/840 out of 1000. No benchmark exists for reading component markings (SMD codes, color bands, cap labels). The only field report found (Gemma 3 27B) showed partial success with character-level errors and confusion between near-identical part numbers. Treat VLM-extracted values as hints to be verified, not ground truth.

### Cited Findings
- Qwen3.5-9B / 4B scores: OCRBench **89.2 / 85.0**, OmniDocBench1.5 87.7 / 86.2, CC-OCR **79.3 / 76.7**, RefCOCO(avg) 89.7 / 88.1, CountBench 97.2 / 96.3, MMMU 78.4 / 77.6, MMStar 79.7 / 78.3. — [HF Qwen/Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B)
- Qwen3-VL (secondary source, primary not named): OCRBench about 85 (4B Instruct), about 86 (4B Thinking), **89.6 (8B Instruct)**, about 88 (8B Thinking). DocVQA test about 91 / 94.2 / **96.1** / 95.3. — [Codersera](https://codersera.com/blog/qwen3-vl-4b-vs-qwen3-vl-8b-benchmarks-vram-guide/). These numbers could not be cross-checked against the official card, whose tables are images. One tracker gives 94.2 DocVQA for 4B, which conflicts with the "~91" Instruct figure. — [lmmarketcap](https://lmmarketcap.com/upcoming/qwen3-vl-4b)
- The Qwen3-VL tech report says the 2B/4B/8B models are "remarkably competitive" on OCR but gives no small-model OCR numbers in the text portion read. Flagship 235B OCRBench is 875. — [arXiv 2511.21631](https://arxiv.org/html/2511.21631)
- On a document-parsing benchmark (WeVisDoc), Qwen3-VL scores rise with size: 62.09 (2B) to 69.07 (8B). — [arXiv 2609.20423](https://arxiv.org/pdf/2609.20423)
- InternVL3.5 OCRBench: 836 (2B), 822 (4B), 840 (8B). — [arXiv 2508.18265](https://arxiv.org/pdf/2508.18265)
- MiniCPM-V 4.5 claims "leading" OCRBench and OmniDocBench results, beating GPT-4o-latest and Gemini 2.5, but its card gives no number. OpenCompass average is 77.0, vs 76.6 for GLM-4.1V-9B-Thinking. — [HF openbmb/MiniCPM-V-4_5](https://huggingface.co/openbmb/MiniCPM-V-4_5)
- Gemma 4 OmniDocBench 1.5 edit distance (lower is better): E2B 0.290, E4B 0.181, 26B-A4B 0.149, 31B 0.131. No OCRBench is published. — [HF google/gemma-4-E4B-it](https://huggingface.co/google/gemma-4-E4B-it). A small Roboflow test gave Gemma 4 26B-A4B 80% (24/30) text recognition. — [Roboflow playground](https://playground.roboflow.com/models/compare/gemma-4-26b-a4b-vs-glm-ocr)
- Moondream 3: one third-party review cautions that small text in photos is less reliable than with a dedicated OCR model. — [DebuggerCafe](https://debuggercafe.com/introduction-to-moondream3-and-tasks/)
- **Component markings (anecdotal):** a hobbyist ran Gemma 3 27B on electronics photos. It read some resistor and chip codes ("103", "221") but made a character-level error and **misidentified a BMP280 as a BME280**. — [elektroda.com](https://www.elektroda.com/news/news4113352.html) (summary from search result; the page itself timed out on fetch)
- No dedicated benchmark was found for reading SMD codes, resistor color bands or capacitor labels. Related evidence: MeasureBench (reading analog gauges) found the best VLM only about 30% accurate on real-world images, with errors attributed to fine-grained perception, such as confusing adjacent ticks. — [MeasureBench, arXiv 2510.26865](https://arxiv.org/pdf/2510.26865v2)
- A Roboflow Universe dataset (about 3,079 images) covers SMD component *detection*, not value reading. — [Roboflow Universe](https://universe.roboflow.com/abc-xp3ah/smd-component-detection-ybis6)
- Fine-grained recognition in general-label tests (RTX 4060 8 GB): Gemma 4 labeled a cheetah as a leopard and penguins as seals in every run. Qwen2.5-VL-7B was the weakest general labeler (56% coverage). Qwen3.5-4B had the best default coverage (88%). — [PhotoPrism](https://docs.photoprism.app/developer-guide/vision/model-comparison/)
- llama.cpp warns that dedicated OCR models (PaddleOCR-VL, GLM-OCR, DeepSeek-OCR, dots.ocr, HunyuanOCR) are "trained with specific prompt and input structure." — [llama.cpp multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)

### Inferences
- On published OCR scores, Qwen3.5-4B, Qwen3.5-9B and Qwen3-VL-8B are the best candidates under about 7 GB. Running at a high image-token budget (or Gemma 4's 1120-token budget) should matter more than model size when reading tiny laser-etched IC markings. Cropping the part first (grounding, section 4) also raises effective resolution.
- The BMP280/BME280 confusion is exactly the kind of failure that matters for an inventory app. Extracted markings should feed fuzzy and lexical search against the catalog, not hard filters.
- Resistor color bands and EIA-96 SMD codes are lookup problems. A safer design is for the VLM to transcribe colors or codes and for deterministic code to decode them.

### Gaps
- No 2B small-model OCRBench numbers for Qwen3.5 or Qwen3-VL were confirmed from primary sources.
- TextVQA numbers were not collected for any 2025–2026 model.
- No controlled study of VLM accuracy on electronic-component markings exists, as far as these searches found. The user would need a small in-house eval set.

## 3. Multi-image input (comparing a query photo to N candidates) and how many images fit

### Takeaway
Qwen3-VL, Qwen3.5, MiniCPM-V 4.5 and Gemma 4 all accept interleaved multiple images. Context windows (128K–256K) are not the binding limit on 8–12 GB. VRAM for KV cache and per-image token cost is. MiniCPM-V's compact visual tokens and Gemma 4's adjustable 70–1120 token budget make 5–6 candidate images practical on small GPUs. No measured "max images on 12 GB" figure was found.

### Cited Findings
- Qwen3-VL supports multi-image and video, with 256K native context. — [HF Qwen3-VL-8B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct); [Ollama](https://ollama.com/library/qwen3-vl)
- MiniCPM-V 4.5 supports multi-image chat and in-context few-shot. It uses "4x less visual tokens than most MLLMs", and the card quotes 64 tokens for 6 video frames vs 1,536 typical. — [HF openbmb/MiniCPM-V-4_5](https://huggingface.co/openbmb/MiniCPM-V-4_5)
- Gemma 4: "Freely mix text and images in any order within a single prompt." Per-image budgets are 70–1120 tokens. Context is 128K on the small models. — [HF google/gemma-4-E4B-it](https://huggingface.co/google/gemma-4-E4B-it)
- Qwen3.5: unified text, image and video model with a 262K context. — [HF Qwen/Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B)
- PhotoPrism's benchmark ran Ollama at a 4096-token context with 720 px images on an 8 GB RTX 4060. — [PhotoPrism](https://docs.photoprism.app/developer-guide/vision/model-comparison/)
- Some llama.cpp vision models need a larger context window, e.g. `-c 8192`. — [llama.cpp multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)

### Inferences
- The tokens per image (several hundred to about 1,000+ per 720–1000 px image for Qwen-style dynamic resolution) are an estimate; no confirmed figure was found. On that estimate, six images (query + 5 candidates) need roughly 6–8K tokens. That is feasible for a 4–8B Q4 model on 12 GB if the context is set to 8–16K. Downscale candidates (e.g. to 448–672 px) and keep the query at higher resolution.
- An alternative that avoids long multi-image prompts is pairwise scoring: N calls of (query, candidate), each answering "same part? yes/no + reason." This parallelizes on vLLM and makes small models' multi-image confusion less of a problem.

### Gaps
- No published measurement of the maximum number of images that fit for any model on 8/12/16/24 GB.
- No benchmark numbers (BLINK, MuirBench) for multi-image accuracy of the small models were collected.

## 4. Grounding and detection to crop the part

### Takeaway
Qwen3-VL and Qwen3.5 have the strongest documented grounding among general VLMs: RefCOCO avg 88–90 for Qwen3.5 4B/9B, with coordinates as JSON in a 0–1000 normalized space. Florence-2 (MIT, 0.77B) is a tiny dedicated detector and region-OCR model. Moondream 3 has explicit detect/point skills but a BSL license, about 18 GB at BF16, and no llama.cpp support. Gemma 4 lists detection and pointing, but its output format is not documented on the card.

### Cited Findings
- Qwen3-VL grounding coordinates are normalized to [0,1000]. — [arXiv 2511.21631](https://arxiv.org/html/2511.21631)
- Qwen3-VL claims 2D and 3D grounding plus judgment of object position, viewpoint and occlusion. — [Ollama qwen3-vl](https://ollama.com/library/qwen3-vl); [HF Qwen3-VL-8B](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct)
- Qwen3.5 RefCOCO(avg): 89.7 (9B), 88.1 (4B). CountBench 97.2 / 96.3. — [HF Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B)
- Florence-2: `<OD>` returns `bboxes` + `labels` (COCO 37.5 mAP, large). `<OCR_WITH_REGION>` returns quad boxes + text. 0.77B, MIT. — [HF Florence-2-large](https://huggingface.co/microsoft/Florence-2-large/blob/refs%2Fpr%2F1/README.md)
- Moondream 3: detect returns boxes, point returns normalized (0–1) coordinates. — [FiftyOne docs](https://docs.voxel51.com/plugins/plugins_ecosystem/moondream3.html); [HF moondream3-preview](https://huggingface.co/moondream/moondream3-preview)
- Gemma 4 lists "object detection" and "pointing" as capabilities. — [HF gemma-4-E4B-it](https://huggingface.co/google/gemma-4-E4B-it)

### Inferences
- A single Qwen3-VL-4B, Qwen3.5-4B or Qwen3-VL-8B instance can do both "box the main part" and "describe it" in one or two calls, so there is no second model to host. Florence-2 is a good CPU-friendly fallback for cropping and region OCR. It is old (2024) but small.

### Gaps
- No accuracy data for grounding *small parts on cluttered workbenches* specifically.
- Florence-2 serving in Ollama or llama.cpp was not confirmed. It is typically run via HF Transformers, which is not verified here.

## 5. Latency on consumer GPUs and CPU, and serving support (Ollama / llama.cpp / vLLM)

### Takeaway
The best real numbers come from PhotoPrism's August 2026 benchmark on an RTX 4060 8 GB (Ollama 0.32.6, 720 px images). Small VLMs return a short label set in **about 0.8–5 s p50**: qwen3.5:4b 2.5 s, qwen3-vl:4b-instruct 2.4 s, qwen3-vl:8b-instruct 5.2 s, minicpm-v4.5:8b 4.5 s, gemma4 e4b 2.6 s. Asking for more output roughly doubles that. CPU-only is about 24–36 s per image for a 7B model (older test). Qwen3-VL, Qwen3.5, Gemma 3/4, MiniCPM-V 4.5 and Qwen2.5-VL all run in Ollama today. llama.cpp mtmd covers Qwen2/2.5/3-VL, Gemma 3/4, MiniCPM-V 4.5, InternVL 2.5/3 and Moondream2, but not InternVL3.5 or Moondream 3.

### Cited Findings
- RTX 4060 8 GB, Ollama 0.32.6, 4096 ctx, 720 px. Label p50 / caption p50: qwen3.5:4b 2.5 s / 0.9 s. gemma4 e4b 2.6 / 0.8. minicpm-v4.5:8b 4.5. gemma3:4b 3.0 / 1.4 (prefill about 770 ms per image). minicpm-v4.6:1b 0.8 / 0.6. qwen3-vl:4b-instruct 2.4 / 1.2. qwen3-vl:8b-instruct 5.2. qwen3-vl:4b reasoning build 2.1 / **6.4** (caption about 5× the instruct build). qwen3.5:9b 3.3. qwen2.5vl:7b 2.7. qwen3.5:2b 0.8. With a requested label count (more output): qwen3-vl:8b-instruct 11.3 s, qwen3-vl:4b-instruct 5.2 s, minicpm-v4.5 8.5 s. The KV-cache and flash-attention settings were not captured, and "Qwen models are the most sensitive to KV cache quantization." — [PhotoPrism model comparison (benchmark dated 2026-08-08)](https://docs.photoprism.app/developer-guide/vision/model-comparison/)
- CPU: an earlier PhotoPrism run on a Ryzen AI 9 365 measured 24–36 s per image, with qwen2.5vl:7b averaging 36.34 s. The page now marks this as superseded and not comparable. — [PhotoPrism](https://docs.photoprism.app/developer-guide/vision/model-comparison/)
- Qwen3-VL Thinking responses are "2–4x longer" than Instruct. 8B is "too slow on CPU" (qualitative). — [Codersera](https://codersera.com/blog/qwen3-vl-4b-vs-qwen3-vl-8b-benchmarks-vram-guide/)
- vLLM users report that Qwen2.5-VL image preprocessing is often CPU-bound and adds seconds of latency before generation. — [vLLM forum](https://discuss.vllm.ai/t/why-is-inference-for-qwen-2-5-vl-so-slow-when-we-send-an-image/1438)
- llama.cpp multimodal runs via `llama-mtmd-cli` and `llama-server` (OpenAI-compatible). The mmproj file is loaded with `--mmproj` and offloaded to GPU by default (`--no-mmproj-offload` keeps it on CPU). Default quant for the pre-quantized ggml-org models is Q4_K_M. — [llama.cpp multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)
- Qwen3-VL and Qwen3VL-MoE support in llama.cpp came via PR #16780 (IMROPE, deepstack). Qwen published GGUFs from 2B to 235B. The merge was reported by secondary sites but not verified on GitHub here. — [llama.cpp PR #16780](https://github.com/ggml-org/llama.cpp/pull/16780); [toolnavs report](https://toolnavs.com/de/article/662-qwen-announces-qwen3-vl-is-now-available-on-llamacpp-with-gguf-weights-ranging-f)
- MiniCPM-V 4.5 runs on llama.cpp ≥ b6282 and vLLM ≥ v0.10.2. — [HF MiniCPM-V-4_5](https://huggingface.co/openbmb/MiniCPM-V-4_5)
- Qwen3.5 lists vLLM, SGLang, KTransformers and Transformers as serving options. — [HF Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B)
- Quantization (secondary source): Q4_K_M is estimated at a 3–5% accuracy drop on OCR-heavy tasks. Q8_0 is near-lossless. Q2_K is not recommended for vision. Vision models are described as more quant-sensitive. — [Codersera](https://codersera.com/blog/qwen3-vl-4b-vs-qwen3-vl-8b-benchmarks-vram-guide/) (the 3–5% figure has no cited measurement)

### Inferences
- On a 3060 12 GB (similar or slightly faster memory bandwidth than a 4060 8 GB), expect roughly the same 2–6 s per photo for a 4–8B Instruct model at Q4 in Ollama. A 3090 should be noticeably faster. This is extrapolation; no direct numbers were found.
- Use **Instruct / non-thinking** variants for interactive lookup. Thinking builds multiply latency (6.4 s vs 1.2 s caption in PhotoPrism's data). For Qwen3.5, `enable_thinking=False` must be set explicitly.
- CPU-only is usable only for background or batch enrichment (tens of seconds per image). For a CPU fallback, prefer a 1–2B model (minicpm-v4.6:1b, qwen3.5:2b, qwen3-vl:2b) or Florence-2.

### Gaps
- No measured numbers found for RTX 3060 12 GB, 4060 Ti 16 GB or 3090 24 GB specifically. No vLLM throughput numbers for these small VLMs.
- No measured quantization degradation (OCRBench at Q4 vs BF16) for Qwen3-VL or Qwen3.5 from a primary source.

## 6. Structured output (JSON) reliability for attribute extraction

### Takeaway
Evidence is thin. PhotoPrism saw zero malformed JSON from qwen2.5vl:7b on Ollama (32 requests) and from cloud models (192 requests), but published no per-model validity rates for the newer local models. One model (medgemma1.5:4b) returned valid but empty JSON every time, a reminder that schema-valid is not the same as useful. Constrained decoding (Ollama `format` JSON schema, llama.cpp grammars, vLLM guided decoding) should be used rather than relying on prompt-only JSON.

### Cited Findings
- qwen2.5vl:7b: zero errors across 32 requests on Ollama 0.32.6. The earlier "requires Ollama 0.7.0" caveat no longer seems to hold. — [PhotoPrism](https://docs.photoprism.app/developer-guide/vision/model-comparison/)
- Cloud models: 0 errors, 0 empty responses and 0 malformed JSON across 192 requests. medgemma1.5:4b returned well-formed JSON with an empty label array on every image. — [PhotoPrism](https://docs.photoprism.app/developer-guide/vision/model-comparison/)
- Qwen3-VL-4B Instruct is reported to lead the 8B on BFCL-v3 function calling (secondary source, no score given). — [Codersera](https://codersera.com/blog/qwen3-vl-4b-vs-qwen3-vl-8b-benchmarks-vram-guide/)
- Llama.cpp server uses the `--jinja` flag with Qwen3-VL in user reports (chat-template handling). — [llama.cpp PR #16780 thread](https://github.com/ggml-org/llama.cpp/pull/16780)

### Inferences
- With schema-constrained decoding, malformed JSON should be close to zero for any of these models. The real risk is *wrong but valid* fields: hallucinated values, or BMP280 read as BME280. Include an explicit `"unknown"` or null option and a confidence field in the schema, and store the raw transcribed marking text separately from the parsed value.
- Thinking-mode output (Qwen3.5 default) can interfere with JSON-only responses unless thinking is disabled or the reasoning is stripped.

### Gaps
- No per-model JSON-validity or field-accuracy measurements were found for Qwen3-VL, Qwen3.5, Gemma 4 or MiniCPM-V 4.5 with images.
- Interaction between Ollama's `format` (JSON schema) parameter and the vision models was not verified from documentation in this pass.
