# Scorecard rubric

Every test case is scored on three axes. The runner writes one row per case
to `evals/results/<timestamp>.csv` with the raw scores and an aggregate
pass/fail. Manual grading goes in the `reasoning_quality` column after the
run — the runner leaves it blank.

## 1. Identification correct — y / n

The model's `name` + `description` must refer to the same kind of item as
the ground-truth description in the test case. Brand and model are nice but
not required to pass — generic-category correctness is enough.

- **y** — "ryobi 18v cordless drill" vs ground truth "cordless drill, ryobi"
- **y** — "stand mixer" vs ground truth "kitchenaid stand mixer" (brand
  missed but category right)
- **n** — "blender" vs ground truth "stand mixer"

## 2. Price in range — y / n

`suggestedPrice` must fall within the test case's `acceptablePriceRange`
(inclusive). The range is set by the test author and reflects what a real
garage-sale shopper would consider a reasonable sticker price for that item
in that condition.

- **y** — suggested $15, range $10–$25
- **n** — suggested $5, range $10–$25
- **n** — suggested $40, range $10–$25

## 3. Reasoning quality — 1 / 2 / 3

Manual grade after the run. Read `reasoning` and `usedCompIds`.

- **3 (good)** — reasoning cites specific comps, names the discount
  applied, and the chain from comps → price is clear and correct.
- **2 (okay)** — reasoning is plausible but vague, OR cites comps but the
  arithmetic is sloppy, OR cites comps that aren't great matches.
- **1 (bad)** — reasoning is hand-wavy, contradicts the comps, ignores the
  comps entirely, or hallucinates facts not in the input.

## Aggregate pass

A test case passes if **identification = y AND price = y**. Reasoning quality
is a quality signal but not a gate — a case that gets the right answer with
weak reasoning is still passing, it just goes on the list of prompts to
tune.

## What to look at after each run

1. Pass rate across all cases. Target ≥ 70% before considering the feature
   usable; ≥ 85% before shipping.
2. Failures bucketed by axis. If identification is the bottleneck, tune
   `prompts/identify-item.md` or capture more representative training
   photos. If price is the bottleneck, look at the discount bands in
   `prompts/suggest-price.md` and the quality of the retrieved comps.
3. Reasoning-quality histogram. A run with 90% pass but mostly 1s on
   reasoning means the model is getting lucky, not understanding.
