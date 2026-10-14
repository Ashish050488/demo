# JobMesh — Naming Conventions

**Stack:** Node.js + Express + Mongoose (backend, plain JS) · React + TypeScript + Vite + Tailwind (frontend) · MongoDB · BullMQ on Redis (queues) · S3-compatible object storage.

**What this document covers:** Naming rules for files, folders, variables, functions, types, components, hooks, database collections and fields, API routes, JSON keys, environment variables, git branches, and the seeker-vs-employer audience boundary.

**What this document does NOT cover:** Specific feature work or business logic. Those are in SPEC.md and BUSINESS.md.

---

## The single most important rule

> **A name must be fully readable. No shortcuts, no abbreviations, no guessing.**

If a new engineer has to pause and think "what does this short word mean?", the name has failed. Spell things out. A longer name that reads cleanly is always better than a short name that's clever.

This means:

- ✅ `applicationScore` ❌ `appScore` ❌ `score`
- ✅ `employerUser` ❌ `empUsr` ❌ `eu`
- ✅ `archiveReason` ❌ `archRsn` ❌ `ar`
- ✅ `currentCompany` ❌ `curCmpny` ❌ `cc`
- ✅ `index` ❌ `idx` ❌ `i`
- ✅ `configuration` ❌ `cfg`
- ✅ `pendingApplications` ❌ `pendApps` ❌ `pa`

**The only short forms allowed** are recognized acronyms and standard identifiers:

- `id` (identifier)
- `url` (uniform resource locator)
- `api` (application programming interface)
- `pdf`, `csv`, `json` (file format names)
- `jwt` (JSON Web Token)
- `jd` (job description — domain-standard in recruiting; allowed as a noun suffix like `jdEmbedding`)
- `ats` (applicant tracking system — proper-noun usage)
- `utm` (URL tracking parameter naming convention)
- `dpdp` (Digital Personal Data Protection — Indian law name)
- `ai` (always lowercase in identifiers)

Anything outside this list: spell it out.

---

## 0. The two-audience rule (READ THIS FIRST)

JobMesh contains two completely separate audiences in one codebase:

| Audience | Who they are | Where they live in the code |
|---|---|---|
| **Seeker** | Job candidates browsing or applying to jobs | `pages/seeker/*`, `api/seeker/*`, hooks/components named with `Seeker` prefix when ambiguous |
| **Employer** | Companies posting jobs and managing applicants (paying customers) | `pages/employer/*`, `api/employer/*`, hooks/components named with `Employer` prefix when ambiguous |
| **Public** | Unauthenticated visitors to apply pages (a candidate filling out an apply form, no account required) | `pages/apply/*`, `api/public/*` |

**Cross-namespace imports are banned.** A file in `api/employer/` must not import from `api/seeker/`. A component in `pages/employer/` must not import from `pages/seeker/`. Shared code goes in `shared/` or `core/`, not borrowed across audiences.

This rule prevents the single most expensive bug a multi-tenant SaaS can ship: an employer endpoint that accidentally returns data from another company because someone reused a seeker query helper that didn't filter by `companyId`.

When a name is ambiguous between audiences, add the audience prefix:

```js
// Good
EmployerUser, SeekerUser
requireEmployer, requireSeeker
useEmployerAuth, useSeekerAuth

// Bad — which audience?
User, Auth, requireAuth, useAuth
```

When a name is unambiguous (only one audience has that concept), no prefix is needed:

```js
// Good — only employers post jobs
Posting, createPosting

// Good — only seekers dismiss jobs
DismissedJob, dismissJob
```

---

## 1. Universal casing rules

| What | Casing | Example |
|---|---|---|
| Variables and functions (JS/TS) | `camelCase` | `pendingApplications`, `scoreResume` |
| TypeScript types, interfaces, classes, React components | `PascalCase` | `Application`, `EmployerDashboard` |
| Truly fixed constants | `UPPER_SNAKE_CASE` | `MAXIMUM_RESUME_SIZE_MEGABYTES` |
| MongoDB collection names | `snake_case` plural | `applications`, `archive_reasons`, `resume_scores` |
| MongoDB field names | `camelCase` | `companyId`, `appliedAt`, `embeddingScore` |
| API URL paths | `kebab-case` lowercase | `/api/employer/archive-reasons` |
| JSON keys in API requests/responses | `camelCase` | `{ "companyId": "abc", "isArchived": true }` |
| Environment variables | `UPPER_SNAKE_CASE` | `MONGODB_URI`, `ANTHROPIC_API_KEY` |
| Git branches | `type/kebab-case` | `feature/employer-onboarding` |
| CSS classes (Tailwind utility composition) | `kebab-case` if custom | `employer-card`, `apply-form` |

