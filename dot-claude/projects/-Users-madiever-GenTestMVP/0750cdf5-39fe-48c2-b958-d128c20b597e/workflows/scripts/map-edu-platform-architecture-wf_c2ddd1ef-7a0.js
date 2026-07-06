export const meta = {
  name: 'map-edu-platform-architecture',
  description: 'Faithfully map the current lesson/test/roadmap/KTP/content architecture of the edu platform, then adversarially verify the load-bearing claims',
  phases: [
    { title: 'Map', detail: 'parallel readers over content, KTP/roadmap, lessons, tests, progress, docs' },
    { title: 'Verify', detail: 'adversarial verification of the most load-bearing architectural claims' },
  ],
}

const MAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subsystem', 'entities', 'flows', 'reuse', 'aiCost', 'problems', 'evidence'],
  properties: {
    subsystem: { type: 'string' },
    entities: {
      type: 'array',
      description: 'Each data model / collection / major type in this subsystem',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'file', 'fields', 'relationships', 'notes'],
        properties: {
          name: { type: 'string' },
          file: { type: 'string', description: 'file:line' },
          fields: { type: 'array', items: { type: 'string' }, description: 'field: type — include enums, refs, embedded vs referenced' },
          relationships: { type: 'array', items: { type: 'string' }, description: 'how it links to other entities (ref, embed, denormalized id, etc.)' },
          notes: { type: 'string', description: 'indexes, uniqueness, embedding decisions, anything notable' },
        },
      },
    },
    flows: {
      type: 'array',
      description: 'Generation / read / write flows: how things are produced and stored',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'steps', 'aiCalls'],
        properties: {
          name: { type: 'string' },
          steps: { type: 'array', items: { type: 'string' }, description: 'ordered steps with file:line where the work happens' },
          aiCalls: { type: 'string', description: 'which steps call an LLM, what model/prompt shape, what is cached vs regenerated' },
        },
      },
    },
    reuse: { type: 'string', description: 'What content is reused/cached vs regenerated from scratch each time, and the cache key/mechanism if any' },
    aiCost: { type: 'string', description: 'Where AI generation cost is incurred, per what unit (per user? per node? per attempt?), and whether results are shared across users' },
    problems: { type: 'array', items: { type: 'string' }, description: 'Smells, duplication, scalability/cost risks, coupling, missing abstractions — be specific with file:line' },
    evidence: { type: 'array', items: { type: 'string' }, description: 'Key verbatim code snippets or schema excerpts with file:line that a skeptic could re-check' },
  },
}

phase('Map')

