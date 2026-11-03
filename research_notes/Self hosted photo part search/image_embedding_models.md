# Self-hostable image-embedding models for fine-grained photo-to-photo part retrieval (2025–2026)

Research date: 2026-11-03. About 18 tool calls. The strongest single evidence source is the ILIAS instance-level retrieval benchmark (CVPR 2025), whose public leaderboard now includes DINOv3, SigLIP 2 and Perception Encoder.

## 1. Current candidate models: versions, sizes, dims, resolution, licenses

### Takeaway
The strongest 2025-era self-hostable families are **DINOv3** (image-only, custom Meta license that allows commercial use), **SigLIP 2** (image and text, Apache-2.0 per Google's repos) and **Perception Encoder PE-Core** (image and text, Apache-2.0). OpenAI CLIP, OpenCLIP and EVA-CLIP are clearly older and weaker on instance retrieval. jina-clip-v2 is non-commercial. nomic-embed-vision-v1.5 is small and Apache-2.0. MobileCLIP2 is fast but ships under Apple's research license. A newer option is **SigLino** (TII, CVPR 2026), an Apache-2.0 student distilled from both DINOv3 and SigLIP2.

### Cited Findings
**DINOv3 (Meta, Aug 2025)**
- Released family: ViT-7B/16 trained from scratch (6,716M params, dim 4096), plus distilled ViT-S/16 (21M, dim 384), ViT-S+/16 (29M, 384), ViT-B/16 (86M, 768), ViT-L/16 (300M, 1024), ViT-H+/16 (840M, 1280), and ConvNeXt T/S/B/L (29M/50M/89M/198M). Satellite variants also exist. Patch size is 16, inputs should be multiples of 16, the example uses 224×224, and embeddings come from `pooler_output` (CLS). The card notes that the CLS token plus the average of patch tokens can also be used. — [HF model card facebook/dinov3-vitl16-pretrain-lvd1689m](https://huggingface.co/facebook/dinov3-vitl16-pretrain-lvd1689m)
- HF IDs follow the pattern `facebook/dinov3-vit{s,s+,b,l,h+,7b}16-pretrain-lvd1689m`. Confirmed IDs: `facebook/dinov3-vitl16-pretrain-lvd1689m`, `facebook/dinov3-vits16-pretrain-lvd1689m` and `facebook/dinov3-convnext-large-pretrain-lvd1689m`. Repos are gated and require accepting the license on HF. — [HF vitl16](https://huggingface.co/facebook/dinov3-vitl16-pretrain-lvd1689m), [HF vits16 README](https://huggingface.co/facebook/dinov3-vits16-pretrain-lvd1689m/blob/main/README.md), [HF convnext-large](https://huggingface.co/facebook/dinov3-convnext-large-pretrain-lvd1689m)
- Meta says DINOv3 training code and backbones are released "under a commercial license". — [Meta AI blog](https://ai.meta.com/blog/dinov3-self-supervised-vision-model/)
- DINOv3 License (Aug 14, 2025) terms:
  - It grants a worldwide, royalty-free right to use, modify and redistribute, with no non-commercial restriction and no user-count threshold.
  - Redistribution requires including the agreement and displaying "Built with DINOv3".
  - Prohibited uses include ITAR-controlled work, military or warfare, nuclear applications, espionage, and guns or illegal weapons.
  - The license terminates if you sue Meta over IP, and Meta may modify the terms.
  - Source: [DINOv3 License](https://ai.meta.com/resources/models-and-libraries/dinov3-license/)

**SigLIP 2 (Google, Feb 2025)**
- Four sizes: ViT-B (86M), L (303M), So400m (400M) and g (1B). The paper says SigLIP 2 outperforms SigLIP at all scales and markedly improves localization and dense features. It also includes variants that support multiple resolutions with native aspect ratio (NaFlex). — [arXiv 2502.14786](https://arxiv.org/abs/2502.14786)
- The NaFlex example checkpoint is `google/siglip2-base-patch16-naflex`, and its token budget is set by `max_num_patches` (default 256). A So400m NaFlex checkpoint (`siglip2-so400m-patch16-naflex`) is reported by a third party but not verified by me. — [Transformers SigLIP2 docs](https://huggingface.co/docs/transformers/model_doc/siglip2), [PromptLayer listing](https://promptlayer.com/models/siglip2-so400m-patch16-naflex)
- Fixed-resolution checkpoints exist at 224/256/384/512 (e.g., B@384, B@512, L@384, L@512), as evaluated on ILIAS. — [ILIAS page](https://vrg.fel.cvut.cz/ilias/)

**Perception Encoder, PE-Core (Meta, Apr 2025)**
- Sizes: B/16 @224, L/14 @336 (~0.32B vision tower, width 1024, depth 24) and G/14 @448 (~1.88B). L and B are distilled from G. The GitHub README also lists T/16 and S/16 @384. Zero-shot ImageNet scores are 83.5 for L14-336 and 85.4 for G. — [timm/PE-Core-L-14-336 card](https://huggingface.co/timm/PE-Core-L-14-336)
- License is Apache-2.0. HF IDs are `facebook/PE-Core-B16-224`, `facebook/PE-Core-L14-336` and the OpenCLIP/timm port `timm/PE-Core-L-14-336`. — [HF pe_core_base timm README (apache-2.0)](https://huggingface.co/facebook/pe_core_base_patch16_224_timm/blob/main/README.md), [Voxel51 zoo (Apache 2.0)](https://docs.voxel51.com/model_zoo/models/PE_Core_L14_336_Vision_Encoder.html), [HF facebook/PE-Core-L14-336](https://huggingface.co/facebook/PE-Core-L14-336)

**MobileCLIP2 (Apple, 2025)**
- Image/text params and Apple's latency figures (device context stated only for the S4 claim, iPhone 12 Pro Max):

  | Model | Image params | Text params | Image latency | Text latency |
  |---|---|---|---|---|
  | S0 | 11.4M | 63.4M | 1.5 ms | 3.3 ms |
  | S2 | 35.7M | 63.4M | 3.6 ms | 3.3 ms |
  | B | 86.3M | 63.4M | 10.4 ms | 3.3 ms |
  | S3 | 125.1M | 123.6M | 8.0 ms | 6.6 ms |
  | S4 | 321.6M | not given | 19.6 ms | not given |
  | L/14 | 304.3M | not given | 57.9 ms | not given |

  Apple claims S4 matches SigLIP-SO400M/14 with half the parameters. — [Apple MobileCLIP2 model cards (mirror)](https://huggingface-gw-kz.just-ai.com/apple/MobileCLIP2-S2)
- Official Apple HF repos use the **apple-amlr** license, a research license that is not OSI-approved. Community ONNX conversions labeled "MIT" conflict with this. — [apple/mobileclip2_coca README](https://huggingface.co/apple/mobileclip2_coca_dfn2b_s13b_context77/blob/main/README.md); conflicting label at [felixhrdyn/mobileclip2-s0-onnx](https://huggingface.co/felixhrdyn/mobileclip2-s0-onnx)
- A community INT8 ONNX build of S0 is about 105 MB and reports about 112 ms vision latency on CPU (unverified). — [felixhrdyn/mobileclip2-s0-onnx](https://huggingface.co/felixhrdyn/mobileclip2-s0-onnx)

**jina-clip-v2 (Jina, Dec 2024)**
- About 0.9B params: XLM-RoBERTa text encoder (561M) plus EVA02-L vision encoder (304M). Images are 512×512. Embeddings are Matryoshka, truncatable from 1024 down to 64 dims. It ships ONNX (`model.onnx`) and has supported Transformers.js since v3.1.0. — [HF jinaai/jina-clip-v2](https://huggingface.co/jinaai/jina-clip-v2)
- License is **CC BY-NC 4.0**, so it is non-commercial for local use. Commercial use requires Jina's API or cloud marketplaces. — [HF jinaai/jina-clip-v2](https://huggingface.co/jinaai/jina-clip-v2)

**nomic-embed-vision-v1.5 (Nomic, 2024)**
- 92.9M-param vision encoder, Apache-2.0, ONNX files available. It shares the embedding space of `nomic-embed-text-v1.5` (LiT-style, text tower locked). Reported scores: ImageNet 0-shot 71.0 vs OpenAI CLIP B/16 at 68.3, and DataComp avg 56.8. — [HF nomic-ai/nomic-embed-vision-v1.5](https://huggingface.co/nomic-ai/nomic-embed-vision-v1.5)
- Embedding dim is 768. — [Nomic docs](https://docs.nomic.ai/atlas/models/image-embedding), [Zilliz](https://zilliz.com/ai-models/nomic-embed-vision-v1.5)

**SigLino (TII, newcomer, paper Dec 23 2025, CVPR 2026)**
- `tiiuae/siglino-30M` is a dense 30M encoder (card lists 0.03B, safetensors 47.1M), Apache-2.0, distilled from **DINOv3 and SigLIP2** (AMoE paper, arXiv 2512.20157). It outputs summary and patch features from 'siglino' (384d), 'siglip2' (1152d) and 'dinov3' (1024d) heads. At 512px it reports kNN ImageNet 79.0, zero-shot ImageNet 65.1 and Flickr30K I→T R@1 82.2. Loading requires `trust_remote_code`, and no ONNX build was found. — [HF tiiuae/siglino-30M](https://huggingface.co/tiiuae/siglino-30M)

**Older families (pre-2025):** OpenAI CLIP, OpenCLIP (LAION/DataComp) and EVA-CLIP. ILIAS scores for these are in section 2.

### Inferences
- For a personal, $0 home-lab app, licenses are not a blocker for DINOv3, SigLIP 2, PE-Core, nomic or SigLino. jina-clip-v2 (NC) and MobileCLIP2 (apple-amlr) only matter if the app is ever commercialized or redistributed with weights. DINOv3 redistribution needs a "Built with DINOv3" notice.
- Sizes that fit 8–12 GB VRAM easily include every ViT-B/L variant: DINOv3-L, SigLIP2-L@384/512, So400m and PE-Core-L. In fp16 that is roughly 0.6–0.8 GB of weights for 300–400M params (my arithmetic: 2 bytes/param). Even ViT-H+ (840M) and SigLIP2-g (1B) fit.

### Gaps
- I found no authoritative per-image CPU or GPU latency benchmarks for DINOv3, SigLIP2 or PE on consumer hardware, apart from Apple's on-device MobileCLIP2 table. For a catalog of a few thousand images, latency mostly matters for the query path.
- I could not verify the exact list of official SigLIP2 NaFlex checkpoints or confirm DINOv3 ViT-S+/H+ HF IDs beyond the pattern.

## 2. Evidence for instance-level / fine-grained same-object retrieval: DINO vs CLIP/SigLIP

### Takeaway
On ILIAS, the most relevant modern benchmark (1,000 object instances, query photos vs positives under varied conditions), **DINOv3-L is the best frozen image-to-image model (26.5 mAP@1k at 100M distractors)**, ahead of PE-L@336 (22.0), SigLIP2-L@512 (20.8) and DINOv2-L (15.3). With a cheap learned linear adaptation, **PE-L@336 (33.4) and SigLIP2-L@512 (31.3) overtake DINOv3-L (28.3)**. The older folk wisdom that "DINO beats CLIP for same-object retrieval" holds against old CLIP/OpenCLIP and against SigLIP at small sizes. DINOv2 is no longer better than SigLIP/SigLIP2-L at instance retrieval. DINOv3 is.

### Cited Findings
- ILIAS: 1,000 object instances, 1,232 query images, 4,715 positives, 1,000 text queries, plus 100M YFCC100M distractors. Objects postdate 2014 to avoid false negatives. Key findings:
  - Domain-specific fine-tuned models (landmarks, products) do well in-domain but fail on ILIAS.
  - Linear adaptation with multi-domain supervision helps, especially for vision-language models.
  - Local-descriptor re-ranking remains important, especially with cluttered backgrounds.
  - VLM text-to-image performance is "surprisingly close" to image-to-image.
  - Sources: [arXiv 2502.11748](https://arxiv.org/abs/2502.11748), [CVPR 2025 paper](https://openaccess.thecvf.com/content/CVPR2025/papers/Kordopatis-Zilos_ILIAS_Instance-Level_Image_retrieval_At_Scale_CVPR_2025_paper.pdf)
- ILIAS leaderboard, mAP@1k. Values are mini-ILIAS (5M) / full 100M; adapted = linear layer trained on UnED over a frozen backbone. — [ILIAS project page](https://vrg.fel.cvut.cz/ilias/)

  | Model | I2I frozen | I2I adapted | T2I |
  |---|---|---|---|
  | DINOv2-B | 14.3 / 11.5 | 15.0 / 12.1 | — |
  | DINOv2-L | 18.5 / 15.3 | 18.8 / 15.3 | — |
  | DINOv3-B | 26.4 / 22.0 | 26.4 / 22.5 | — |
  | **DINOv3-L** | **31.1 / 26.5** | 32.9 / 28.3 | — |
  | SigLIP-L@384 | 24.2 / 19.6 | 34.3 / 28.9 | 22.2 / 18.1 |
  | SigLIP2-B@384 | 18.4 / 15.0 | 27.5 / 22.6 | 15.1 / 11.1 |
  | SigLIP2-B@512 | 18.6 / 15.4 | 28.6 / 23.5 | 14.6 / 10.4 |
  | SigLIP2-L@384 | 24.6 / 19.9 | 36.3 / 30.3 | 23.7 / 18.6 |
  | SigLIP2-L@512 | 25.3 / 20.8 | 37.3 / 31.3 | **24.7 / 19.8** (best T2I) |
  | PE-B | 20.2 / 9.7 (likely a typo on the page) | 20.2 / 16.1 | 7.9 / 5.5 |
  | **PE-L@336** | 27.1 / 22.0 | **39.6 / 33.4** (best adapted) | 19.5 / 14.6 |
  | OpenCLIP-ViT-L | 11.8 / 9.4 | 17.5 / 13.7 | 9.4 / 7.0 |
  | OpenCLIP-ConvNeXt-L@320 | 12.7 / 9.6 | 22.9 / 18.3 | 11.5 / 8.1 |
  | EVA-CLIP-L@336 | 13.6 / 10.9 | 20.9 / 16.0 | 10.6 / 7.2 |
  | EVA-MIM-L | 1.5–6.1 (100M) | — | — |

- Resolution matters for SigLIP-family on instance retrieval: SigLIP-L goes from 15.2 at 256px to 19.6 at 384px (frozen, 100M). — [ILIAS page](https://vrg.fel.cvut.cz/ilias/)
- Older and other-domain evidence favoring DINOv2 over OpenAI CLIP:
  - CAD UI frames, 400 queries: DINOv2 mean rank 2.21 / median 1 vs CLIP 18.24 / 6. — [VideoCAD, arXiv 2505.24838](https://arxiv.org/pdf/2505.24838)
  - DISC21 copy detection blog test: DINOv2 about 64% vs CLIP 28.45% (older blog, Chinese). — [Aliyun blog](https://developer.aliyun.com/article/1408208)
- An HF Space compares `openai/clip-vit-base-patch32` vs `facebook/dinov2-base` (mean-pooled last hidden state) for similarity search. — [HF Space CLIPvsDINOv2](https://huggingface.co/spaces/YagmurCA/CLIPvsDINOv2/blob/main/app.py)

### Inferences
- For "which catalog item is this exact part", **DINOv3-B/L frozen** is the best zero-training choice. DINOv3-B (86M) at 22.0 already beats SigLIP2-L@512 frozen (20.8) and DINOv2-L (15.3).
- **SigLIP2-L@384/512 or PE-Core-L** are nearly as good frozen and can do text as well. With a tiny learned linear projection they become the best, but that needs labeled pairs; ILIAS used the UnED dataset, which is not a user's own data.
- ILIAS objects are distinctive (landmarks, artworks, products). Electronic parts are more uniform, so absolute accuracy will be lower and inter-class confusion higher (see section 5). The ranking of families likely transfers; absolute numbers do not.

### Gaps
- I found no published benchmark on electronic components or hardware fasteners specifically.
- I did not obtain Stanford Online Products, iNaturalist or GLDv2 numbers for DINOv3 vs SigLIP2 in this pass. The DINOv3 HF card lists no Oxford/Paris/Met numbers; the DINOv3 paper (arXiv 2508.10104) reportedly has instance-recognition tables, but I did not verify them.

## 3. Text↔image capability and hybrid DINO + SigLIP

### Takeaway
DINOv2/DINOv3 have no text tower. SigLIP/SigLIP2, PE-Core, CLIP/OpenCLIP, MobileCLIP2, jina-clip-v2 and nomic (image paired with nomic-embed-text) support typed queries. Running two embeddings, DINO for image→image and SigLIP2/PE for text→image, is a reasonable and increasingly common pattern. SigLino goes further by distilling both teachers into one 30M model that outputs both heads.

### Cited Findings
- On ILIAS, the best text→image model is SigLIP2-L@512 (19.8 mAP@1k at 100M), close to frozen image→image for the same model (20.8). — [ILIAS page](https://vrg.fel.cvut.cz/ilias/)
- DINO entries on ILIAS have no T2I score because DINO lacks a text encoder. — [ILIAS page](https://vrg.fel.cvut.cz/ilias/)
- nomic-embed-vision-v1.5 shares the embedding space of nomic-embed-text-v1.5, so one text model serves both text-to-text and text-to-image search. — [HF nomic-embed-vision-v1.5](https://huggingface.co/nomic-ai/nomic-embed-vision-v1.5)
- Research combining DINO with language exists:
  - "Talking to DINO" learns a mapping from CLIP text space into DINOv2 features (open-vocabulary segmentation). — [arXiv 2411.19331](https://arxiv.org/pdf/2411.19331)
  - SigLino distills SigLIP2 and DINOv3 into one encoder with per-teacher heads and reports zero-shot ImageNet 65.1. — [HF tiiuae/siglino-30M](https://huggingface.co/tiiuae/siglino-30M)

### Inferences
- A practical design for the app:
  1. Store a DINOv3 image vector for photo-to-photo search.
  2. Store a SigLIP2 (or PE-Core) image vector for text→image search.
  3. Store a text embedding of name, category and attributes for lexical/semantic matching.
  4. Fuse rankings, e.g., reciprocal rank fusion.
- A single-model alternative: SigLIP2-L@384 handles both tasks reasonably and simplifies serving.
- Typed queries like "100uF electrolytic capacitor" will likely match better against the **item text** (name, attributes) than against photos. The value "100uF" is printed text that vision encoders handle poorly, so text→image is mainly useful for coarse category.

### Gaps
- I found no published head-to-head of "DINO image + SigLIP text" fusion vs single-model retrieval on a product dataset.

## 4. Techniques that improve small-catalog retrieval

### Takeaway
The best-supported levers:
- Higher input resolution.
- Isolating the object with a crop or background removal, which is especially important when backgrounds are cluttered.
- Local-feature re-ranking of the top-K, which gives the largest gains on ILIAS.
- A light learned adaptation, i.e., a linear head.

Multi-crop indexing and user-photo enrollment (adding query photos as extra references) are cheap engineering wins, but I found no part-specific benchmarks for them.

### Cited Findings
- Re-ranking on ILIAS (100M, mAP@1k):
  - Learned local re-ranker AMES on adapted SigLIP-L@384 global features: **38.9**, vs 28.9 global-only.
  - AMES with SigLIP2-L@512 (adapted), top-1k: 38.4, with oracle 62.7.
  - Spatial verification (SP) on top of adapted SigLIP: 30.5. Chamfer similarity (CS): 32.5.
  - Query expansion αQE1: 33.7, but it degrades with larger k (αQE5: 23.5).
  - Source: [ILIAS page](https://vrg.fel.cvut.cz/ilias/)
- The ILIAS authors conclude local descriptors remain important for re-ranking, especially with heavy background clutter. — [arXiv 2502.11748](https://arxiv.org/abs/2502.11748)
- "Patchify" (Dec 2025) splits database images into a few structured patches and compares their features with the global query descriptor. It needs no fine-tuning, reportedly outperforms global methods, and complements reranking. It introduces LocScore. On mini-ILIAS, global SigLIP scored 0.2041 vs 0.3386 for linear-adapted SigLIP. — [arXiv 2512.12610](https://arxiv.org/abs/2512.12610), [PDF](https://arxiv.org/pdf/2512.12610)
- Linear adaptation raises SigLIP-L@384 from 19.6 to 28.9 and PE-L from 22.0 to 33.4, but barely moves DINOv3-L (26.5 to 28.3) or DINOv2-L (15.3 to 15.3). — [ILIAS page](https://vrg.fel.cvut.cz/ilias/)
- Background removal: BiRefNet is a high-resolution foreground segmentation model (221M params, MIT, arXiv 2401.03407). A vendor recommends using its masks to crop the object or strip the background before visual embedding (vendor guidance, not a benchmark). BRIA RMBG-2.0 is built on BiRefNet. — [Mixpeek BiRefNet page](https://mixpeek.com/model/ZhengPeng7/BiRefNet), [BRIA RMBG v2.0](https://bria.ai/introducing-the-rmbg-v2-0-model-the-next-generation-in-background-removal-from-images)

### Inferences
- For a catalog of hundreds to thousands of items, brute-force cosine over all vectors in SQLite/JS is trivial, e.g., 3,000 × 1024 floats. The pipeline can therefore afford expensive steps:
  1. Background-remove or crop both catalog and query photos with the same pipeline.
  2. Embed at higher resolution (384–512 for SigLIP2; 448+ for DINOv3, multiples of 16).
  3. Index several views per item: full, tight crop, rotations/flips, since small parts have no canonical orientation. Score each item by max similarity over its views.
  4. Re-rank the top 10–20 with a local matcher, e.g., SuperPoint+LightGlue inlier count, to confirm near-duplicates. This is my inference from the ILIAS spatial-verification results; I did not fetch LightGlue sources.
- "Enrollment": each confirmed query photo can be added as another reference vector for that item. With about one photo per item, this probably beats any fine-tuning. A linear head (as in ILIAS) could later be trained on accumulated (query, item) pairs; the ILIAS gains suggest it helps SigLIP/PE far more than DINOv3.
- The 1600px phone JPEGs are much larger than model input. Downscaling a whole frame to 224px destroys small-part detail, so cropping to the object before resizing matters more than model choice.

### Gaps
- I found no measured gains from rembg/BiRefNet before embedding on a retrieval benchmark.
- I did not fetch the SuperPoint/LightGlue or LoFTR papers or licenses. SuperPoint's original weights are known to carry a non-commercial license (unverified here). DISK/ALIKED+LightGlue are commonly cited alternatives.
- I found no evidence on test-time augmentation gains for these models.

## 5. Known failure modes

### Takeaway
Global embeddings capture shape, color and texture. They are weak at distinguishing items that differ only in printed text (capacitor or IC markings) or small color bands (resistor values). Embedding search should be treated as a **candidate generator for the right category or form factor**, with item attributes, OCR or the user making the final call among near-identical variants.

### Cited Findings
- ILIAS reports clutter and background as a major difficulty, with local re-ranking helping most there. Its best adapted global model scores only about 33 mAP@1k at 100M distractors, so the benchmark is "far from saturated". — [arXiv 2502.11748](https://arxiv.org/abs/2502.11748), [ILIAS page](https://vrg.fel.cvut.cz/ilias/)
- Domain-specialized fine-tuned models generalize poorly outside their domain on ILIAS. Fine-tuning on a generic product dataset therefore will not necessarily help parts. — [arXiv 2502.11748](https://arxiv.org/abs/2502.11748)
- The low-resolution input of most models (224–512px) limits detail. Resolution gains on ILIAS confirm sensitivity to detail. — [ILIAS page](https://vrg.fel.cvut.cz/ilias/)

### Inferences
- Resistors: color-band value differences are tiny, lighting-dependent hue shifts at 224–512px. Expect retrieval to return "a resistor" but not the right value. A dedicated color-band reader or user confirmation is needed.
- Capacitors, ICs and modules: the value or part number is printed text. An OCR step (e.g., PaddleOCR/Tesseract or a VLM) matched against item attributes would disambiguate better than any embedding.
- Screws and fasteners: scale is ambiguous in photos (M3 vs M4, length). A reference object or user input is needed.
- Lighting and background mismatch between catalog shots and query shots is mitigated by applying background removal and color normalization to both sides.

### Gaps
- I found no studies quantifying embedding confusion among electronic component variants.

## 6. Serving from Node: ONNX, transformers.js, Infinity, TEI, Ollama

### Takeaway
**Transformers.js (`@huggingface/transformers`) in Node** can run DINOv2/DINOv3 (DINOv3 since v3.7.2), SigLIP v1 (Xenova repos), jina-clip-v2 and likely nomic-vision via ONNX, with no Python. **Infinity** (Python) serves CLIP/SigLIP image and text embeddings over REST on GPU. Ollama has no confirmed image-embedding support. SigLIP2 and PE-Core lack official onnx-community builds. SigLIP2 has community ONNX conversions; PE would need Python (open_clip/timm) or self-export.

### Cited Findings
- Transformers.js v3.7.2 added DINOv3. Its example runs the `image-feature-extraction` pipeline on `onnx-community/dinov3-vits16-pretrain-lvd1689m-ONNX`. `onnx-community/dinov3-vitl16-pretrain-lvd1689m-ONNX` also exists. — [release notes via releases.sh](https://releases.sh/release/rel_30Ii2uc5q8brdSu1a47a5), [Mixpeek listing vitl16 ONNX](https://mixpeek.com/model/onnx-community/dinov3-vitl16-pretrain-lvd1689m-ONNX), [vits16 ONNX](https://mixpeek.com/model/onnx-community/dinov3-vits16-pretrain-lvd1689m-ONNX)
- DINOv2 ONNX for Transformers.js: `Xenova/dinov2-base` and `onnx-community/dinov2-with-registers-small`. — [HF Xenova/dinov2-base](https://huggingface.co/Xenova/dinov2-base/commits/208ae4a85a762158465640e01f3406e210938f6a/onnx), [HF onnx-community/dinov2-with-registers-small](https://huggingface.co/onnx-community/dinov2-with-registers-small/commits/main/.gitattributes)
- SigLIP v1 ONNX for Transformers.js: `Xenova/siglip-base-patch16-224`, `Xenova/siglip-base-patch16-256` and `Xenova/siglip-large-patch16-256`. — [HF Xenova/siglip-base-patch16-224](https://huggingface.co/Xenova/siglip-base-patch16-224/blame/main/README.md), [Xenova/siglip-large-patch16-256](https://huggingface.co/Xenova/siglip-large-patch16-256/commits/main/onnx)
- SigLIP2 ONNX is community-only, e.g., `SkyStar-tech/siglip2-large-patch16-384-ONNX` with a Transformers.js zero-shot snippet (unverified). — [HF SkyStar-tech/siglip2-large-patch16-384-ONNX](https://huggingface.co/SkyStar-tech/siglip2-large-patch16-384-ONNX/discussions)
- jina-clip-v2 has an ONNX model and Transformers.js support since v3.1.0. — [HF jinaai/jina-clip-v2](https://huggingface.co/jinaai/jina-clip-v2)
- nomic-embed-vision-v1.5 is tagged ONNX on HF. — [HF nomic-ai/nomic-embed-vision-v1.5](https://huggingface.co/nomic-ai/nomic-embed-vision-v1.5)
- Infinity is a REST server for text embeddings, rerankers, CLIP, CLAP and ColPali. It supports models whose config is `ClipModel`/`SiglipModel` (examples: `jinaai/jina-clip-v1`, `google/siglip-so400m-patch14-384`) and exposes an image-embed call. — [GitHub michaelfeil/infinity](https://github.com/michaelfeil/infinity)
- Ollama: image-embedding support is still an open feature request (ollama/ollama#5304, #7699, referenced from an ImageBind issue). I did not verify current status. — [ImageBind issue #128](https://github.com/facebookresearch/ImageBind/issues/128)
- PE-Core loads via Meta's `perception_models` package (`pe.CLIP.from_config("PE-Core-L14-336", pretrained=True)`) or OpenCLIP/timm (`timm/PE-Core-L-14-336`). — [HF facebook/PE-Core-L14-336](https://huggingface.co/facebook/PE-Core-L14-336), [timm card](https://huggingface.co/timm/PE-Core-L-14-336)
- SigLino requires Python `trust_remote_code`. — [HF tiiuae/siglino-30M](https://huggingface.co/tiiuae/siglino-30M)

### Inferences
- Simplest all-Node path: `@huggingface/transformers` with `onnxruntime-node` (CPU), or onnxruntime-node with the CUDA EP. DINOv3 (onnx-community ONNX) handles photo↔photo; SigLIP (Xenova) or community SigLIP2 ONNX handles text↔image.
- Higher-accuracy path: a small Python sidecar (FastAPI or Infinity) on the GPU for SigLIP2-L/PE-Core-L, called from Node over HTTP.
- HF TEI is text-focused. I found no evidence it serves image embeddings.

### Gaps
- I did not confirm whether Infinity supports DINOv2/DINOv3 (non-CLIP) image models. Its README frames image support around CLIP/SigLIP configs.
- I did not confirm TEI image support or current Ollama status.
- I found no measured Node/onnxruntime CPU latency for DINOv3-B/L or SigLIP2-B/L.