**Why Mongo uses camelCase fields when SQL convention is snake_case:** Because Mongoose models are JS objects and the field names show up as JS property accessors directly. Forcing `snake_case` in Mongo would require a translation layer for no benefit. Keep each layer in its native style.

---

## 2. File length — hard limit

> **No source file shall exceed 200 lines of code.**

Counting rules:
- Imports, exports, type definitions, blank lines, and comments all count toward the 200-line limit.
- 200 lines is the **hard ceiling**, not a target. Most files should be 50–150 lines.
- The only exception is auto-generated or configuration files (e.g., `package.json`, `tsconfig.json`, `tailwind.config.js`, migration data files).

When a file approaches 180 lines, it must be split. Common splits:

| Source file getting too long | How to split |
|---|---|
| Route file with many handlers | Move each handler into its own controller file; the route file only wires URL → handler. |
| Model with many static methods | Move static methods into a separate `*-queries.js` or `*-helpers.js` file. |
| React page with several sub-sections | Extract each section into its own component file. |
| Service with multiple distinct operations | Split by operation: `score-resume-service.js`, `extract-resume-text-service.js`, etc. |
| Type file declaring many unrelated types | Group related types into separate files. |

A file that does one thing in 50 lines is always better than a file that does ten things in 500 lines.

---

## 3. Folder structure (the audience boundary made physical)

### 3.1 Backend (`backend/src/`)

```
backend/src/
├── api/
│   ├── seeker/              # existing seeker-facing routes (auth, jobs browsing, profile)
│   ├── employer/            # NEW: employer ATS routes (auth, jobs, applications, settings)
│   └── public/              # NEW: unauthenticated routes (apply form, DPDP requests)
├── models/
│   ├── seeker/              # existing seeker user models, applied jobs, dismissed jobs
│   ├── employer/            # NEW: company, employer user, posting, application, contact, stage, etc.
│   ├── shared/              # job model (used by both seeker browsing and employer posting)
│   └── index.js             # central re-export
├── middleware/
│   ├── require-seeker.js    # auth middleware for seeker JWT
│   ├── require-employer.js  # NEW: auth middleware for employer JWT
│   ├── async-handler.js
│   └── error-handler.js
├── services/
│   ├── ai/                  # NEW: resume scoring (embed, score-with-llm, extract-text)
│   ├── storage/             # NEW: S3 abstraction (put-file, signed-url, delete)
│   ├── email/               # NEW: transactional email sending
│   └── dpdp/                # NEW: consent and erasure helpers
├── core/                    # existing scraper, job tags, processor (untouched)
├── company-config/          # existing per-company scraping config (untouched)
├── db/                      # existing database connection + analytics helpers
├── tasks/                   # existing one-off scripts and crons
├── config.js
├── env.js
├── server.js
└── utils.js
```

### 3.2 Frontend (`frontend/src/`)

```
frontend/src/
├── pages/
│   ├── seeker/              # MOVED: Home, Today, Dashboard, CompanyDirectory, Progress, Legal
│   ├── employer/            # NEW: Login, Signup, Onboarding, Dashboard, Jobs/, Applicants/, Settings/
│   └── apply/               # NEW: public Form, Success, Company (mini careers page)
├── components/
│   ├── ui/                  # shared design system primitives (Button, Card, Input, etc.)
│   ├── layouts/             # AppLayout, AuthLayout, PublicLayout
│   ├── seeker/              # seeker-specific composite components (existing DashboardFilterBar, JobCard, etc.)
│   ├── employer/            # NEW: employer-specific composites (KanbanBoard, RankedTable, etc.)
│   └── apply/               # NEW: apply form composites (ResumeUpload, ConsentBlock, etc.)
├── context/
│   ├── seeker/              # MOVED: existing UserContext for seekers
│   ├── employer/            # NEW: EmployerContext for employer auth and current company
│   └── theme/               # ThemeProvider
├── hooks/
│   ├── seeker/              # MOVED: useCompanies, useTechNews (seeker-side)
│   ├── employer/            # NEW: useEmployerJobs, useApplicants, useStages, etc.
│   └── shared/              # useViewport, useDebouncedValue, useLocalStorage
├── api/
│   ├── seeker-api.ts        # MOVED: seeker API calls
│   ├── employer-api.ts      # NEW: employer API calls
│   ├── public-api.ts        # NEW: apply form submit, DPDP requests
│   └── http-client.ts       # shared fetch wrapper
├── theme/                   # tokens, themes, ThemeProvider (existing — expanded)
├── types/
│   ├── seeker.ts            # seeker domain types
│   ├── employer.ts          # employer domain types
│   ├── shared.ts            # types used in both (Job, etc.)
│   └── api.ts               # API request/response envelopes
├── utils/                   # pure helpers, never audience-specific
├── App.tsx
├── main.tsx
└── index.css
```

