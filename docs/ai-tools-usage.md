# AI Tools Usage Disclosure

> **Academic integrity addendum** — to be submitted with the ICS 534 Cloud Computing
> group deliverable, per Ashesi University's *Policy on AI Use for Academic Work*.
>
> **Status:** draft. Sections 2, 3 and 5 are filled in from the repository's
> commit trailers and pull requests (8 Oct 2026). Two items still need the team:
> the instructor's authorisation (§1) and the accuracy of the reflection
> statement (§4). This document is deliberately conservative: it states only
> what we can evidence, and does not claim AI use was authorised where that has
> not been confirmed in writing.

**Course:** ICS 534 Cloud Computing
**Group:** 3 — Highlanders
**Milestone:** PROSIT 1
**Repository:** `ASU-MICS-2028/cc-group-3-prosit-1`
**Date:** 2026-10-08

---

## 1. The policy we are complying with

Ashesi's policy states, in part:

> "If and when a faculty member explicitly allows the use of AI for a given course
> or assignment, students must declare when and how it was used, including all
> applicable prompts, in an addendum submitted with the assignment."
>
> "Unless explicitly allowed by a faculty member for a given course or assignment,
> students should not use generative AI tools … for academic work."

This document is that addendum. **[Confirm here that the ICS 534 instructor
explicitly authorised AI use for this milestone, and quote the authorising
statement/date. If permission was granted only for specific parts of the work,
list which parts.]**

---

## 2. Tools used

| Tool | Maker | How it was used |
|---|---|---|
| **Claude Code** | Anthropic | Agentic coding assistant in the developer's terminal/IDE (Joseph Etse) |
| **Command Code** | Command Code | Agentic coding assistant in the developer's terminal (Eugene Sewor) |

Both are confirmed by `Co-Authored-By` trailers in the commit history (§3).
**[Team: add any other tool a member used, including for the frontend or the
backend migration, whose commits carry no trailer.]**

---

## 3. When and how AI was used

AI assistance was used during **implementation and documentation**, under human
direction, for the following kinds of work:

- **Infrastructure-as-code.** Drafting and refactoring Terraform modules
  (`infra/`), e.g. the network/compute/database/storage/observability modules.
- **Backend service.** Scaffolding and refactoring the API service
  (`backend/`) and its container build.
- **Documentation.** Drafting and editing the system dossier (`docs/`) and
  module READMEs.
- **Tests and CI.** Scaffolding CI workflows (`.github/workflows/`) and test
  cases.
- **Debugging.** Diagnosing build, deploy, and configuration errors.

**Evidence in the repository.** Of the 58 non-merge commits on `main`
(4–8 Oct 2026), 20 carry an AI co-author trailer:

| Tool | Commits | Member | What they covered |
|---|---|---|---|
| Command Code (`CommandCodeBot`) | 11 | Eugene Sewor | Observability module (SNS, alarms, budget, dashboard), CloudWatch app logs, S3 remote state, Arkesel secret container, alarm emails in gitignored tfvars, Architecture v3 diagram, this disclosure's first draft, AI-persona clean-up |
| Claude Code (`Claude Opus 5.5`) | 9 | Joseph Etse | Twi and Ewe translations and ADR-010; CI running the frontend tests; the IMDS hop-limit fix; the full backend on Postgres (`backend/`, migrations, tests) with its infra wiring; the Wallet checkout button and Me profile; two follow-up fixes |

Pull requests #11 and #20–#28 also say "Generated with Claude Code" in their
descriptions, and Joseph's later documentation, clean-up and disclosure PRs
were prepared the same way. A commit without a trailer is not evidence that no
AI was used; members confirm their own work in §6.

**Human oversight.** Every AI-assisted change was reviewed by a team member
before it was committed. Changes landed through pull requests with review
required by `CODEOWNERS`, and were gated by CI (frontend lint/tests/build, backend tests on PGlite and Postgres 16
with an image boot test, `terraform fmt + validate`). No AI output was merged without a human reading,
testing, or running it.

---

## 4. What AI was **not** used for

- No fabrication of project data or results. The network-latency measurements
  in `docs/empirical-research.md` were collected by the group from Ghana, not
  generated.
- No submission of AI-generated text as an individual's own reflection.
  **[Team: confirm this is accurate for the reflective/analysis components, or
  revise.]**
- AI was not used for any assessment component for which the instructor did not
  authorise it.

---

## 5. Prompts and session logs

The policy asks for "all applicable prompts". The prompts are recorded verbatim
in each tool's session history on the member's machine (Claude Code keeps its
transcripts locally; so does Command Code). We will attach exports of those
transcripts if the instructor asks, and give representative prompts here.

**Command Code (Eugene Sewor), from the first draft of this document:**

- "Analyse the repository structure and the four tiers (client, API, data,
  cloud) and summarise the architecture."
- "Add an `observability` Terraform module: an SNS topic, CloudWatch alarms for
  ALB/RDS/EC2, and a monthly AWS Budget, then wire it into the root module."
- "Update the CI workflow to smoke-test the Node.js backend instead of the
  previous Python service."

**Claude Code (Joseph Etse), in the member's own words:**

- "Work on the language side of things" (the "Twi, Ewe and Dagbani text" item
  from the frontend PR's *Not done yet* list), followed by "Can you use Google
  Translate…?" and the decision "make it a decision point to remove Dagbani for
  now… use yours" (ADR-010).
- "Background Sync after the app is closed is not built" → "start on it"
  (ADR-012).
- "Resolve conflicts but do not commit anything" (PR #15).
- "Fix this" (the failing deploy: `InstanceRefreshInProgress`).
- "Go through everything including the codebase and list out all the things
  that are yet to be done."
- "We need to complete everything… tackle everything outstanding one by one…
  we have to cover for our teammates" (the backend, its infra, CI and docs).

**[Team: add any other member's prompts you consider applicable.]**

---

## 6. Acknowledgement and accountability

We understand that intellectual contributions from others *or machines* must be
acknowledged, and that presenting AI-generated content as our own unaided work
would be academic dishonesty. We authored the design decisions, reviewed and
verified all AI-assisted output, and take full responsibility for everything in
this submission.

| Name | Role | Contribution reviewed / owned | Signature |
|---|---|---|---|
| Joseph Etse | Project Manager | Architecture, coordination | |
| Eugene Sewor | Cloud / DevOps | Terraform, AWS, CI/CD | |
| Elise Kennedy-Angbo | Data Lead | Backend service, database schema | |
| Perfect Avugla | Frontend Lead | Offline-first PWA, sync | |

---

## 7. Where to verify this

- Commit history and pull requests on `ASU-MICS-2028/cc-group-3-prosit-1`.
- CI runs: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`.
- Per-module documentation under `infra/` and `docs/`.
