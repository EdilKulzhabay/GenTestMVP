---
name: admin-typecheck-command
description: How to correctly typecheck the edu-pwa admin package (root tsc -b does NOT cover it)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 5c10c7f2-4852-4e69-b10b-9b84c6b75b66
---

In the edu-pwa monorepo, `node_modules/.bin/tsc -b --noEmit` from the repo root does **NOT** typecheck `packages/admin` — the root tsconfig only references `./tsconfig.node.json`. Proven empirically: a deliberate type error injected into `packages/admin/src` passes root `tsc -b` with exit 0.

**Why:** Relying on root `tsc -b` for admin gave false "0 errors" confidence and let a real `TS2305` (missing barrel export) ship undetected through an entire adversarial-review cycle.

**How to apply:** To typecheck admin, run `cd packages/admin && npx tsc --noEmit` (uses `packages/admin/tsconfig.json`). It has a baseline of pre-existing errors in dead/legacy barrels (e.g. `entities/index.ts` → `./auth`/`./topic`, `contentCreate`, `register`, `SubjectsManagerPage`, `topic/mockData`) — capture the baseline count and grep for the files you changed to isolate NEW errors. `yarn build:admin` uses vite/esbuild and does NOT typecheck. Relates to [[ktp-roadmap-architecture]].
