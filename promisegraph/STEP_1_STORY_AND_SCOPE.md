# Step 1 — Lock the story and scope

## Product decision

**PromiseGraph** is a commitment-aware customer escalation agent. Its core question is: “Why is Bluepeak angry, and what should we do next?” It answers by following relationships across Bluepeak’s support history, customer-facing promises, SLA events, a known product bug, owners, and missing follow-ups.

The differentiator is a Promise Ledger: promises are first-class, time-bound graph nodes with source, speaker, recipient, due date, status, dependencies, and closure evidence. The system detects overdue or orphaned commitments and exposes a transparent commitment-debt ranking. The ranking is a triage heuristic with visible factors, not a claim that the system objectively measures emotion or churn.

## One submission, designed to demonstrate all three tracks

We will build one coherent project and explicitly show three capabilities in the demo and submission narrative:

- **Track 1 — Agents That Act on Connected Data:** graph traversal joins repeat tickets to the export bug, SLA breach, and current engineering owner; it informs the suggested routing.

- **Track 2 — Agent Memory and Coordination:** customer history and case state persist in the graph. Three role routines—Investigator, Commitment Auditor, and Case Coordinator—read/write shared findings. Tenant-scoped records include a tenant ID. In the hackathon MVP, routines run sequentially rather than as independent autonomous agents.

- **Track 3 — Company Brain:** the graph connects customer, case, tickets, contract, call note, feature, bug, people, and ownership. Every material claim links to a source.

The attached hackathon brief says entrants may build for one or all three tracks. We should verify the submission form’s exact track selection and entry limits before final submission. We will not create three disconnected demos; the same PromiseGraph experience will make each track’s contribution visible.

## Demo narrative

Bluepeak Robotics has three tickets about CSV exports dropping custom fields. Kavya, the account manager, promised a fix by October 14. A later support note promised an engineering status by October 15 at noon. Neither promise has a completed customer follow-up. The underlying issue is BUG-77, which remains open and is owned by Riya Kulkarni. Bluepeak’s critical escalation also breached the contract’s one-hour initial-response SLA. The contract requires timely initial response but does not guarantee a fix delivery date.

The agent’s safe recommendation is to ask the engineering owner for a confirmed checkpoint and have the account owner update Bluepeak. It must not invent a new delivery date or send an external message.

## Locked MVP boundaries

- Use synthetic Bluepeak data only.

- Start with curated, known promise records; do not make automatic extraction a core dependency.

- Build one graph-backed diagnosis flow and one draft-only customer reply flow.

- Keep commitment status and ranking deterministic and explainable.

- The LLM may phrase a response from verified graph evidence; it may not invent facts, owners, or commitments.

- Do not send emails, update live tickets, or perform other external actions.

- Make the multi-hop evidence path visible in the interface.

## Step 1 acceptance criteria

- [x] One memorable demo question and answer are agreed.

- [x] The novelty is concrete and demonstrable: commitment lineage and closure-loop detection.

- [x] A synthetic seed dataset captures tickets, promises, SLA, bug, owners, sources, and missing follow-ups.

- [x] The project’s Track 1, Track 2, and Track 3 evidence is explicitly mapped.

- [ ] Next: load this dataset into FalkorDB and verify the first cross-ticket traversal.

## Source of truth

`data/bluepeak_seed.json` is the initial synthetic data contract. IDs are stable across nodes, relationships, and expected findings. Update it before changing backend assumptions so the seed graph and demo story remain consistent.

