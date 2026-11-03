# Recognizing electronic components and hardware from photos: prior art, hard cases, hybrid pipeline design and evaluation (2025–2026)

Scope: domain specifics, pipeline design and evaluation for a self-hosted, $0 garage/electronics inventory (hundreds to low thousands of items, about one phone photo each, plus text fields). Model specs and serving infrastructure are covered by other researchers. Research date: 2026-11-03. The budget was about 18 tool calls, so the coverage is broad but not exhaustive. Gaps are listed explicitly.

## 1. Prior art: tools, projects, datasets, papers, inventory apps with photo/AI features

### Takeaway
No existing self-hosted tool does photo-to-match retrieval against a personal parts catalog. The prior art splits three ways. (a) Generic component-class classifiers and detection datasets, which report high accuracy on clean academic data. (b) Single-purpose phone apps: resistor readers and screw identifiers, with unverified marketing claims. (c) Inventory add-ons that use cloud or local VLMs to catalog new items from photos, not to retrieve existing ones. The retrieval-against-your-own-catalog use case is essentially unbuilt, so this design would be novel. It can borrow patterns from e-commerce visual search.

### Cited Findings
**Inventory apps and add-ons**
- InvenTree supports part images uploaded from the web UI, API or mobile app camera, with auto-generated thumbnails. I found no first-party or plugin AI/photo-recognition feature. InvenTree is extensible through plugins, so a custom plugin is possible. — [InvenTree docs (part)](https://git.invenhost.com/inventree/InvenTree/src/commit/26b5f0ae4c37e558054323d5265dc1117a0bf4b2/docs/docs/part/index.md)
- Homebox has no native AI feature in the results I found. The community add-on **Homebox Companion** (Duelion, GPL-3.0, Docker image `ghcr.io/duelion/homebox-companion`) uses an LLM to analyze photos and "identify items, quantities, and relevant metadata". Users review and edit the suggestions, or ask the AI for corrections, before submitting. It supports multi-image analysis and a single-item mode for kits. It requires an API key for OpenAI, Anthropic, Google or OpenRouter via LiteLLM, so it is **cloud-dependent by default**. The project estimates about $0.30 per 100 items with gpt-5-mini. — [AlternativeTo listing](https://alternativeto.net/software/homebox-companion/about); [SourcePulse summary](https://www.sourcepulse.org/projects/26457708); [BrightCoding write-up](https://prompts.brightcoding.dev/blog/stop-manually-cataloging-inventory-use-homebox-companion-instead)
- A Chinese NAS write-up says Homebox Companion does not yet support the Item entity type introduced after Homebox v0.26. This is a secondary source and may be dated. — [smzdm post](https://post.smzdm.com/p/axkgro74/)
- **Homebox AI Frontend** (mab122) is a small, mobile-first web app that adds items to Homebox using image analysis through **Ollama with a local vision model**. It is fully self-hostable. — [git.hswro.org README](https://git.hswro.org/mab122/homebox_ai_fronted/raw/branch/master/README.md)
- **m-esm/my-inventory** is a photo-driven small-parts inventory (electronics, fasteners) in one stdlib-only Python file, with an MCP server. Photos are "the fastest honest record of 'what is actually in this bag'". Names and specs are optional metadata filled in by hand or by an LLM agent. It **deliberately has no search tool**: "Keyword search made agents conclude a part was missing when it was there under another name". Instead the agent lists all items, a few hundred compact rows, and picks from the list. It reports no accuracy figures. — [GitHub m-esm/my-inventory](https://github.com/m-esm/my-inventory)
- Part-DB, PartKeepr, Snipe-IT, Grocy and Shelf: my searches found **no AI or photo-recognition features or issue discussions** (see Gaps).

**Generic CLIP photo search projects (not domain-specific)**
- Prot420/clip-image-search runs local CLIP through ONNX with SQLite and a folder watcher, and is aimed at product catalogs. PcubeP/clip-photo-search runs CLIP ViT-B/32 fully in the browser. Its README says ViT-B/32 is "great for scenes, objects, colors, and moods", which hints that it is weaker on fine-grained small parts. — [Prot420/clip-image-search](https://github.com/Prot420/clip-image-search); [PcubeP/clip-photo-search](https://github.com/PcubeP/clip-photo-search)
- Roboflow has a tutorial on CLIP semantic image search (compute embeddings, return top matches). — [Roboflow blog](https://blog.roboflow.com/clip-semantic-search/)

**Datasets**
- Roboflow Universe hosts many CC BY 4.0 electronic component datasets. Most are **object-detection** sets (bounding boxes), not retrieval sets. Examples: ElectronicComponents (2,331 images), "Electronics components" (resistors, capacitors, LEDs), "Components" (includes ICs), and 8class_final (YOLO, 8 classes). — [ElectronicComponents](https://universe.roboflow.com/myworkspace-ojkpt/electroniccomponents-hqw5f); [Electronics components](https://universe.roboflow.com/yolo-sp7n8/electronics-components-xhj2i); [Components](https://universe.roboflow.com/carddata-3mujr/components-xvceq); [8class_final](https://universe.roboflow.com/electronic-components-dataset-for-yolo/8class_final/dataset/); [Electronic Component Recognition (classification)](https://universe.roboflow.com/soumits-workspace/electronic-component-recognition-sk4ef)
- FICS-PCB: 9,912 images from 31 PCBs, six classes (IC, capacitor, resistor and others). It is heavily imbalanced toward capacitors and resistors. The best models exceed 97% accuracy. — [arXiv 2506.19330 (survey/related)](https://web3.arxiv.org/pdf/2506.19330)

**Papers (component-class classification)**
- DeepTronic (2018): Inception-v3 reached 94.64% validation accuracy on 6 classes (resistor, capacitor, IC and others). This is older work. — [DeepTronic, DLSU](https://animorepository.dlsu.edu.ph/faculty_research/3025)
- Kastamonu group: claims over 99% accuracy with EfficientNet, InceptionV3, MobileNet and ViT. A citing paper reports ResNet at 99.97% on 4,038 images. **I could not confirm these from the primary paper.** — [Kastamonu abstract](https://unis.kastamonu.edu.tr/yayin-detay/2_D3OnC3K_1/classification-of-electronics-components-using-deep-learning)
- A Faster R-CNN detection project (TARC) reached only 61.5% mAP single-class and 53.71% mAP@0.75 combined, on small data. — [TARC eprint](https://eprints.tarc.edu.my/14257)
- A ViT study reported 98.4% on 4,170 images of 5 component types, as cited in a MobileNetV2 IC-sorting paper. — [IIETA PDF](https://www.iieta.org/download/file/fid/193628)

**IC marking OCR**
- Pre-VLM work on IC marking used classical machine-vision OCR (2005 and 2008 theses). I found **no paper benchmarking VLMs on IC/component top-markings**. General VLM OCR benchmarks exist: OCRBench (1,000 QA pairs), and OCR-Robust (arXiv 2606.26041, June 2026, 812 samples, 18 VLMs under 5 perturbation types). — [IC marking classification (UTM)](https://libmast.utm.my/Record/utm.eprints-1860); [OCR-Robust arXiv 2606.26041](https://arxiv.org/abs/2606.26041)

**SMD code lookup**
- The open-source Component Marking Decoder (TheMakersWorkbench, on GitHub) covers resistors, capacitors, inductors and semiconductors. — [MakersWorkbench wiki](https://github.com/MakersWorkbench/component-marking-decoder/wiki/Home)
- A 2022 EEVblog thread asked for an open SMD markings DB. There is no evidence one was built. Large SMD code databases (smdok.com; Turuta databook with 235,000 codes) are **proprietary**. — [EEVblog thread](https://www.eevblog.com/forum/chat/open-smd-markings-db); [EDAboard/smdok](https://www.edaboard.com/threads/smd-marking-code-25m2.176023/?amp=1)

### Inferences
- The academic accuracies (94–99.9%) are for **coarse class** recognition ("is this a resistor or a capacitor") on clean, balanced datasets. They say little about the real task here, which is **instance retrieval**: "which of my 2,000 items is this?" The category is the easy part. Telling apart siblings within a category is the hard part.
- The closest working pattern in the wild is the Homebox Companion / Homebox AI Frontend style: a VLM describes the photo, a human confirms. This supports a "VLM extracts attributes → human confirms" flow over fully automatic matching.
- The my-inventory lesson, that keyword search misses synonyms, argues for hybrid retrieval (embeddings plus FTS), and for letting a VLM rerank over a shortlist rather than trusting FTS alone. At a scale of a few hundred items, "dump the whole catalog to an LLM" is even viable for text-only reasoning.

### Gaps
- I did not find Part-DB, PartKeepr, Snipe-IT, Grocy or Shelf issues or discussions on AI image search. A direct GitHub issues search on those repos ("image search", "AI", "photo recognition") would be needed to confirm none exist.
- No published accuracy figures for Homebox Companion or Homebox AI Frontend.
- No Kaggle-specific datasets were reviewed.

## 2. Hard cases: resistor bands, tiny printed values and IC markings, near-identical parts, screws

### Takeaway
Reading resistor color bands from a phone photo is **unreliable**, for both classical CV apps and frontier VLMs (documented failures as of January 2026). Tiny printed values and laser-etched IC markings are readable only with macro, well-lit, in-focus photos. There is no component-marking VLM benchmark. Screw thread and length cannot be determined from a single uncalibrated photo. Every app that tries uses a reference object (coin or ruler) plus calibration, and vendors still recommend calipers or gauges. The realistic plan: use the photo to narrow down **category and form factor**, and get **values** from text (user-typed markings, a VLM-OCR'd marking from a macro shot, or a multimeter/caliper reading).

### Cited Findings
**Resistor color bands**
- EEVblog thread (January 2026): a user tested ChatGPT, Grok and Google AI on the same resistor photo. "They all failed", with answers of 11 MΩ, 10 MΩ and 82 Ω, all wrong. Another user said the AI responses "miss ID'd the colour bands in all cases". The person who suggested AI said "Confidence was high too". Gemini counted five bands correctly but got the colors wrong. Copilot gave the correct value only after the human supplied the band colors as text. Even two human readers disagreed on one band (fifth band vs multiplier). — [EEVblog forum](https://www.eevblog.com/forum/repair/resistor-help-colorblind-need-help-reading-resistor-color/)
- In the same thread, one model suggested a band "might actually be a gold tolerance band that has discolored or appears silver due to lighting". This shows that lighting-dependent gold/silver confusion is a known failure. — [EEVblog forum](https://www.eevblog.com/forum/repair/resistor-help-colorblind-need-help-reading-resistor-color/)
- An academic Android OpenCV/HSV resistor reader reported 66.7–100% color detection for 4-band resistors, but only **25–75% for 5-band**. Its best results needed controlled lighting, fixed distance, and a tripod with a softbox. — [Telkom University thesis abstract](https://openlibrary.telkomuniversity.ac.id/pustaka/files/154041/abstract/aplikasi-android-pembaca-nilai-resistor-menggunakan-opencv.pdf)
- Res-Dec (2012, older) was an Android automatic 4-band decoder with no clear accuracy figure. — [SACNAS 2012](https://sacnas.confex.com/sacnas/2012/webprogram/Paper7496.html)
- The commercial iOS "AI Resistor Color Code Scanner" claims accurate detection but includes a screen for **users to correct the detected bands**. That implies frequent errors, and no independent tests exist. — [mwm.ai listing](https://mwm.ai/apps/ai-resistor-color-code-scanner/6748325846)
- Reading direction matters: the tolerance band sits apart, so you read from the end where the bands bunch up. — [Snubber.ai calculator](https://snubber.ai/calculators/resistor-color-code-calculator)

**Screws and fasteners**
- "Screw Identifier – Bolt Size" (iOS) uses a coin or ruler as reference with automatic scale calibration. It is rated 3.59/5 from 17 ratings. "Bolt Thread Identifier" (iOS 26+) measures pitch from a photo plus distance calibration. — [Screw Identifier](https://apps.apple.com/us/app/id6759244718); [Bolt Thread Identifier](https://apps.apple.com/us/app/id6468966021)
- Patent US10810755 claims a method that captures a standard reference object alongside the fastener and compares dimensions against a database to compute thread size and diameter. — [Google Patents US10810755](https://patents.google.com/patent/US10810755)
- The physical alternative is reference plates with labeled holes (McMaster-Carr thread-size identifiers), thread pitch gauges, and calipers. An AI screw-identifier vendor itself says "for exact measurements, we recommend using calipers or a screw gauge". — [McMaster-Carr thread size identifiers](https://www.mcmaster.com/products/thread-size-identifiers/system-of-measurement~inch/); [Magica AI screw identifier](https://magica.com/features/ai-screw-identifier)

### Inferences
- **Realistically achievable from a single photo:** coarse category (resistor, ceramic cap, electrolytic, IC in DIP/SOIC/QFP, dev board, connector family, screw head type and drive, washer or nut). For dev boards and modules, **specific identity** is often possible because boards carry silkscreen text, distinctive layouts and logos (Arduino Nano, ESP32 DevKit, buck modules). Matching against the user's own photo of the same item is strong here, because instance retrieval of a visually distinctive object is easy for modern embeddings.
- **Partially achievable:** electrolytic capacitor values, since they are printed in large text on the sleeve. A VLM can OCR them from a decent photo. IC part numbers need a macro, sharp, glare-free shot. Even then, laser-etched low-contrast markings are a risk (no benchmark found).
- **Not reliably achievable:** resistor values from color bands, MLCC/SMD capacitor values (usually unmarked), screw thread pitch or length without a reference, and two same-package parts with different values that the camera cannot resolve.
- **Design consequence:** for categories where value is not visually resolvable (resistors, small caps, screws), the system should match to the category or bin, and then **ask** a cheap clarifying question: "Measure it: what does the multimeter say?", "What's printed on it?", or "Lay it on the 1 cm grid mat". The answer feeds the attribute filter. Showing the VLM's band reading as a "suggestion to verify" is acceptable. Auto-accepting it is not.
- **A cheap screw trick:** a printed reference mat (mm grid or a known-size square, or the McMaster-style hole plate) in the capture flow makes length and diameter estimation tractable. Pitch is still unreliable without a gauge.

### Gaps
- No systematic benchmark of 2025–2026 VLMs (open or closed) on resistor band reading, SMD codes or IC top-markings. The EEVblog evidence is anecdotal (n of about 1–3 resistors). The user's own eval set should include this (see section 5).
- No data on small open VLMs (the sizes that fit 8–12 GB) reading component markings.

## 3. Hybrid retrieval design patterns (shortlist, rerank, attributes, fusion, clarifying questions, multi-view, feedback)

### Takeaway
The proven industrial pattern (eBay, Pinterest): **predict category, retrieve a candidate set by visual similarity, rerank by attributes or aspects**. For a catalog of 2,000 items or fewer, a practical $0 version runs three steps. (1) An image-embedding kNN over all item photos, plus FTS over text fields fed by VLM-extracted attributes/OCR, fused with RRF (k=60). (2) Optional category or attribute filters when the extraction is confident. (3) A VLM rerank or verification of the top ~10–20, comparing the query photo to candidate photos and text. Ask a clarifying question when the top scores are close or when the category is "value-not-visible". Store confirmed query photos as extra reference images for that item.

### Cited Findings
- **eBay visual search (KDD 2017):** the query image's top predicted categories and a binary hash are matched against the live index to form an initial recall set. That set is then "further refined by aspect-based re-ranking". This is the same category + embedding + attribute rerank structure proposed here. — [Visual Search at eBay, arXiv 1706.03154](https://arxiv.org/abs/1706.03154)
- **Pinterest:** "Visual Search at Pinterest" and "Visual Discovery at Pinterest" describe the production visual search engines. "Shop The Look" evaluates through offline metrics, **human relevance judgments**, and online A/B tests. It reports more than 160% cumulative relative gain in human relevance judgments. — [arXiv 1505.07647](https://arxiv.org/pdf/1505.07647); [arXiv 1702.04680](https://ar5iv.labs.arxiv.org/html/1702.04680); [Shop The Look, arXiv 2006.10866](https://arxiv.org/pdf/2006.10866)
- **Bing visual search** paper on web-scale responsive visual search (pipeline reference for latency-aware cascades). — [arXiv 1802.04914](https://arxiv.org/pdf/1802.04914)
- **RRF:** score(d) = Σ 1/(k + rank_r(d)). k=60 was "fixed during a pilot investigation and not altered during subsequent validation". RRF outperformed Condorcet and individual learning-to-rank methods. It uses ranks only, so no score normalization is needed between BM25 and cosine scores. — [Cormack, Clarke & Büttcher, SIGIR 2009](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
- A secondary source says k=60 was near-optimal but "the choice is not critical". LanceDB uses RRF as its default reranker for hybrid search, with k configurable (default 60). — [BigData Boutique](https://bigdataboutique.com/blog/reciprocal-rank-fusion-how-it-works-and-when-to-use-it); [LanceDB RRF docs](https://docs.lancedb.com/reranking/rrf.md)
- **Hybrid matching in product retrieval:** PRISM (2025) combines retrieval with finer matching for product retrieval in shopping carts. It segments the product first, because "many false matches occur in background regions if the segmentation step is not applied". — [PRISM, arXiv 2509.14985](https://arxiv.org/pdf/2509.14985)
- **V²L (large-scale product retrieval):** combines vision models with vision-language models for product retrieval. This supports fusing visual and VL/text signals. — [V²L, arXiv 2207.12994](https://arxiv.org/pdf/2207.12994)
- **Human-in-the-loop correction:** Homebox Companion's flow is AI suggestion, then user review/edit/"request AI corrections", then submit. — [SourcePulse summary](https://www.sourcepulse.org/projects/26457708)
- **Keyword-only search fails on synonyms** in a parts inventory (my-inventory lesson). — [GitHub m-esm/my-inventory](https://github.com/m-esm/my-inventory)

### Inferences (concrete pipeline proposal)
**Indexing (per item, offline):**
1. Store each item photo's image embedding. Allow **multiple reference images per item** (row per image, item_id foreign key). Score an item by max similarity over its images. This is what makes the self-improving loop work.
2. Run the VLM once per catalog photo. It produces (a) a short caption, (b) structured attributes (`category`, `package` such as TO-220/DIP-8/SOT-23/0805, `visible_text` OCR, `color`, `form_factor`, `head_type/drive` for screws). Merge these into an FTS (BM25) document along with the user's name, category and attributes. Optionally also embed the caption or text with a text embedding model.

**Query time (staged, progressive):**
- **Stage 0, client:** resize to about 1024–1536 px on the long edge, JPEG q≈80. Optional second photo ("markings close-up").
- **Stage 1, fast (sub-second on GPU):** image embedding of the query → kNN over all reference images → item ranking A. Return the top 5 to the UI immediately.
- **Stage 2, VLM extraction (seconds):** the VLM reads the query photo(s) and returns the same attribute schema plus `visible_text` and a self-rated legibility. FTS over `visible_text` + category + caption → ranking B. Fuse A and B with **RRF (k=60)**. If the VLM gives a confident category, apply it as a **soft filter**: boost rather than exclude, because a hard filter on a wrong category zeroes recall.
- **Exact-text shortcut:** if the OCR'd text exactly matches an item's part number or marking field (for example "NE555", "AMS1117-3.3", "LM7805"), pin that item to rank 1. Exact identifiers dominate visual similarity.
- **Stage 3, optional VLM rerank:** show the VLM the query plus thumbnails/text of the top ~5–10 fused candidates and ask for an ordering or "none match". This is the most expensive step. Use it only when the top-1/top-2 margin is small, and only if eval shows it helps (see section 5).
- **Clarify instead of guess:** trigger a question when (a) the category is in the "value-not-visible" set (resistor, MLCC, screw, generic connector) **and** several same-category items are in the top 5, or (b) the top-1 vs top-2 fused score margin is under a threshold tuned on the eval set, or (c) the VLM reports text present but illegible. Ask **one** question: "What's printed on it?", "What does your meter read?", "How long is it in mm?" Then re-run FTS with the answer as a filter.
- **Multi-view:** accept 2 photos, an overview and a markings close-up. Use the overview for embedding kNN and the close-up for VLM OCR. Fuse by taking the max or mean of per-photo similarities per item.
- **Feedback loop:** when the user confirms a match, append the query photo (and close-up) as an extra reference image for that item. Also log (query, shown ranks, chosen item) to grow the eval set automatically. When the user picks "none of these", that is a signal to create a new item. Watch for drift: the confirmed photo should be about the same object. Optionally require confirmation before adding it.

### Gaps
- No published evaluation of VLM-rerank vs embedding-only for small personal catalogs. This must be measured locally.
- No source quantifies the optimal soft-filter boost or margin threshold. These are tuning parameters.

## 4. Photo capture guidance; does background removal or cropping help?

### Takeaway
Capture consistency matters more than any single trick. Use a plain, consistent background, fill the frame, use diffuse light (no glare on markings), and take a macro or close-up for printed text. Background removal or cropping helps when query and catalog backgrounds **differ or are cluttered**, but it can hurt when it removes discriminative detail. Treat it as an A/B variant in the eval, not a default.

### Cited Findings
- PRISM (2025): segmenting the product and cropping to it reduced false matches, which "occur in background regions if the segmentation step is not applied". — [PRISM arXiv 2509.14985](https://arxiv.org/pdf/2509.14985)
- Deep metric learning suffers "background bias". Changing the image background at inference causes "a severe decrease in retrieval performance". Training-time background randomization alleviates this. — [CORE: deep metric learning background bias](https://core.ac.uk/works/131750347)
- **Counterexample:** V²L removed backgrounds from both query and index images, and "the performance decreases", possibly because "the background removal algorithm removes some discriminative matching information". — [V²L arXiv 2207.12994](https://arxiv.org/pdf/2207.12994)
- An older small CBIR study reports cropping raised accuracy by about 28% on 3 test images. The sample is tiny, so treat it cautiously. — [arXiv 1208.6335](https://arxiv.org/pdf/1208.6335)
- An OpenCV resistor reader only reached its best accuracy with a tripod, a fixed distance and softbox lighting. Lighting control is decisive for color reading. — [Telkom University thesis](https://openlibrary.telkomuniversity.ac.id/pustaka/files/154041/abstract/aplikasi-android-pembaca-nilai-resistor-menggunakan-opencv.pdf)
- Screw-identification apps rely on a coin or ruler in frame for scale. — [Screw Identifier](https://apps.apple.com/us/app/id6759244718)

### Inferences
- **Capture guidance to show in the app:**
  1. Use one plain, matte, neutral background (for example a grey or white card or a cutting mat), the same for catalog and query photos.
  2. Fill the frame with the part.
  3. Use diffuse light and tilt to kill glare on shiny IC packages.
  4. Take a second close-up of any printed text.
  5. For screws, lay them on a mm grid or ruler, side-on.
  6. For resistors, photograph with daylight-balanced light, since a phone's auto white balance shifts band colors.
- The key risk for this app is that the **catalog photos were taken at different times and places than the queries** (bags, bins, workbench clutter). That is exactly the background-bias scenario. Auto-crop to the main object, using a detector or a "salient object" crop rather than full background removal. This is the low-risk middle ground: test (a) raw, (b) center/object crop, (c) background removed.
- Reference photos accumulated through the feedback loop naturally cover the query-condition distribution and reduce background bias over time.

### Gaps
- I found no domain-specific study (electronics parts) quantifying background removal effects. The evidence comes from e-commerce and retail.

## 5. Evaluation methodology: small eval set, metrics, thresholds, cheap comparison

### Takeaway
Build a 30–50 item, two-session eval from the user's own parts. Measure **Recall@1, Recall@5 and MRR** per pipeline variant and per category, plus "clarify rate" and latency. For a "suggest top 5" UX, a sensible go bar is about R@5 ≥ 0.8 overall (and per major category), with R@1 ≥ 0.5. Expect resistors, caps and screws to fall below this on vision alone, and route them to the clarifying-question path. These thresholds are my recommendation, not from a cited standard.

### Cited Findings
- Industrial visual search teams evaluate with offline metrics **plus human relevance judgments** before online tests. — [Shop The Look, arXiv 2006.10866](https://arxiv.org/pdf/2006.10866)
- RRF was validated by comparing fused vs individual rankings on held-out data with a fixed k. A cheap protocol: fix k=60 and do not tune it on the eval set. — [Cormack et al. 2009](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
- Resistor-reading ground-truth idea: photograph resistors with known values and score digits, multiplier and tolerance separately, including reversed orientations. (Suggested by search synthesis, not a published protocol.) — [Snubber.ai calculator (decode rules)](https://snubber.ai/calculators/resistor-color-code-calculator)
- Background changes between query and gallery strongly degrade retrieval. The eval must vary backgrounds between sessions to be realistic. — [CORE: background bias](https://core.ac.uk/works/131750347)

### Inferences (concrete protocol)
- **Eval set construction:**
  - Pick 30–50 items stratified by category, roughly 8 per class: resistors (through-hole), capacitors (electrolytic and ceramic), ICs (DIP and SMD-on-breakout), modules/dev boards, connectors, screws/nuts.
  - **Deliberately include near-duplicate groups:** e.g. 3 resistors of different values, two DIP-8 ICs (NE555 vs LM358), M3×8 vs M3×12. These are the cases that decide whether the UX feels trustworthy.
  - **Session A** (catalog photo) on day 1 in the "cataloging" setup. **Session B** (query photo) on another day with a different background, lighting and phone angle, ideally in the garage under real conditions. Optionally a session B2 with a markings close-up for the multi-view test.
  - Also include about 10 **distractor-free queries**: parts that are NOT in the catalog. These test "none match" handling and false confidence.
  - Run retrieval against the **full real catalog** (hundreds to thousands of items), not just the 50, so the distractors are realistic.
- **Metrics:** R@1, R@5, MRR (mean of 1/rank of the correct item, 0 if not in the top K); per-category breakdown; median and p95 latency per stage; clarify rate (how often the system asks a question); and for out-of-catalog queries, the false-confident rate (top-1 above the threshold when no correct item exists).
- **Variants to compare (ablation grid, cheap):**
  1. Image embedding only (try 2–3 embedding models; see other researchers' notes).
  2. VLM caption/OCR → FTS only.
  3. RRF(1, 2).
  4. Variant 3 + category soft-filter.
  5. Variant 4 + VLM rerank of top 10.
  6. Each with raw vs auto-cropped images.
  7. Single-view vs two-view.

  Cache all embeddings and VLM outputs per photo once, then run fusion and filter variants offline in milliseconds. Only the VLM rerank needs per-query inference.
- **Statistical caution:** with n=50, one hit equals 2 percentage points, so the 95% confidence interval on R@5≈0.8 is roughly ±11 pp. Treat differences under about 10 pp as noise, or use paired comparison (McNemar-style counting of queries one variant wins and the other loses).
- **Go/no-go suggestion:**
  - Ship the photo-search feature if R@5 ≥ 0.8 on modules/ICs/connectors and the overall R@5 ≥ 0.7.
  - For resistors, caps and screws, ship only with the clarify path. Measure R@5 *after* one clarifying answer, with a target of at least 0.9.
  - Add VLM rerank only if it raises R@1 by ≥10 pp within the latency budget.
- **Self-improving catalog check:** re-run the eval after adding Session B photos as references, then query with a Session C. This measures how much the feedback loop helps.

### Gaps
- I found no published standard thresholds for a "top-5 suggestion" UX in personal inventory. The thresholds above are reasoned recommendations.
- No published benchmark for small-catalog, phone-photo, electronic-part instance retrieval exists to compare against.

## 6. UX latency for a phone-over-cell flow; progressive results

### Takeaway
Stream results. Show embedding-based top-5 within about 1–2 s of upload completion, then refine in place when VLM extraction or rerank finishes (about 3–10 s on an 8–12 GB GPU, depending on model; see the serving researcher's notes). Keep uploads around 200–500 KB by resizing on the client. Total wait beyond about 10 s needs visible progress feedback.

### Cited Findings
- Classic response-time limits: 0.1 s feels instant, 1 s keeps flow of thought, and 10 s is the limit for keeping attention. Longer waits need progress indicators. — [Nielsen Norman Group, Response Times: The 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/)
- Bing's visual search paper treats responsiveness as a first-class design goal at web scale (a cascade of fast recall then heavier ranking). — [Web-Scale Responsive Visual Search at Bing, arXiv 1802.04914](https://arxiv.org/pdf/1802.04914)
- eBay's two-stage pattern (fast hash/category recall, then aspect re-ranking) maps naturally to progressive display. — [Visual Search at eBay](https://arxiv.org/abs/1706.03154)

### Inferences
- A 12 MP phone JPEG is about 3–5 MB. On a mediocre uplink (a few Mbps) that is several seconds by itself. Resizing on the client to about 1280–1536 px long edge, at about 200–400 KB, cuts upload to under 1 s. For the markings close-up, crop rather than downscale, so the text stays legible for OCR. Size it at about 1536–2048 px, or send a center crop at full resolution.
- Progressive UI:
  1. Instant local preview and "searching…".
  2. Embedding top-5 cards, under about 2 s end-to-end.
  3. Badge "refining…" while the VLM runs; reorder with an animation and show the extracted text ("Read: 'LM358'") so the user can correct it.
  4. If clarification is needed, show one question chip while keeping the current top 5 visible.

  Never block on the VLM.
- Run the VLM extraction asynchronously, server-side, keyed by upload id. Cache it, so repeated queries and later "add this photo to item" actions reuse it.

### Gaps
- No domain-specific user study on acceptable latency for inventory photo lookup. The NN/g limits are general HCI guidance (the article is older but still widely cited).
- Concrete VLM latency on 8–12 GB GPUs is out of scope here (covered by the serving/model researchers).
