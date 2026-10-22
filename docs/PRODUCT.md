# Product direction: restricted professional breach intelligence

## Purpose and intended users

The owner clarified the product direction on October 22, 2026: a paid, Have I Been Pwned-like breach-intelligence service for cybersecurity analysts and experts, professional investigators, and law enforcement. The service helps an authorized professional determine whether an identifier appears in an approved breach dataset, understand what exposure is reported, and document the evidence and response.

This is a separate product with no affiliation to Have I Been Pwned. An analyst title, a badge, a paid subscription, or a disclaimer is not sufficient authorization to access sensitive records.

**Recommended launch model:** invitation-only organizations, vetted users, explicit investigation scope, individual accounts with MFA, and limited evidence access. Begin with private analyst use while implementing the controls required for a hosted paid service. Do not enable open registration against this preview.

## What the current preview actually does

- A trusted operator can search an approved Solr collection by allowlisted identifiers and fields, open a record, and perform a bounded coordinate search.
- The application requires a shared operator token through Basic login or an Authorization Bearer header. This is a development/private-operator boundary, not a customer identity or tenant system.
- Declared source information can include breach name, breach date, source reference, data classes, and a credential-exposure flag. Operators supply that metadata; the software does not independently verify it.
- The application returns an allowlist of fields. It does not return password material, raw source lines, or arbitrary indexed properties. Legacy credit/bulk-export endpoints are unavailable.
- The repository includes two new synthetic fixtures and an inherited 75,739-record sample dataset that the owner explicitly requested preserving for isolated testing. The inherited data must be treated as potentially sensitive; its provenance is not independently verified. The code does not include an acquisition service, a paid data license, a functioning checkout, or permission to process any additional external dataset.

## Analyst workflow to build

1. **Onboard an organization.** Verify its identity and contact through an approved process. Record an agreement, acceptable purpose, and administrator. Verify law-enforcement organizational affiliation through official channels; membership alone does not replace an authorization process for each use.
2. **Invite an analyst.** Use individual identities, MFA, role assignment, and controlled recovery. Disable shared customer credentials. Revoke access promptly when a user leaves or a case closes.
3. **Open an investigation.** Associate the work with a client, case, approved purpose, and scope. Domain ownership/authorization is one possible control for organizational monitoring; other investigations need an explicit reviewed authorization basis.
4. **Run a scoped lookup.** Enforce organization and case permissions on the server before the search. Limit query types, returned fields, rate, and cumulative usage. The browser must never be the only enforcement point.
5. **Evaluate exposure.** Show the source, known dates, data classes, provenance status, and confidence/verification notes. Distinguish breach date, discovery date, ingestion date, and last verification. Missing dates remain unknown; do not fabricate them.
6. **Review sensitive evidence.** Separate an exposure summary from the underlying source material. Any future access to raw sensitive evidence requires separate permissions, purpose, approval, logging, encryption, retention limits, and a reviewed data-rights basis. Do not reinstate general plaintext-password retrieval as the default result view.
7. **Export a controlled report.** Use a queued job scoped to the organization/case, redacted fields, short-lived download access, checksum, provenance manifest, and expiry. An authorized analyst should be able to explain where a result came from and what the system did to it.
8. **Close and retain deliberately.** Revoke grants, apply retention/deletion rules to reports and backups, record corrections, and maintain an incident process. Do not claim that an application delete immediately erases every backup.

## Architecture and trust boundaries

