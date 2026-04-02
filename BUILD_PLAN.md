# First Degree Build Plan

## Decision

We should build `First Degree` as a separate repository, not as a fork of `autoresearch-genealogy`.

## Why Not Fork

`autoresearch-genealogy` is useful as a pattern library, but it is not the right substrate for this product.

What it does well:

- structured autonomous research loops
- vault-style canonical state
- confidence tiers and source hierarchy
- discrepancy and gap analysis workflows

Why it should not be the codebase we fork:

- genealogy has different source assumptions than health
- the early `First Degree` product is a consumer capture workflow, not a deep-research workflow
- health requires a more restrictive safety model
- our initial user experience is app-first, not prompt-pack-first
- the long-term integration path points toward Certuma and MedCanon, not an Obsidian-style research vault as the primary product

So the right strategy is:

`build a separate public repo, borrow the useful ideas, and reimplement them for the health domain`

## What We Borrow

From `autoresearch-genealogy`, we should borrow:

- explicit workflow decomposition
- evidence tiers
- source hierarchy
- open-question tracking
- discrepancy logging
- gap analysis
- structured templates

From projects like `AI-Scientist-v2`, we should borrow:

- clear system framing in the README
- a public-facing explanation of what the project is and is not
- explicit safety and operational boundaries
- modular pipeline thinking

## Product Strategy

The build should happen in three layers.

### Layer 1: Entry Product

This is the public MVP.

Goal:

- help a user build a useful family health history profile in minutes

Core user actions:

- add self and close relatives
- mark major condition families
- capture unknowns explicitly
- get a summary and next questions

Outputs:

- family-pattern summary
- questions to ask family
- shareable clinician note
- retained structured profile

### Layer 2: Retained Profile

After the initial family-history win, the product expands into a broader personal health context profile.

Next profile modules:

- medications
- allergies
- known conditions
- surgeries and hospitalizations
- personal health timeline
- uploaded records

This is where long-term retention comes from.

### Layer 3: MedCanon-Adjacent Context Engine

Once the retained profile is real, it can later feed bounded context into Certuma and MedCanon systems.

That later integration can support:

- better intake questions
- richer clinician handoff
- longitudinal summaries
- more useful personalization

The public repo should not begin with MedCanon coupling, but it should keep the data model compatible with future integration.

## Recommended Initial Architecture

### 1. App Shell

Build a standalone web app first.

Recommended initial stack:

- Next.js or a similarly fast React app framework
- TypeScript
- a small shared schema layer for profile objects
- simple hosted auth once we are ready for accounts

Why:

- fast iteration on product UX
- easy public deployment
- natural path into account-backed saved profiles

### 2. Structured Profile Store

Define the profile model early, even if persistence starts simple.

Core objects:

- `PersonProfile`
- `FamilyMember`
- `FamilyHistoryCondition`
- `FamilyHistoryProfile`
- `OpenQuestion`
- `ShareSummary`

The first implementation can use simple app storage plus a server-backed database once the product hardens.

### 3. Summary Generation Layer

Use bounded language generation only after the structured state exists.

Initial model tasks:

- convert structured family-history state into a plain-language summary
- generate questions to ask family
- generate a clinician-share note

The model should not decide the truth of the family history. It should only turn settled structured state into usable language.

### 4. Evidence and Confidence Layer

Even in the MVP, we should support:

- `known`
- `unknown`
- `possible`
- `not_reported`

Later we can deepen this into stronger evidence tiers and provenance.

### 5. Export Layer

The app should always be able to output:

- human-readable family summary
- machine-readable profile JSON

This keeps the product extensible and future-integratable.

## Phase Plan

## Phase 0: Repo Setup and Public Framing

Deliverables:

- `README.md`
- initial build plan
- repo scaffold
- project license decision
- product copy seed

## Phase 1: Family History MVP

Deliverables:

- onboarding flow for self, parents, siblings, grandparents
- condition picker for a compact condition set
- unknown-state handling
- summary generation
- missing-question generation
- saveable local draft state

Success bar:

- a user can go from blank state to useful summary in one session

## Phase 2: Saved Profiles and Return Visits

Deliverables:

- account-backed persistence
- edit flow
- clinician-share export
- profile resume experience
- profile completion prompts

Success bar:

- users return and update their family history over time

## Phase 3: Personal Health Context Expansion

Deliverables:

- medications module
- allergies module
- known conditions module
- surgeries/hospitalizations module
- timeline module

Success bar:

- the repo evolves from family-history product into broader health-context product

## Phase 4: Deeper Research and Context Workflows

This is where the `autoresearch-genealogy` influence becomes more direct.

Possible additions:

- open-question tracker for missing family details
- discrepancy workflows
- family-history completeness audits
- imported document extraction
- guided family interview workflows

Success bar:

- the product helps users improve profile quality over time, not just capture a first draft

## Phase 5: Certuma / MedCanon Integration Path

Deliverables:

- export contracts for future bounded context use
- family-history snapshot schema
- compatibility with longitudinal context systems

Success bar:

- `First Degree` can stay public and standalone while still producing structured outputs that later systems can consume

## What To Build First in This Repo

The first implementation pass should create:

1. a clean landing page
2. a very small onboarding flow
3. a family member graph model
4. a condition selection UI
5. a summary screen
6. a JSON export shape

That is enough to test the wedge.

## What Not To Build First

Do not start with:

- EHR integrations
- genetics imports
- predictive risk scores
- broad AI chat
- complicated family pedigree rendering
- deep MedCanon coupling

Those are all later-stage additions. They are not the right first step.

## Recommended Repo Strategy

Keep the repo public and standalone.

Use `First Degree` as:

- a public product repo
- a design and UX surface for early users
- a place to develop the family-history and context profile model in the open

Do not mirror the `medcanon-dsl` internal repo structure.

When shared logic eventually matters, we can either:

- publish small reusable packages
- define a stable export contract between repos
- keep MedCanon-specific logic in Certuma repos and keep `First Degree` focused on public product experience

## Bottom Line

Build `First Degree` as its own product.

Borrow the best ideas from `autoresearch-genealogy`, especially around structure, evidence, and iteration, but do not fork it.

The first milestone is not a deep research engine. It is a fast, public, useful family-history product that gives people value from what they already know.
