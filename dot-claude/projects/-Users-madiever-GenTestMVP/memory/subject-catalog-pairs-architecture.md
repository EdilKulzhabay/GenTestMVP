---
name: subject-catalog-pairs-architecture
description: Как устроены статичный каталог предметов (subjectKind) и пары профильных предметов ЕНТ
metadata: 
  node_type: memory
  type: project
  originSessionId: 5c10c7f2-4852-4e69-b10b-9b84c6b75b66
---

Предметы = статичный каталог-вход в декомпозицию (КТП→Контент→Маппинг→Роудмап); их не создают в админке, а сидируют на бэке и затем наполняют. Пары профильных предметов — производная сущность (ссылается на 2 существующих профильных предмета).

**Бэкенд (GenTestMVP/server) уже всё поддерживает — модель менять не нужно:**
- `Subject.subjectKind: 'main' | 'profile'` (`models/Subject.model.ts`), принимается в create/update/import; `GET /subjects?subjectKind=` фильтрует.
- `ProfileSubjectPair { subject1Id, subject2Id, title="A - B", pairKey }` + `buildPairKey()` (`models/ProfileSubjectPair.model.ts`); `pairKey` нормализует порядок → пара уникальна. CRUD `/profile-subject-pairs` (admin).
- Студенческое приложение (`edu-app/src/entities/profileSubjectPair`) уже выбирает пару и гейтит доступ (`utils/learnerSubjectAccess.util.ts`).

**КРИТИЧНО — main-предметы держим с русскими тайтлами.** `services/trial.service.ts` хардкодит `MAIN_TRIAL_TITLES = ['История Казахстана','Математическая грамотность','Грамотность чтения']` и ищет предметы ПО title. Переименование в казахский сломает генерацию пробного ЕНТ. Поэтому каталог сделан аддитивно: профильные могут быть на казахском, main — русские.

**Сид каталога:** `npm run seed:catalog` (= `seed:subjects && seed:pairs`). Данные: `scripts/data/subjects/*.json` (13 profile + 3 main) и `scripts/data/profileSubjectPairs.json` (12 пар по тайтлам). `seedSubjects.ts` бэкфиллит ТОЛЬКО `subjectKind` у уже существующих предметов (книги не трогает) — чтобы на засеянной БД профильные получили kind=profile и пары привязались. `seedProfileSubjectPairs.ts` идемпотентен (по pairKey) и выходит с кодом 1 при пропусках.

**Фронт-вход:** дашборд (`pages/dashboard/AdminDashboardPage.tsx`) = каталог двумя секциями «Негізгі/Бейіндік» с бейджами; создание предметов убрано (`subjects` и `subjects/new` → редирект на `/admin`). Экрана управления парами в админке пока НЕТ (только сид) — будущая задача; бэкенд CRUD готов. Пункт ЕНТ «Шығармашылық емтихан» (одиночный, не пара из 2) — вне scope.

Связано с [[ktp-roadmap-architecture]].
