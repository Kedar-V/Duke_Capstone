# Assignment Policy

## Purpose
This document defines how final student-to-project assignments should be generated, reviewed, and published after ranking submissions close.

Goals:
- maximize alignment with student preferences
- enforce cohort and capacity constraints
- respect teammate restrictions
- provide a transparent and auditable process
- allow controlled admin overrides

## Scope
This policy applies to the final placement process for capstone projects and student teams.

In scope:
- eligibility checks
- assignment optimization and tie-breaking
- fairness and quality guardrails
- manual review and publish workflow
- rerun and reopen handling

Out of scope:
- grading
- project execution tracking after assignment
- advisor workload balancing unless explicitly modeled

## Inputs
Primary input datasets:
- submitted rankings: `rankings`, `ranking_items`
- student profile and cohort data: `users`, `students`
- project data and cohort data: `projects`, `cohorts`
- teammate preferences: `teammate_preferences`
- admin configuration values:
  - project capacity (`min_slots`, `max_slots`) per project
  - assignment run settings (weights, fairness options, random seed)

## Definitions
- assignment run: one execution of the assignment engine using a fixed snapshot and config
- hard constraint: rule that cannot be violated
- soft constraint: preference that improves score but can be violated
- satisfaction score: numeric value computed from ranking position and bonuses/penalties
- publish: action that makes assignment results official for the cohort

## Policy Timeline
1. Ranking window open:
- students can update rankings and teammate preferences

2. Ranking lock:
- students submit rankings
- rankings are marked submitted and locked

3. Snapshot freeze:
- admin triggers assignment run
- engine uses a stable snapshot of the submission state

4. Review:
- admin reviews proposed assignments, diagnostics, and fairness metrics

5. Publish:
- admin publishes final assignments
- students can view assigned project

## Eligibility Rules (Hard Constraints)
A student is eligible for matching when all conditions are true:
- active user (`deleted_at` is null)
- role is student, unless admin explicitly enables non-student inclusion for testing
- has a submitted ranking
- belongs to same cohort as candidate projects
- not already finalized in a published assignment for the same cohort/run

A project is eligible when:
- active (`deleted_at` is null)
- in the target cohort
- has defined capacity and available slots

Invalid or incomplete records are excluded and logged.

## Teaming Rules
Hard rules:
- `avoid` teammate pairs must not be assigned to the same project team

Soft rules:
- `want` teammate pairs receive a bonus if assigned together

Safety rule:
- teammate requests cannot violate cohort or capacity constraints

## Scoring Policy
Base ranking points (recommended default):
- rank 1: 100
- rank 2: 90
- rank 3: 82
- rank 4: 75
- rank 5: 68
- rank 6: 60
- rank 7: 52
- rank 8: 43
- rank 9: 32
- rank 10: 20
- unranked project: 0

Optional modifiers:
- teammate `want` satisfied: +8 (per mutually satisfied pair)
- project fit bonus (if rubric available): +0 to +10
- assignment outside top 10: strong penalty (recommended -100)

Final objective:
- maximize total weighted satisfaction across all students

## Fairness Guardrails
The optimization should include fairness constraints so outcomes are not overly skewed.

Recommended fairness constraints:
- minimize number of students assigned outside top 5
- minimize variance of satisfaction score across students
- enforce upper bound on students assigned outside top 10 (target: zero)

Fallback fairness target when full optimization is infeasible:
- maximize minimum student score first, then maximize total score

## Capacity Policy
Each project must define:
- minimum team size (`min_slots`)
- maximum team size (`max_slots`)

Constraints:
- assigned team size cannot exceed `max_slots`
- if feasible, assigned team size should meet `min_slots`

If the problem is infeasible with strict minimums:
- engine may relax `min_slots` in controlled order
- all relaxations must be recorded in run diagnostics

## Assignment Engine
Recommended engine types:
- min-cost max-flow
- mixed-integer programming (MIP)

Reason:
- supports hard constraints, soft scoring, capacities, and fairness in one run

Engine requirements:
- deterministic output when random seed is fixed
- emit diagnostics and unsatisfied constraints
- produce explainability per assignment

## Tie-Breaking Policy
When two candidate assignments have equal objective score, apply deterministic tie-breakers in order:
1. better fairness metric
2. higher count of top-3 placements
3. lower count of outside-top-5 placements
4. deterministic random seed order

The seed value must be stored with run metadata.

## Infeasibility Handling
If no feasible solution exists:
- mark run as `infeasible`
- provide explicit reasons (capacity mismatch, avoid constraints, missing submissions)
- recommend corrective actions (increase capacity, reopen specific submissions, fix data)
- do not publish partial results automatically

## Manual Override Policy
Admin may override assignment proposals during review.

Rules for overrides:
- every override must include reason code and free-text note
- override must still satisfy hard constraints
- override author and timestamp are logged

Suggested reason codes:
- `client_interview_result`
- `accessibility_or_schedule_constraint`
- `data_correction`
- `exception_approval`

## Publish Policy
Publish prerequisites:
- run status is `feasible` or approved with documented overrides
- admin confirms cohort and run id
- post-publish validation passes

Post-publish actions:
- assignments become read-only
- students and admins can view final assignment
- publish event is logged in audit trail

## Reopen and Rerun Policy
Reopen may be allowed before publish or by exception after publish.

When reopened:
- affected student submission unlocks
- previous run remains preserved
- rerun must create a new run id and full audit record

No run result should be overwritten in place.

## Audit and Transparency
Each assignment run should persist:
- run id
- cohort id
- timestamp
- config values and weights
- random seed
- input snapshot hash/counts
- objective scores and fairness metrics
- infeasibility diagnostics
- override logs
- publish metadata

Student-facing transparency (recommended):
- assigned project
- rank used for assignment
- concise explanation message

## Security and Access Control
- only admins can run, review, override, or publish assignments
- students can view only their own final assignment and status
- sensitive teammate preference content remains protected
- all admin actions are logged

## Data Quality Checks Before Run
Required checks:
- no duplicate ranks per student
- no duplicate project entries in a student ranking
- project capacities are present and valid (`0 < min_slots <= max_slots`)
- cohort ids are consistent on users and projects
- no deleted records included

## Versioning and Change Control
- policy version should be incremented on rule changes
- run records must store policy version
- changes to scoring or fairness defaults require approval and changelog entry

## Default Recommended Configuration (Initial)
- include submitted users only
- include non-students: false in production, true only for testing
- ranking weight: 1.0
- teammate-want bonus: +8
- outside-top-10 penalty: -100
- fairness objective enabled
- deterministic seed: required

## Implementation Notes for This Repository
Current repository state already supports:
- cohort scoping
- ranking submission lock
- teammate preference capture
- admin review/export/reopen for ranking submissions

To fully implement this policy, add:
- project capacity fields in project schema and admin UI
- assignment run tables and endpoints
- optimization engine service
- publish endpoint and student assignment view

## Policy Ownership
Policy owner: Program administration
Technical owner: Engineering team
Review cadence: each cohort cycle and after major algorithm updates
