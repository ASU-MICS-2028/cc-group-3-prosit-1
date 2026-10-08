# AI Tools Usage Disclosure

> **Academic integrity addendum** — to be submitted with the ICS 534 Cloud Computing
> group deliverable, per Ashesi University's *Policy on AI Use for Academic Work*.
>
> **Status:** draft. Complete the bracketed `[…]` items and confirm instructor
> permission before submission. This document is deliberately conservative: it
> states only what we can evidence, and does not claim AI use was authorised
> where that has not been confirmed in writing.

**Course:** ICS 534 Cloud Computing
**Group:** 3 — Highlanders
**Milestone:** PROSIT 1
**Repository:** `ASU-MICS-2028/cc-group-3-prosit-1`
**Date:** 2026-10-07

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
| **Claude Code** | Anthropic | Agentic coding assistant in the developer's terminal/IDE |
| **Command Code** | Command Code | Agentic coding assistant in the developer's terminal |

No other generative-AI tools were used for this milestone. **[Remove either row
if you did not actually use that tool; add any others that were used.]**

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

**Human oversight.** Every AI-assisted change was reviewed by a team member
before it was committed. Changes landed through pull requests with review
required by `CODEOWNERS`, and were gated by CI (`backend smoke test`,
`terraform fmt + validate`). No AI output was merged without a human reading,
testing, or running it.

---

## 4. What AI was **not** used for

- No fabrication of project data or results. The network-latency measurements
  in `docs/empirical-research.md` were collected by the group from Ghana, not
  generated.
- No submission of AI-generated text as an individual's own unauthorship
  reflection. **[Confirm this is accurate for the reflective/analysis
  components, or revise.]**
- AI was not used for any assessment component for which the instructor did not
  authorise it.

---

## 5. Prompts and session logs

The policy asks for "all applicable prompts". Our prompts are recorded verbatim
in the tool session histories. **[Decide how to satisfy this: e.g. attach an
export of the session transcripts, or include a representative sample of prompts
here.]**

Representative prompts used during this milestone:

- "Analyse the repository structure and the four tiers (client, API, data,
  cloud) and summarise the architecture."
- "Add an `observability` Terraform module: an SNS topic, CloudWatch alarms for
  ALB/RDS/EC2, and a monthly AWS Budget, then wire it into the root module."
- "Update the CI workflow to smoke-test the Node.js backend instead of the
  previous Python service."

**[Replace/extend with the actual prompts you consider 'applicable'. Keep the
full transcript available in case the instructor asks for it.]**

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
