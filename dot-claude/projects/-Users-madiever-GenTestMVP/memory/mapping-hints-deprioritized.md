---
name: mapping-hints-deprioritized
description: Decision — BE for КТП↔content mapping suggestions is deprioritized (curators know the mapping)
metadata: 
  node_type: memory
  type: project
  originSessionId: 5c10c7f2-4852-4e69-b10b-9b84c6b75b66
---

Backend «подсказки привязки» (mapping suggestions: scoring book-topics ↔ КТП-topics) and auto-mapping on Excel import are **deliberately not built** (decided 2026-06-13).

**Why:** Curators already know which КТП topic a book topic belongs to, so automated suggestions add little value relative to the effort (token scoring service / fuzzy / embeddings).

**How to apply:** Don't re-pitch the BE suggestion endpoint or import auto-mapping unless the user asks. The lightweight FE heuristic `suggestionsFor` in `MappingBoardPanel` (title-similarity, only for empty КТП topics) stays as-is. Relates to [[ktp-roadmap-architecture]].