**Migration note:** The existing seeker pages are currently at `frontend/src/pages/Home/`, `Today/`, `Dashboard/`, etc. directly under `pages/`. They will be moved into `pages/seeker/` as part of the redesign pass. Imports get updated automatically by any reasonable editor or via the prompt.

---

## 4. File naming

### 4.1 Backend JavaScript files

Use `kebab-case.js` with a suffix that tells you the file's purpose. The suffix is mandatory.

| Purpose | Suffix | Example |
|---|---|---|
| Express route definitions | `-routes.js` | `applications-routes.js`, `employer-auth-routes.js` |
| Controller (handles request, returns response) | `-controller.js` | `applications-controller.js` |
| Service (business logic, no HTTP knowledge) | `-service.js` | `score-resume-service.js`, `send-email-service.js` |
| Mongoose model file | `-model.js` | `application-model.js`, `archive-reason-model.js` |
| Express middleware | `-middleware.js` | `require-employer-middleware.js` |
| Validation rules | `-validator.js` | `apply-form-validator.js` |
| Pure helper functions | `-helpers.js` | `slug-helpers.js`, `date-helpers.js` |
| Database query helpers (Mongoose statics extracted out) | `-queries.js` | `application-queries.js` |
| Configuration loader | `-config.js` | `mongo-config.js`, `s3-config.js` |
| Background worker | `-worker.js` | `resume-scoring-worker.js` |
| One-off script | `-script.js` (in `tasks/`) | `migrate-job-dates-script.js` |

One file equals one main responsibility. Do not put route handlers and Mongoose schemas together. Do not put two unrelated services in one file.

### 4.2 React component files

Component files use `PascalCase.tsx`. The file name matches the exported component name exactly.

| Component | File name |
|---|---|
| `EmployerDashboard` | `EmployerDashboard.tsx` |
| `KanbanBoard` | `KanbanBoard.tsx` |
| `ResumeUploadField` | `ResumeUploadField.tsx` |
| `StagePicker` | `StagePicker.tsx` |

One component per file. Default export the main component. Helper sub-components stay in the same file only if they are small (under 40 lines combined) and private to that file.

### 4.3 React hook files

Hook files use `camelCase.ts` and the file name matches the hook name (which must start with `use`).

| Hook | File name |
|---|---|
| `useEmployerAuth` | `useEmployerAuth.ts` |
| `useApplicants` | `useApplicants.ts` |
| `useDebouncedValue` | `useDebouncedValue.ts` |
| `useResumeUpload` | `useResumeUpload.ts` |

### 4.4 Utility files (frontend)

Use `kebab-case.ts`. Name describes the contents.

| Contents | File name |
|---|---|
| Date formatting helpers | `format-date.ts` |
| Slug generation | `generate-slug.ts` |
| Resume file validation | `validate-resume-file.ts` |
| API client setup | `http-client.ts` |

Never name a file `utils.ts`, `helpers.ts`, `common.ts`, or `misc.ts`. These names mean "a junk drawer." Split into purpose-named files.

### 4.5 Type definition files (frontend)

Use `kebab-case.ts` or grouped domain files.

| Contents | File name |
|---|---|
| Employer domain types | `employer.ts` |
| Seeker domain types | `seeker.ts` |
| API envelope types | `api.ts` |
| Shared types (used across audiences) | `shared.ts` |

### 4.6 Test files

Test files sit next to the file they test, with `.test.js` (backend) or `.test.tsx`/`.test.ts` (frontend) suffix.

| Source file | Test file |
|---|---|
| `score-resume-service.js` | `score-resume-service.test.js` |
| `EmployerDashboard.tsx` | `EmployerDashboard.test.tsx` |
| `validate-resume-file.ts` | `validate-resume-file.test.ts` |

---

## 5. Variable naming

### 5.1 Be specific and complete

The name must tell you what the variable holds. No `data`, no `info`, no `temp`, no `item`, no `value`, no `result`, no `obj`, no `thing`.

