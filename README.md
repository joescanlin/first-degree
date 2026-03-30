<p align="center">
  <img src="./assets/first-degree-logo.svg" alt="First Degree" width="420" />
</p>

# First Degree

Understand the health patterns that run in your family.

`First Degree` is a public project for helping people capture useful family health context with very little setup. Start with what you already know about parents, siblings, and grandparents. Turn scattered memory into a clearer picture you can use in future care conversations.

The long-term goal is larger than a family history form.

We want to make it easier for people to build a living, structured health context profile over time, starting with the one piece many people can provide from memory: family history.

## Why This Exists

Most people do not have their family health history written down.

They know fragments:

- a parent had high blood pressure
- a grandparent had colon cancer
- diabetes runs in one side of the family
- someone died young, but the details are unclear

That information can matter. It can shape what to ask, what to mention to a clinician, what screening to think about, and what details are still worth tracking down.

`First Degree` is built to make that first step easy.

## What First Degree Does

The core experience is simple:

1. Add yourself and a few close relatives.
2. Mark major conditions you know about.
3. Get a clear family-pattern summary.
4. See what details are missing and worth asking about.
5. Save a structured profile you can build on over time.

The first version is focused on a few practical outcomes:

- a family health summary in plain language
- a list of questions to ask your relatives
- a shareable note for future doctor visits
- a structured profile that can become more useful as you add to it

## Project Direction

`First Degree` starts with family history because it is one of the few high-value health-context layers people can often provide without records, integrations, or a heavy onboarding flow.

Over time, the project is intended to expand into a broader health context profile, including areas like:

- medications
- allergies
- known conditions
- surgeries and hospitalizations
- uploaded medical documents
- longitudinal summaries

Family history is the entry point, not the finish line.

## Design Principles

- Start with information people already know.
- Deliver value in the first session.
- Keep uncertainty explicit.
- Avoid false precision.
- Organize context without pretending to diagnose.
- Make the profile easy to update over time.
- Prefer structured data over vague free text.

## What This Project Is Not

`First Degree` is not:

- a diagnostic engine
- a substitute for medical advice
- a risk-score gimmick
- a public-web scraper for personal health information
- a consumer genetics interpretation product

It is a tool for organizing family health context and turning it into something more usable.

## Status

This repository is in active buildout.

The initial public focus is:

- low-friction family history capture
- family-pattern summary generation
- missing-information prompts
- a retained profile that can grow over time

## Planned Repository Shape

As the project grows, this repo will likely include:

- `app/` or `web/` for the user-facing product
- `packages/` or `lib/` for shared types and profile logic
- `prompts/` for bounded language tasks and structured prompt workflows
- `templates/` for profile and export structures
- `docs/` for product, architecture, and safety notes

## Safety and Scope

Family history is important, but it is also often incomplete and uncertain.

This project is being built with a few clear boundaries:

- unknown stays unknown
- low-confidence family anecdotes should not become high-confidence medical facts
- outputs should stay descriptive rather than predictive unless there is a justified, transparent method behind them
- the product should help people prepare for medical conversations, not replace them

## Inspiration

This project is informed by a few different ideas:

- structured, evidence-aware research workflows like [`autoresearch-genealogy`](https://github.com/mattprusak/autoresearch-genealogy)
- ambitious public AI systems work like [`AI-Scientist-v2`](https://github.com/SakanaAI/AI-Scientist-v2)
- the practical reality that useful health software often starts with better organization, not bigger claims

The goal is not to copy those projects. The goal is to apply some of the same discipline around structure, iteration, and evidence to a very different domain.

## Contributing

Contributions are welcome as the repository takes shape.

In the near term, the highest-value contributions will likely be around:

- product framing
- family history UX
- structured data modeling
- profile templates
- careful prompt and summarization design
- safety review

## Notes

Nothing in this repository should be treated as medical advice.
