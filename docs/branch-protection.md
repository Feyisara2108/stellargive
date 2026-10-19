# Branch Protection & Required Status Checks

To ensure code quality, security, and stability, the `main` branch of StellarGive is protected. This document explains the protection rules, the status checks that must pass before merging any pull request, and how to apply these settings.

---

## Required Status Checks

Every pull request targeted at the `main` branch must pass the following GitHub Actions
checks before it can be merged. The names are the exact check-run names GitHub reports;
the canonical list, with what each one verifies, lives in
[`docs/required-status-checks.md`](./required-status-checks.md).

| Check Name | Source Workflow |
|---|---|
| `frontend` | `CI` |
| `Verify lockfiles are in sync` | `CI` |
| `Contract MSRV` | `CI` |
| `contract-checks / check` | `Contract CI` |
| `cargo-deny (advisories, licenses, bans, sources)` | `Contract CI` |
| `frontend-lint` | `Lint & Format` |
| `gitleaks` | `Gitleaks Secret Scanning` |
| `Validate gitleaks configuration` | `Gitleaks Secret Scanning` |
| `Cargo Audit` | `Dependency Audit` |
| `NPM Audit` | `Dependency Audit` |

`codecov/project` and `codecov/patch` also report on every PR but are informational
until promoted (see below).

---

## Coverage Gating

Coverage thresholds are configured in `codecov.yml` at the repository root.

| Setting | Value | Purpose |
|---|---|---|
| `coverage.status.project.default.target` | `auto` | Fails if project coverage drops below previous commit. |
| `coverage.status.project.default.threshold` | `0%` | No regression allowed. |
| `coverage.status.patch.default.target` | `80%` | New/changed lines must have ≥80% coverage. |
| `informational` | `true` (current) | Status checks report but do not block merges. |

### Promotion to blocking

Once thresholds are validated over several CI runs, remove `informational: true` from both project and patch status entries in `codecov.yml`. The `codecov/project` and `codecov/patch` checks will then become required status checks that block merges when coverage drops.

To promote:

1. Verify coverage reports are consistent across several PRs.
2. Edit `codecov.yml` and set `informational: false` for both `project` and `patch` status entries.
3. Add `codecov/project` and `codecov/patch` to `REQUIRED_CHECKS` in
   `scripts/apply-branch-protection.sh` and to the table in
   [`docs/required-status-checks.md`](./required-status-checks.md), then re-apply.

---

## Branch Protection Rules

The following configuration options are active for the `main` branch:

1. **Require a Pull Request Before Merging**: Direct pushes to `main` are disabled. All changes must be submitted via pull requests.
2. **Require Approvals**: At least **1 approving review** from a maintainer is required.
3. **Code Owners**: [`.github/CODEOWNERS`](../.github/CODEOWNERS) auto-requests reviewers; a code-owner approval is not currently *enforced* (`require_code_owner_reviews: false` in the script).
4. **Dismiss Stale Approvals**: Approvals are automatically dismissed when new commits are pushed to a pull request.
5. **Require Status Checks to Pass**: All of the required status checks listed above must pass before a merge.
6. **Require Linear History**: Merges must be squash-merged or rebased; merge commits are not allowed.
7. **Require Conversation Resolution**: All discussions and comments on the pull request must be resolved before merging.
8. **Restrict Force Pushes and Deletions**: Force pushing to `main` and deleting the branch are strictly blocked.

Contributors can review the ownership map in [`.github/CODEOWNERS`](../.github/CODEOWNERS) before requesting review. Ownership is split across frontend, smart contracts, repository configuration, and documentation.

### Owner-Bypass Behavior

> [!IMPORTANT]
> The **Enforce Admins** setting is disabled (`enforce_admins: false`). This means Repository Owners/Administrators can bypass status checks and pull request requirements in emergency scenarios (e.g., immediate production hotfixes, network emergency upgrades). Bypass privilege should only be exercised as a last resort.

---

## Apply Protection Rules Automatically

The settings above are applied by
[`scripts/apply-branch-protection.sh`](../scripts/apply-branch-protection.sh), which is
the single source of truth for them (needs `gh` and `jq`).

```bash
# Preview: prints the current -> desired diff and changes nothing (read access is enough)
bash scripts/apply-branch-protection.sh --dry-run

# Apply to main (needs admin on the repository)
bash scripts/apply-branch-protection.sh

# Another repo or branch
bash scripts/apply-branch-protection.sh --repo owner/name --branch main
```

The script is idempotent and safe to re-run: it reads the branch's live protection,
compares it with the desired settings, and only sends an update when something
differs — otherwise it prints "already up to date". It refuses to apply when it
cannot read the current settings.

When a gated job is renamed, follow
[Keeping this in sync](./required-status-checks.md#keeping-this-in-sync) — update the
script and the docs in the same PR, then re-run the script after merge.