const readers = [
  {
    label: 'content-model',
    prompt: `You are mapping the CONTENT HIERARCHY subsystem of an educational platform (Node/TS + MongoDB/Mongoose) at /Users/madiever/GenTestMVP.
Read fully and carefully:
- server/src/models/Subject.model.ts
- server/src/services/subjectContent.service.ts
- server/src/controllers/subject.controller.ts
- server/src/routes/subject.routes.ts
Skim subject.json at repo root as an example import.
Goal: document the content hierarchy. Specifically answer:
- Exact schema of Subject and any nested entities (Book, Chapter, Topic, Paragraph). Are books/chapters/topics/paragraphs EMBEDDED subdocuments or SEPARATE collections? What are the id fields, order fields, content fields?
- Does a Subject support MULTIPLE books today? How is ordering of books/chapters/topics/paragraphs handled?
- Is there any notion of "subtopic" (подтема) as a distinct entity, or only topic/paragraph?
- How is content validated on import? Any uniqueness constraints?
Return the structured map. Use exact field names and file:line. Quote the Mongoose schema fields verbatim in evidence.`,
  },
  {
    label: 'ktp-roadmap',
    prompt: `You are mapping the KTP (календарно-тематический план) + ROADMAP subsystem of an educational platform at /Users/madiever/GenTestMVP.
Read fully and carefully:
- server/src/models/KtpCatalog.model.ts
- server/src/models/CanonicalRoadmap.model.ts
- server/src/services/ktp.service.ts
- server/src/services/roadmap.ai.service.ts
- server/src/roadmap/roadmap.rules.ts
- server/src/controllers/roadmap.controller.ts
And read server/src/services/roadmap.service.ts (it is ~1080 lines — read it in full across multiple reads if needed; this is the core file).
Goal: explain how the learning roadmap is constructed. Specifically:
- What is the KtpCatalog — a reference/справочник of КТП topics? What are its fields and granularity (subject? grade? topic list?)
- What is CanonicalRoadmap vs the live roadmap? Are roadmap NODES persisted entities or computed on the fly?
- How are roadmap nodes derived: from KTP catalog (live) or from book topics? (Memory hint: roadmap is built from the KTP reference live, not from linear book topics — verify or refute this against code.)
- What are roadmap NODES, EDGES, prerequisites/unlock rules? Where do they live?
- How does a roadmap node link back to content (topics/paragraphs/books) and to lessons and tests?
Return the structured map with exact field names and file:line. In evidence, quote the node/edge schema and the function that builds the roadmap.`,
  },
  {
    label: 'lesson-gen',
    prompt: `You are mapping the LESSON GENERATION subsystem of an educational platform at /Users/madiever/GenTestMVP.
Read fully and carefully:
- server/src/models/NodeLessonContent.model.ts
- server/src/services/nodeLessonContent.service.ts
- server/src/services/roadmapLesson.service.ts
Goal: explain how a lesson for a roadmap node is generated and whether it is reused. Specifically:
- What triggers lesson generation? Is a lesson generated per-node-globally (shared across all students) or per-user?
- What is the cache key for NodeLessonContent (subject? node? book? version?)? Is there versioning/invalidation?
- What does the AI prompt for a lesson look like — what source material is fed in (paragraph text? topic title? KTP?)?
- Is the lesson regenerated from scratch each time or fetched if it exists?
- How does lesson content relate to test generation downstream?
Return the structured map with exact field names and file:line. Quote the cache-lookup logic and the model schema in evidence.`,
  },
  {
    label: 'test-gen',
    prompt: `You are mapping the TEST / QUESTION GENERATION subsystem of an educational platform at /Users/madiever/GenTestMVP.
Read fully and carefully:
- server/src/models/Test.model.ts
- server/src/services/ai.service.ts (~556 lines, read fully)
- server/src/controllers/test.controller.ts (~25k chars, read fully)
- server/src/services/testResult.service.ts
Goal: explain how tests/questions are generated, stored, validated, and whether questions are reused. Specifically:
- Exact Test schema: what is a question? (text, options, correct answer, explanation, difficulty, links to topic/paragraph/node?)
- Where do questions come from? What source material is fed to the LLM? Which model/prompt?
- Is there ANY question bank / reuse of previously generated questions? Or is every test generated fresh per attempt? (This is critical — verify.)
- How is the generated test tied to a roadmap node / topic / KTP? How is "coverage of the topic" ensured, if at all?
- What anti-hallucination / grounding measures exist (e.g. feeding source text, schema validation, answer verification)?
- How are answers checked and results analyzed?
Return the structured map with exact field names and file:line. In evidence quote the Test schema, the generation prompt, and any persistence/reuse logic.`,
  },
  {
    label: 'progress-attempts',
    prompt: `You are mapping the PROGRESS / ATTEMPTS / MASTERY subsystem of an educational platform at /Users/madiever/GenTestMVP.
Read fully and carefully:
- server/src/models/UserRoadmapProgress.model.ts
- server/src/models/RoadmapAttempt.model.ts
- server/src/models/Test.model.ts (the attempt-relevant parts)
- server/src/services/testResult.service.ts
- server/src/services/profileStats.service.ts
- server/src/services/trial.service.ts
Goal: explain how a student's progress, mastery, and unlocking of roadmap nodes work. Specifically:
- How is per-user progress stored? Per node? What states (locked/available/done/mastery score)?
- How does completing a test update progress and unlock the next node?
- Is mastery tracked at node level only, or at topic/subtopic/knowledge level?
- What is "trial" — a trial mode? How does it differ from the full roadmap flow?
Return the structured map with exact field names and file:line. Quote progress schema and the unlock logic in evidence.`,
  },
  {
    label: 'docs-intent',
    prompt: `You are extracting the DOCUMENTED ARCHITECTURE & INTENT of an educational platform at /Users/madiever/GenTestMVP, to compare documented design against code reality.
Read fully:
- docs/ARCHITECTURE.md
- docs/ROADMAP_SPEC.md
- docs/NOTION_DOCS.md
- README.md (skim the architecture-relevant parts)
Goal: capture how the system is DESIGNED to work according to docs, especially: content model (subject/book/chapter/topic/paragraph), roadmap/KTP, lesson generation, test generation, any mention of a question bank, knowledge blocks, subtopics, or reuse strategy. Note any place where the docs describe an intent that may not be (or may be) implemented.
Return the structured map. For 'entities' list the documented entities. For 'flows' list documented generation flows. In 'problems' list documented-but-questionable design decisions or gaps the docs themselves admit. In evidence quote the most architecturally important doc passages with file:line.`,
  },
]

