# Required Status Checks

This document is the canonical list of the status checks that gate merges into
`main`. The check names below **must** stay in sync with the `contexts` array in
[`scripts/apply-branch-protection.sh`](../scripts/apply-branch-protection.sh),
which programmatically enforces them via the GitHub branch-protection API.

For the full branch-protection policy (reviews, linear history, conversation
resolution, owner bypass) see [`docs/branch-protection.md`](./branch-protection.md).

## Required checks

Every pull request — and every group evaluated by the merge queue — must pass all
of the following before it can merge:

| Check (status context) | Source workflow (`file`) | What it verifies |
|---|---|---|
| `frontend` | CI (`ci.yml`) | Frontend lint, a11y, unit tests, and production build. |
| `Verify lockfiles are in sync` | CI (`ci.yml`) | `npm ci` and `cargo metadata --locked` accept the committed lockfiles. |
| `Contract MSRV` | CI (`ci.yml`) | Contract builds on the minimum supported Rust version. |
| `contract-checks / check` | Contract CI (`ci-contract.yml` → `contract-checks.yml`) | Contract `cargo fmt --check`, `clippy -D warnings`, WASM build, and `cargo test`. |
| `cargo-deny (advisories, licenses, bans, sources)` | Contract CI (`ci-contract.yml`) | `cargo deny` policy on contract dependencies. |
| `frontend-lint` | Lint & Format (`ci-lint.yml`) | ESLint and Prettier checks on the frontend. |
| `gitleaks` | Gitleaks Secret Scanning (`gitleaks.yml`) | No secrets in the PR's commits. |
| `Validate gitleaks configuration` | Gitleaks Secret Scanning (`gitleaks.yml`) | The gitleaks config parses and catches the known test fixtures. |
| `Cargo Audit` | Dependency Audit (`audit.yml`) | `cargo audit` on contract dependencies. |
| `NPM Audit` | Dependency Audit (`audit.yml`) | `npm audit` on frontend production dependencies. |

> The status context is the **check-run name** GitHub shows on the PR, not the
> workflow name:
>
> - a job's `name:` if it has one (`NPM Audit`), otherwise its job id (`frontend`);
> - `name (matrix value)` for matrixed jobs;
> - `<caller job> / <called job>` for jobs inside a reusable workflow
>   (`contract-checks / check`).
>
> Checks are pinned to the GitHub Actions app (`app_id` 15368), so only a run
> created by Actions can satisfy them.

Jobs gated by path filters (e.g. `frontend`, `Contract MSRV`) are **skipped** when a
PR doesn't touch their area. GitHub treats a skipped required check as passing, so
these do not block unrelated PRs.

**Deliberately not required:** `rust-and-contract` (disabled with `if: false` in
`ci.yml`; `contract-checks / check` covers it), `Frontend (Node …)` (non-blocking
forward-compat matrix), `Storybook build`, `CodeQL`, and the Docker image build.

### Informational (not yet blocking)

| Check | Source | Notes |
|---|---|---|
| `codecov/project` | Codecov | Project coverage; informational until thresholds are validated. |
| `codecov/patch` | Codecov | Patch coverage (≥80% on changed lines); informational for now. |

These are intentionally **not** in `apply-branch-protection.sh`. See the promotion
steps in [`docs/branch-protection.md`](./branch-protection.md#promotion-to-blocking).

## Merge queue support

The workflows that own the required checks — `ci.yml`, `ci-contract.yml`,
`ci-lint.yml`, `audit.yml`, and `gitleaks.yml` (plus `codeql.yml`) — trigger on the
`merge_group` event
so their checks are re-run against the exact commit the merge queue will merge:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  merge_group:
```

In `ci.yml` and `ci-contract.yml` the path-filter change-detection step is skipped
on `merge_group` events and the gated jobs run unconditionally, so every required
check reports a result to the queue instead of being silently skipped (a skipped
required check would stall the queue). `gitleaks.yml`'s jobs are skipped on
`merge_group` (the PR run already scanned the commits); a skipped check counts as
passing, so the queue is not blocked.

## Keeping this in sync

When a gated job is added, removed, or **renamed** (including changing its
`name:`, its job id when it has no `name:`, or a reusable-workflow caller id):

1. Find the exact new check name: open any PR's **Checks** tab, or run
   ```bash
   gh api "repos/<owner>/<repo>/commits/<sha>/check-runs?per_page=100" \
     --paginate -q '.check_runs[].name' | sort -u
   ```
2. Update the `REQUIRED_CHECKS` array in `scripts/apply-branch-protection.sh`.
3. Update the **Required checks** table above to match, exactly, in the same PR.
4. Preview the change — this only needs read access and changes nothing:
   ```bash
   bash scripts/apply-branch-protection.sh --dry-run
   ```
5. After the PR merges, a maintainer with admin rights applies it:
   ```bash
   bash scripts/apply-branch-protection.sh
   ```
   The script is idempotent: it compares the live settings with the desired ones
   and only sends an update when they differ, so it is safe to re-run.

> [!WARNING]
> Rename the job and update branch protection together. If a required check is
> renamed in a workflow but not here, GitHub waits forever for the old name and
> every PR shows "Expected — Waiting for status to be reported" and cannot merge.
