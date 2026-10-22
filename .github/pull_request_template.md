## Problem

Describe the user-visible failure or maintenance need and its impact.

## Change

Explain the resulting behavior and any compatibility or configuration changes.

## Validation

List the commands actually run and their outcomes. Default checks use synthetic data.
For explicitly authorized inherited-corpus testing, report aggregate results only; never attach records or raw logs.
Mark tests that could not run and explain why.

## Deployment and rollback

Identify migration requirements, backup/restore steps, and the rollback commit or image.
State whether existing indexes need rebuilding. Never imply a Solr downgrade is a rollback.

## Review

- [ ] No tokens, private records, exports, or unrelated generated files are included.
- [ ] Relevant regression tests pass; documentation matches the implementation.
- [ ] Dependency updates include the lockfile and upstream compatibility review.
- [ ] Changes to authentication, queries, schemas, workflows, or public exposure are called out.