```js
// Good
const pendingApplications = [...];
const archivedApplicants = [...];
const currentEmployerUser = ...;
const resumeFileSizeBytes = 2_400_000;

// Bad
const data = [...];
const items = [...];          // items of what?
const user = ...;             // which user, in what state?
const size = 2_400_000;       // size of what, in what unit?
```

### 5.2 Booleans — always start with a yes/no prefix

| Prefix | Use for | Example |
|---|---|---|
| `is` | State of being | `isArchived`, `isLoading`, `isScored` |
| `has` | Possession | `hasResumeFile`, `hasUnreadApplications` |
| `can` | Permission/capability | `canMoveStage`, `canDeletePosting` |
| `should` | Conditional behavior | `shouldShowOnboarding`, `shouldRetryScoring` |

### 5.3 Collections — plural and specific

```js
// Good
const applications = [...];
const activePostings = [...];
const archiveReasons = [...];

// Bad
const list = [...];
const data = [...];
const items = [...];
```

### 5.4 Single items and loops

Never use single-letter or two-letter names. Even in `.map`/`.forEach`/`.filter` callbacks.

```js
// Good
applications.forEach((application, index) => { ... });
postings.map((posting) => posting.title);
for (let dayNumber = 1; dayNumber <= 31; dayNumber += 1) { ... }

// Bad
applications.forEach((a, i) => { ... });
postings.map((x) => x.title);
for (let i = 0; i < 31; i += 1) { ... }
```

### 5.5 Counts, identifiers, dates, money, durations

```js
// Counts → end with "Count"
const applicantCount = 247;
const pendingScoreCount = 12;

// Identifiers → end with "Id"
const companyId = '...';
const applicationId = '...';
const stageId = '...';

// Date/time → end with "At" (instant) or "On" (calendar date)
const appliedAt = '2026-06-15T10:30:00Z';
const archivedAt = new Date();
const dueOn = '2026-07-20';

// Money → store and label in smallest unit, name carries the unit
const applicationFeePaise = 99900;          // ₹999.00
const apiCostPaise = 250;                   // ₹2.50

// Durations → ALWAYS include the unit in the name
const sessionExpiryMinutes = 60;
const resumeMaximumSizeMegabytes = 5;
const retryDelayMilliseconds = 500;
const retentionPeriodDays = 365;
```

> **The duration-unit rule has prevented more bugs than almost any other rule. Enforce it ruthlessly.**

### 5.6 Constants in code

Truly fixed values use `UPPER_SNAKE_CASE`. Group related constants in an object that acts like an enum.

```js
const MAXIMUM_RESUME_SIZE_MEGABYTES = 5;
const ALLOWED_RESUME_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'rtf'];

const APPLICATION_SOURCES = {
  LINKEDIN: 'linkedin',
  NAUKRI: 'naukri',
  WHATSAPP: 'whatsapp',
  TWITTER: 'twitter',
  DIRECT: 'direct',
  REFERRAL: 'referral',
};

const ARCHIVE_REASON_TYPES = {
  HIRED: 'hired',
  NON_HIRED: 'non-hired',
};

const POSTING_STATUSES = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  CLOSED: 'closed',
};

// Use them by name, never re-type the string
if (application.source === APPLICATION_SOURCES.LINKEDIN) { ... }
```

Magic strings sprinkled through the code are forbidden. If a literal value appears twice, it becomes a constant.

---

## 6. Function naming

### 6.1 Functions do something — start with a verb

```js
// Good
function getApplicationById(applicationId) { ... }
function scoreResumeAgainstPosting(resume, posting) { ... }
function generatePostingSlug(title) { ... }
function validateApplyFormSubmission(body) { ... }

// Bad
function application(id) { ... }       // is this a getter or a constructor?
function resumeScore(resume) { ... }
function slug(title) { ... }
```

### 6.2 Verb prefixes — use the most precise one

Use whatever verb fits best. The table below covers the common ones; it's guidance, not a closed allowlist.

| Verb | Meaning |
|---|---|
| `get` | Synchronous getter from memory or local computation |
| `fetch` | Asynchronous network or database call |
| `load` | Asynchronous, usually populates UI state |
| `create` | Make a new thing |
| `update` | Modify an existing thing |
| `delete` | Remove permanently |
| `remove` | Detach (less permanent than delete) |
| `upload` | Send a file outward |
| `download` | Retrieve a file inward |
| `send` | Outbound message (email, notification) |
| `validate` | Check correctness; returns boolean or throws |
| `calculate` | Returns a derived numeric value |
| `format` | Returns a presentation string |
| `parse` | String/raw input to structured value |
| `handle` | Event handler inside a component |
| `assert` | Throws if a condition is not met; no return value |
| `build` | Assembles a complex object or query from parts |
| `normalize` | Cleans or standardises a value without changing its meaning |
| `score` | Specific to AI scoring pipeline; returns a numeric score |
| `enqueue` | Push a job onto a queue |
| `is`, `has`, `can` | Returns a boolean |
| `to` | Conversion between types |