const maps = (await parallel(
  readers.map(r => () => agent(r.prompt, { label: r.label, phase: 'Map', schema: MAP_SCHEMA }))
)).filter(Boolean)

phase('Verify')

// Load-bearing claims that my architecture recommendation will rest on. Each verifier must
// independently re-read the code and try to REFUTE the claim, citing file:line.
const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['claim', 'verdict', 'evidence', 'nuance'],
  properties: {
    claim: { type: 'string' },
    verdict: { type: 'string', enum: ['CONFIRMED', 'REFUTED', 'PARTIAL'] },
    evidence: { type: 'array', items: { type: 'string' }, description: 'file:line citations and verbatim snippets supporting the verdict' },
    nuance: { type: 'string', description: 'caveats, exceptions, partial truths — what a careful architect must know' },
  },
}

const claims = [
  {
    label: 'verify:no-question-bank',
    claim: 'There is NO persistent question bank: every test is generated fresh by the LLM per attempt/request, and previously generated questions are not reused across users or attempts.',
    files: 'server/src/models/Test.model.ts, server/src/services/ai.service.ts, server/src/controllers/test.controller.ts, server/src/services/testResult.service.ts',
  },
  {
    label: 'verify:lesson-reuse',
    claim: 'Lesson content IS cached and reused per roadmap node (shared across users) via NodeLessonContent — it is NOT regenerated per user each time.',
    files: 'server/src/models/NodeLessonContent.model.ts, server/src/services/nodeLessonContent.service.ts, server/src/services/roadmapLesson.service.ts',
  },
  {
    label: 'verify:roadmap-from-ktp',
    claim: 'The roadmap is built live from the KTP catalog (KtpCatalog) reference, NOT from the linear topic list of books; roadmap nodes are derived from KTP entries.',
    files: 'server/src/models/KtpCatalog.model.ts, server/src/models/CanonicalRoadmap.model.ts, server/src/services/ktp.service.ts, server/src/services/roadmap.service.ts, server/src/services/roadmap.ai.service.ts',
  },
  {
    label: 'verify:multi-book-and-subtopics',
    claim: 'A Subject can contain MULTIPLE books, and content is modeled as embedded hierarchy subject>book>chapter>topic>paragraph with NO distinct "subtopic" (подтема) entity between topic and paragraph.',
    files: 'server/src/models/Subject.model.ts, server/src/services/subjectContent.service.ts, server/src/controllers/subject.controller.ts',
  },
  {
    label: 'verify:test-node-grounding',
    claim: 'Test/question generation is grounded in node/topic content (source text is fed to the LLM) and there is some attempt to ensure topic coverage; OR conversely there is little grounding and coverage is not enforced — determine which is true.',
    files: 'server/src/services/ai.service.ts, server/src/services/roadmapLesson.service.ts, server/src/controllers/test.controller.ts',
  },
]

const verdicts = (await parallel(
  claims.map(c => () => agent(
    `Adversarially VERIFY this architectural claim about the codebase at /Users/madiever/GenTestMVP. Re-read the relevant code yourself; do NOT trust prior summaries. Try hard to REFUTE the claim — only return CONFIRMED if the code clearly supports it. Cite file:line for every assertion.

CLAIM: ${c.claim}

Start by reading: ${c.files}

Return your verdict.`,
    { label: c.label, phase: 'Verify', schema: VERDICT_SCHEMA }
  ))
)).filter(Boolean)

return { maps, verdicts }
