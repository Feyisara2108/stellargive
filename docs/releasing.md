# Release Flow Documentation

StellarGive uses automated release management powered by [release-please](https://github.com/googleapis/release-please) and GitHub Actions. This document describes how releases are managed, how maintainers interact with the release pipeline, and how to write commits that trigger releases.

---

## How It Works

The release process is fully automated based on **Conventional Commits**:

1. **Development**: Developers write commit messages following the Conventional Commits specification.
2. **Push to `main`**: When code is merged/pushed to the `main` branch, the `Release Please` GitHub Actions workflow runs.
3. **Release Pull Request**: The workflow parses all commits since the last release tag:
   - If it detects release-triggering commits (e.g. `feat`, `fix`), it automatically creates or updates a **Release Pull Request** (usually titled `chore(main): release 1.x.x`).
   - The Release PR contains the bumped version in `package.json` and a compiled draft of the changes in `CHANGELOG.md`.
4. **Publishing a Release**:
   - Once a maintainer merges the Release PR into `main`, the workflow runs again.
   - It detects the merge of the Release PR, creates a Git tag (e.g. `v1.x.x`), and publishes a GitHub Release with the changelog notes automatically.

---

## Commit Message Guidelines

Releases and changelogs are generated strictly from the format of your commit messages. Every commit must adhere to the Conventional Commits format:

```text
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Supported Commit Types

- **`feat`**: Bumps the **minor** version (e.g., `1.0.0` -> `1.1.0`). Triggers a release.
- **`fix`**: Bumps the **patch** version (e.g., `1.0.0` -> `1.0.1`). Triggers a release.
- **`perf`**: Performance improvements. Triggers a patch release.
- **`docs`**, **`style`**, **`refactor`**, **`test`**, **`chore`**, **`ci`**, **`build`**: These types do not trigger a release automatically, but will be documented in the changelog if a release is created.

### Breaking Changes

Adding `BREAKING CHANGE:` in the commit footer, or appending a `!` to the commit type (e.g., `feat!:`), bumps the **major** version (e.g., `1.0.0` -> `2.0.0`).

#### Example Commit Messages

- **Feature**:
  ```text
  feat: add campaign search filters
  ```
- **Bug Fix**:
  ```text
  fix: handle empty results in get_campaigns_paged
  ```
- **Breaking Change**:
  ```text
  feat!: restructure campaign storage key layout
  
  BREAKING CHANGE: This migrates storage layout and breaks compatibility with previous contract deployments.
  ```

---

## Maintainer Workflow

### 1. Merging Pull Requests
When merging pull requests, ensure that the final commits on `main` follow Conventional Commits.
- **Squash and Merge** is recommended because it lets you edit the squash commit message to conform to Conventional Commits before merging, even if individual commits in the branch did not follow it.

### 2. Reviewing the Release PR
- `release-please` will automatically maintain a single open Release PR. As more changes are merged to `main`, `release-please` will force-push updates to this PR (re-calculating the version bump and appending new changelog items).
- Review the `CHANGELOG.md` edits inside the Release PR to make sure everything looks correct.
- If everything looks correct, **approve and merge** the Release PR.

### 3. Verification
After merging the Release PR:
- Go to the **Actions** tab on GitHub and verify that the `Release Please` workflow runs successfully.
- Go to the **Releases** page of the repository. You should see a new release tag and publication matching the bumped version.