```js
async function fetchApplicationsForPosting(postingId, filters) { ... }
function calculateAverageApplicationScore(applications) { ... }
function formatScoreForDisplay(scoreOutOf100) { ... }
function toApplicationResponseShape(applicationDocument) { ... }
function isApplicationArchived(application) { ... }
function buildApplicantListQuery(filters) { ... }
function normalizePhoneNumber(value) { ... }
function assertApplicationBelongsToCompany(application, companyId) { ... }
async function scoreResumeAsync(applicationId) { ... }
function enqueueResumeScoringJob(applicationId) { ... }
```

### 6.3 Async functions — do not suffix with "Async"

JavaScript convention assumes async if the function returns a Promise. The verb already implies it.

```js
// Good
async function fetchApplications() { ... }

// Bad — redundant
async function fetchApplicationsAsync() { ... }
```

### 6.4 Event handlers vs prop callbacks (React)

- **Prop name** (what the parent passes in): starts with `on` — the event happens *on* this thing.
- **Handler implementation** (the function body): starts with `handle` — this function *handles* the event.

```tsx
function ApplicantDetail({ application }: { application: Application }) {
  const handleArchive = async () => {
    await archiveApplication(application.id);
  };

  return <ArchiveButton onArchive={handleArchive} />;
}

function ArchiveButton({ onArchive }: { onArchive: () => void }) {
  return <button onClick={onArchive}>Archive</button>;
}
```

Never name a prop `handleArchive` and never name an implementation `onArchive`.

### 6.5 Multi-tenant safety — every employer query function has the company in its name

Any function that queries employer data must include `forCompany` or take a `companyId` as the first parameter visibly.

```js
// Good — the company scoping is in the name
function fetchApplicationsForCompany(companyId, filters) { ... }
function getPostingForCompany(companyId, postingId) { ... }

// Acceptable — first parameter clearly carries it
function archiveApplication(companyId, applicationId, reasonId) { ... }

// BAD — ambient companyId, no visible scoping
function getAllApplications() { ... }                 // for which company??
function archiveApplication(applicationId) { ... }    // missing tenant boundary
```

This name-level rule reinforces the runtime middleware check. Two layers of defense.

---

## 7. TypeScript types and interfaces (frontend)

### 7.1 Casing