| Component | Responsibility | Excluded responsibility |
| --- | --- | --- |
| Identity provider and gateway | Individual login, MFA, organization enrollment, TLS, external abuse controls. | Granting data access solely because a user paid. |
| Application authorization | Enforce organization, role, case scope, field permissions, and entitlements on every request. | Trusting client-side filters or user-supplied organization IDs. |
| Search index (Solr) | Index approved, minimized search metadata and provide bounded retrieval. | Storing a wallet ledger or being publicly accessible. |
| Transactional account store | Organizations, roles, subscriptions, quotas, billing events, and an immutable usage ledger. | Reconstructing financial balances with read-modify-write Solr updates. |
| Ingestion worker | Validate provenance and schema, quarantine unknown fields, normalize supported identifiers, detect duplicates, and publish approved batches. | Automatically scraping sensitive sources or importing unreviewed dumps. |
| Evidence storage | If separately approved, encrypted source material with restricted access and lifecycle policy. | Returning raw evidence in ordinary search results. |
| Audit service | Record actor, organization, case, purpose, action, outcome, and retention metadata. | Logging tokens, passwords, unrestricted query bodies, or sensitive records in plaintext. |
| Billing integration | Hosted checkout, verified payment events, idempotent entitlement updates, and reconciliation. | Treating a browser redirect or unsigned callback as proof of payment. |

Keep search and billing independently testable. A payment outage must not corrupt evidence or balances. A search result must not cross organizational boundaries because of a cached response, reused job ID, or an unscoped background task.

## Paid-service requirements

Use an organization subscription with clearly defined analyst seats and query quotas as the initial model. Pricing is a later business decision based on lawful data cost, infrastructure, support, and acceptable use; this repository does not invent a price or promise commercial readiness.

Payment integration must verify provider signatures against the original request bytes; reject stale or replayed events; deduplicate event IDs; use transactional updates; handle cancellation, refund, dispute, and failed-payment states; and reconcile entitlements against provider records. No balance, entitlement, or export grant should depend on a client-supplied amount or status. Use provider test mode and synthetic customers until the full lifecycle passes.

Define what counts as usage. Reserve quota before an expensive job, finalize it after success, and release it on failure without permitting duplicate credits. Test concurrent requests and webhook retries. A shared per-IP rate limiter is not a billing meter.

## Prioritized roadmap and acceptance gates

| Priority | Workstream | Completion evidence |
| --- | --- | --- |
| P0 — foundation | Current runtimes, reproducible installs, private deployment, bounded search, safe errors, synthetic tests, CI, and operator documentation. | Application and database integration tests pass for the exact commit; migration limitations are documented. |
| P1 — identity and scope | Vetted organization onboarding, invitation-only accounts, MFA, roles, case/purpose records, and server-side authorization. | Cross-tenant and cross-case negative tests; revocation and recovery tests; independent access-control review. |
| P1 — data governance | Source approval, rights/provenance records, normalized identifiers, explicit dates/classes, retention, correction/deletion, and a working private security contact. | Synthetic ingestion/rejection tests, approval records, retention drill, and verified reporting route. |
| P2 — analyst experience | Exposure summary, provenance view, filters, evidence review workflow, scoped audit records, and controlled reporting. | Analyst walkthrough with synthetic cases; no secret leakage; export authorization, expiry, and integrity tests. |
| P2 — subscriptions | Account store, signed payment webhooks, transactional quotas, usage receipts, refunds/cancellation/reconciliation. | Provider-sandbox lifecycle tests, replay/concurrency tests, and accounting reconciliation. |
| P3 — production operations | Supported Solr 10 migration, capacity/load testing, secure ingress, encrypted backups, restore rehearsal, monitoring, incident runbook. | Representative staging exercise, documented recovery objectives, independent review, owner launch approval. |

After the foundation, these are five follow-on workstreams suitable for a small backlog; do not fragment them into dozens of unowned issues. Current repository Issues is disabled, so the roadmap is versioned here until the owner enables and operates a task queue.

## Commercial release blockers

The preview is **not ready for public paid access**. The shared operator credential must be replaced for customer use; tenant/case authorization, billing, audit records, a verified private security reporting channel, source governance, infrastructure hardening, and a tested recovery process remain requirements. The current container topology has one Solr node and one ZooKeeper node and provides no high availability.

Before launch, have qualified counsel review the intended operating jurisdictions, data sourcing, investigator/customer eligibility, permitted uses, privacy notices, contracts, and retention. This document defines engineering requirements; it does not establish legal authority or make a compliance certification.
