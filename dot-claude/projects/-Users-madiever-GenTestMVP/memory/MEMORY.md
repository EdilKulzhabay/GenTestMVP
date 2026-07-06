# Memory Index

- [КТП roadmap architecture](ktp-roadmap-architecture.md) — роудмап строится из справочника КТП (live), а не из линейных тем книг
- [Subject catalog & pairs architecture](subject-catalog-pairs-architecture.md) — статичный каталог предметов (subjectKind) + пары ЕНТ; main-предметы держим русскими (trial.service хардкодит тайтлы)
- [Admin typecheck command](admin-typecheck-command.md) — root `tsc -b` does NOT cover packages/admin; use `cd packages/admin && npx tsc --noEmit`
- [Mapping hints deprioritized](mapping-hints-deprioritized.md) — BE-подсказки привязки и авто-маппинг при импорте НЕ делаем (кураторы и так знают привязку)
- [Test refresh restore](test-refresh-restore.md) — рефреш-restore теста решён клиентским персистом (sessionStorage); getGeneratedTestById не вайрим
- [Knowledge bank architecture](knowledge-bank-architecture.md) — фазы 1-3: KnowledgeComponent, банк вопросов (QuestionItem), пер-KC mastery; что аддитивно и что ещё не подключено