`PascalCase`. No `I` prefix on interfaces (anti-pattern from C#; not idiomatic TS).

```ts
// Good
type Application = { id: string; ... };
interface Posting { id: string; ... }
type ApplicationStatus = 'applied' | 'shortlisted' | 'archived';

// Bad
type application = { ... };      // not PascalCase
interface IPosting { ... }       // I-prefix is C# baggage
type application_status = ...;   // wrong casing
```

### 7.2 Use `type` for unions, primitives, simple shapes. Use `interface` only for object shapes that may be extended.

```ts
// type for unions and primitives
type PostingStatus = 'draft' | 'active' | 'closed';
type ApplicationId = string;

// interface only when extension is meaningful
interface ApiResponse<T> {
  data: T;
}
interface PaginatedResponse<T> extends ApiResponse<T[]> {
  totalCount: number;
  pageNumber: number;
}
```

### 7.3 Never use `any`. Avoid `unknown` unless you genuinely don't know.

If the type is complex, write it out. If it's external (from a library without types), declare a minimal local interface for the parts you use.

---

## 8. React components

### 8.1 Component names

Always `PascalCase`. The name describes **what it renders**, not how it's built.

```tsx
// Good
<EmployerDashboard />
<KanbanBoard postingId={postingId} />
<ResumeUploadField onUpload={handleUpload} />
<ApplicantDetailDrawer applicationId={applicationId} />

// Bad
<dashboard />                       // not PascalCase
<EmployerComponent />               // "Component" suffix tells us nothing
<Wrapper />                         // wraps what?
<Container />                       // contains what?
<MyButton />                        // "My" is noise
```

### 8.2 Props

`camelCase`. Boolean props follow the `is/has/can/should` rule. Event props follow the `on*` rule.

```tsx
<ApplicantCard
  application={application}
  isArchived={application.archived !== null}
  hasResumeScore={application.scoreId !== null}
  canArchive={currentUser.role === 'owner'}
  onArchive={handleArchive}
  onMoveStage={handleMoveStage}
/>
```

### 8.3 Custom hooks

Always start with `use`. Name describes what they return or do.

```ts
useEmployerAuth()              // returns employer auth state and methods
useApplicants(postingId)       // fetches and returns applicants
useStages()                    // returns the current company's pipeline stages
useResumeUpload()              // handles resume file upload state
useDebouncedValue(value, 300)
```

Bad:
```ts
authHook()                     // missing "use" prefix
useStuff()                     // vague
useGetApplicants()             // redundant "Get"
useData()                      // data about what?
```

---

## 9. API URL paths

Lowercase, `kebab-case`, plural nouns for collections. Always namespaced by audience.

```
# Seeker (existing)
GET    /api/seeker/jobs
GET    /api/seeker/jobs/:jobId
POST   /api/seeker/applied
POST   /api/seeker/dismissed

# Employer (new)
POST   /api/employer/auth/signup
POST   /api/employer/auth/login
GET    /api/employer/postings
POST   /api/employer/postings
GET    /api/employer/postings/:postingId
POST   /api/employer/postings/:postingId/close
GET    /api/employer/postings/:postingId/applications
POST   /api/employer/applications/:applicationId/move
POST   /api/employer/applications/:applicationId/archive
POST   /api/employer/applications/bulk/archive
GET    /api/employer/stages
POST   /api/employer/stages
GET    /api/employer/archive-reasons

# Public (unauthenticated)
GET    /api/public/companies/:companySlug
GET    /api/public/jobs/:companySlug/:jobSlug
POST   /api/public/jobs/:companySlug/:jobSlug/apply
POST   /api/public/dpdp/request
```

Path parameter names use `camelCase` matching the variable in code.

Action endpoints (verb after the resource) are fine and often clearer than forcing pure REST. `POST /applications/:applicationId/archive` is good; do not invent `PATCH /applications/:id?action=archive`.

---

## 10. JSON keys (requests and responses)

`camelCase`. Descriptive. No abbreviations.

```json
{
  "id": "abc123",
  "companyId": "def456",
  "postingId": "ghi789",
  "stageId": "jkl012",
  "appliedAt": "2026-06-15T10:30:00Z",
  "isArchived": false,
  "hasResumeScore": true,
  "embeddingScore": 0.78,
  "llmScore": 82
}
```

**Response envelope** — use the same shape everywhere:

```json
{
  "data": { ... }
}
```

```json
{
  "error": {
    "code": "INVALID_RESUME_FORMAT",
    "message": "Resume must be a PDF, DOC, DOCX, TXT, or RTF file.",
    "details": { "field": "resume" }
  }
}
```

Error codes: `UPPER_SNAKE_CASE`. Keep them stable, clients code against them.

---

## 11. Database — collections and fields (MongoDB + Mongoose)

### 11.1 Collections

`snake_case`, plural.

```
companies
employer_users
postings
applications
contacts
stages
archive_reasons
stage_changes
resume_scores
resume_files
audit_log
```

### 11.2 Fields

`camelCase`. (Different from SQL convention — Mongoose models surface field names directly as JS property accessors.)

```js
const applicationSchema = new Schema({
  companyId:       { type: ObjectId, required: true, index: true },
  postingId:       { type: ObjectId, required: true, index: true },
  contactId:       { type: ObjectId, required: true, index: true },
  stageId:         { type: ObjectId, required: true },
  archivedAt:      { type: Date, default: null },
  archivedReasonId:{ type: ObjectId, default: null },
  source:          { type: String, required: true },
  sourceDetail:    { type: String },
  resumeFileId:    { type: ObjectId },
  yearsExperience: { type: Number, min: 0, max: 60 },
  coverNote:       { type: String, maxlength: 2000 },
  appliedAt:       { type: Date, default: Date.now },
  lastStageMovedAt:{ type: Date, default: Date.now },
  consent: {
    dpdpAcceptedAt:               { type: Date, required: true },
    retentionConsentGiven:        { type: Boolean, required: true },
    futureOpportunitiesConsentGiven:{ type: Boolean, default: false },
  },
  applicantIp: String,
  userAgent:   String,
  referer:     String,
});
```

### 11.3 Indexes

In Mongoose, declared with `.index()`. Name follows the format `{collection}_{fields_joined}`.

```js
applicationSchema.index({ companyId: 1, postingId: 1 }, { name: 'applications_companyId_postingId' });
applicationSchema.index({ contactId: 1 }, { name: 'applications_contactId' });
```

### 11.4 Foreign-key fields

Always `{referencedThingSingular}Id` in camelCase.

```
companyId, postingId, contactId, applicationId, stageId, archivedReasonId, resumeFileId
```

---

## 12. Environment variables

`UPPER_SNAKE_CASE`. Prefix with the service or category.

```
APPLICATION_NAME=jobmesh
APPLICATION_PORT=8000
APPLICATION_ENVIRONMENT=development

MONGODB_URI=mongodb://localhost:27017/jobmesh
MONGODB_DATABASE_NAME=jobmesh

REDIS_URL=redis://localhost:6379

EMPLOYER_JWT_SECRET=...
SEEKER_JWT_SECRET=...
JWT_EXPIRY_MINUTES=60
BCRYPT_ROUNDS=12

ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
LLM_PROVIDER=anthropic
EMBEDDING_MODEL=text-embedding-3-small

STORAGE_DRIVER=s3
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=jobmesh-resumes
AWS_S3_SIGNED_URL_EXPIRY_SECONDS=900

EMAIL_PROVIDER=resend
RESEND_API_KEY=...
EMAIL_FROM_ADDRESS=hello@jobmesh.in

WHATSAPP_BSP=aisensy
AISENSY_API_KEY=...
```

If a value varies between environments, or is secret, it goes in env. Never hard-code.

---

## 13. Git branches and commit messages

### 13.1 Branches

Format: `type/short-kebab-case-description`.

```
feature/employer-onboarding
feature/resume-scoring-queue
feature/apply-form
fix/applicant-list-pagination
refactor/extract-storage-service
chore/upgrade-mongoose
documentation/naming-conventions
```

Allowed types: `feature`, `fix`, `refactor`, `chore`, `documentation`, `test`.

### 13.2 Commit messages

Conventional Commits style.

```
feature(employer): add posting create endpoint with slug generation

fix(apply): prevent duplicate contact when same email applies twice

refactor(ai): extract resume scoring into background worker

documentation(naming): add multi-tenant safety rules
```

Subject line: 72 characters or fewer, present tense, no trailing period. Optional body after a blank line explains *why*, not *what*.

---

## 14. Anti-patterns to reject in code review

| Anti-pattern | Why it's wrong |
|---|---|
| `data`, `info`, `temp`, `value`, `result`, `thing`, `obj` | Tells the reader nothing |
| `array1`, `array2`, `list1` | Numbered names mean you couldn't think of real ones |
| `getData()`, `doStuff()`, `processIt()` | Verb but no subject |
| `flag = true` | What flag? |
| `i`, `j`, `k`, `c`, `x` even in lambdas | Spell the variable out |
| `myFunction`, `myComponent` | "My" adds no information |
| `utils.ts`, `helpers.ts`, `common.ts` | Junk drawers — split by purpose |
| Abbreviations: `mgr`, `cnt`, `tmp`, `cfg`, `usr`, `app`, `cmp` | Reader has to expand |
| Boolean without `is/has/can/should` prefix | Reads ambiguously |
| Mixed casing in same layer | Pick one per layer |
| `manager`, `handler`, `helper` in a class name | Almost always a sign the abstraction is wrong |
| Magic strings repeated across files | Move to a constants object |
| Duration variable without a unit suffix | Causes real bugs |
| `I` prefix on TypeScript interface | C# baggage, not idiomatic TS |
| `any` in TypeScript | Defeats the type system |
| File over 200 lines | Must be split |
| Import from `pages/seeker/` into `pages/employer/` (or vice versa) | Audience boundary violation |
| Employer query function without `companyId` parameter or `ForCompany` in name | Multi-tenant safety violation |

---

## 15. Domain glossary — use these exact words everywhere

Consistency between code, UI text, database, and conversations matters more than picking the "best" synonym.

| Word | Meaning |
|---|---|
| **Seeker** | A job candidate using the jobmesh.in seeker site. |
| **Employer** | A company using JobMesh Hire to post jobs and manage applicants. The paying customer. |
| **Company** | The employer's organization (e.g., "Acme Agency"). |
| **Employer user** | A person who logs in on behalf of a Company. In MVP, one per Company. |
| **Posting** | A single open job role created by an Employer. (Lever's term. Use this in code and docs, not "Job" — see below.) |
| **Job** | The unified collection that holds both scraped jobs (seeker side) and native postings (employer side). When ambiguous, say "scraped job" or "native posting." |
| **Application** | A single submission by a Contact to a Posting. (Lever's "Opportunity," but renamed to the more universally understood "Application" for clarity.) |
| **Contact** | The person who applied. Separate from Application because one Contact can have multiple Applications. (Lever's term, kept.) |
| **Stage** | A column in the pipeline (Applied, Shortlisted, Interview, Offer, Hired). |
| **Archive reason** | The reason an Application was archived (Underqualified, Culture fit, etc.). |
| **Apply page** | The public, unauthenticated form a Contact fills out to submit an Application. |
| **AI score** | The 0–100 number produced by the resume scoring pipeline. |
| **Pipeline** | The full set of Stages for a Company. |

Do not introduce synonyms. "Posting" and "Job" are *not* interchangeable in employer-side code: postings are always native, jobs include scraped. Pick the right word and stay with it.

---

## 16. Onboarding checklist for new engineers (and Claude Code)

When someone new (human or AI) writes code in this repo, they must:

1. Read sections 0, 1, 2, 3 fully.
2. Skim the rest.
3. When unsure about a name, default to the longer, more readable option.
4. When a file approaches 180 lines, plan the split before adding more.
5. When touching multi-tenant data, double-check the `companyId` filter.
6. If a convention isn't covered here, propose an addition in the same pull request.

This document is living. Update it when a new convention decision is made.

---

## 17. Subdomain routing conventions

JobMesh uses subdomain-based audience separation in production. One Next.js
process serves five hosts; `apps/frontend/src/middleware.ts` reads the `Host`
header and rewrites into the matching route group.

| Subdomain | Audience | Route group | Cookie scope |
|---|---|---|---|
| `jobmesh.in` | Seekers | `(seeker)` | `.jobmesh.in` |
| `hire.jobmesh.in` | Employers | `(employer)` | `.jobmesh.in` |
| `admin.jobmesh.in` | Internal admin | `(admin)` | `.jobmesh.in` |
| `apply.jobmesh.in` | Public apply/careers | `(apply)` | `.jobmesh.in` |
| `api.jobmesh.in` | Backend API | Express server | `.jobmesh.in` |
| `health.jobmesh.in` | Health/status | Health endpoint | none |

This is section 0's two-audience rule made physical at the DNS layer. The rule
that audiences never import across namespaces now has a matching runtime
boundary: an employer page cannot be reached on the seeker host at all.

### Rules

- In development (localhost), path-based routing is used. Subdomain logic is
  skipped entirely — `localhost:3001/employer` behaves exactly as it always has.
- Cross-audience links must use the `subdomain-urls.ts` helpers
  (`getEmployerUrl`, `getApplyUrl`, `getSeekerUrl`, `getAdminUrl`, `getApiUrl`),
  never a hardcoded path that assumes same-origin. A bare
  `<Link href="/employer/login">` from the seeker site is a **404 in
  production** — `/employer` does not exist on `jobmesh.in`.
- Never build a cross-audience URL from `window.location.origin`. It returns
  whichever host the user is currently on, which is exactly the wrong one.
- Navigation *within* one audience stays a relative `next/link` href, so
  client-side routing is preserved. Only cross-audience links go absolute.
- Cookies must set `domain: COOKIE_DOMAIN` so auth works across subdomains. All
  three audiences share `services/auth/auth-cookie-options.js` — never hand-roll
  cookie options at a call site.
- `sameSite` is `'lax'`, never `'strict'`. Strict withholds the cookie on a
  top-level navigation that started on another host, so a link from
  `hire.jobmesh.in` to `jobmesh.in` would land the user logged out. Every
  `*.jobmesh.in` host is same-*site*, so `'lax'` still sends the cookie.
- CORS must allow all `*.jobmesh.in` origins, with `credentials: true`. A
  wildcard `Access-Control-Allow-Origin: *` is illegal alongside credentials —
  the origin must be echoed back.
- The backend API is accessed by the browser via `NEXT_PUBLIC_API_URL`, never a
  hardcoded localhost or a relative path.
- **Server-side** reads use `SERVER_API_ORIGIN` (internal, `127.0.0.1:3000`),
  *not* `NEXT_PUBLIC_API_URL`. SSR runs on the same box as Express; routing an
  internal read back out through public DNS and Nginx adds a round trip and
  makes rendering depend on the edge being up.
- `robots.txt` is per-host. `health.*`, `api.*`, `hire.*` and `admin.*` disallow
  all crawlers; only the seeker and apply hosts are indexable.
- New subdomains require three changes: a DNS record (the `*.jobmesh.in`
  wildcard usually covers it), an Nginx `server_name` entry, and a middleware
  routing rule. Unknown subdomains 404 rather than falling through to an
  audience.

---


*End of naming conventions.*
