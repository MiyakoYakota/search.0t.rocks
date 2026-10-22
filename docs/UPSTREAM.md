# Upstream provenance and compatibility

## Origin

This repository is a fork of [MiyakoYakota/search.0t.rocks](https://github.com/MiyakoYakota/search.0t.rocks). The audited starting point was commit `4c71edd` (`Update run.sh`). The original source describes a searchable database and identifies the former service as Illicit Services LTD. The Apache-2.0 license is retained unchanged; the original package's conflicting `ISC` declaration has been corrected.

Michael Heald maintains this fork through `Legatto2/search.0t.rocks`. Upstream contributors retain credit and copyright. This fork is not Have I Been Pwned, is not affiliated with that service, and does not claim rights to its data or branding.

## Intended product

The owner clarified that the target is a paid breach-intelligence tool for cybersecurity analysts and experts. The modernization keeps that product goal. The current preview repairs the search foundation; it does not yet implement customer identities, tenant authorization, paid entitlements, or commercial billing. Those requirements are defined in [PRODUCT.md](PRODUCT.md).

The inherited code contains wallet balances and per-export credit calculations. It also describes ordinary search as free in its homepage. That is the behavior visible in this snapshot; a complete subscription or per-search billing system is not present.

## Intentional compatibility changes

| Area | Preview behavior | Reason |
| --- | --- | --- |
| Access | Operator Basic login or an Authorization Bearer token; explicit local anonymous demo only. | User-agent strings and query-string API keys do not provide appropriate access control. |
| Search | Allowlisted fields, bounded pagination, literal values, explicit errors. | Remove query manipulation, undocumented expansion, hangs, and misleading empty results. |
| Result data | Allowlisted display fields and declared breach metadata; password material, raw lines, and arbitrary indexed fields are excluded. | Limit sensitive evidence exposure while analyst identity, scope, and audit controls are developed. |
| Billing and bulk exports | Old URLs return HTTP 410; no money moves and no external upload worker runs. | The old callback can alter balances without authentication and the credit updates are not transactional. A replacement is planned, not claimed complete. |
| Relationship expansion | `moreLikeThis=true` returns HTTP 501. | The old unbounded fan-out and heuristic person matching need a separately tested evidence model. |
| Map | Authenticated coordinate/radius search with local results. | Remove hardcoded external map services, browser credentials, and unrelated parcel-data lookups. |
| Browser | Local HTML, CSS, and JavaScript. | Remove obsolete Vue 2/Vuetify 2 and remotely loaded scripts without adding an unnecessary framework. |
| Deployment | New isolated, persistent Solr/ZooKeeper services; no public database ports. | Prevent accidental exposure and loss of container-local indexes. Old volumes are not attached or upgraded automatically. |

## Historical content

The inherited donation/credit pages, unfinished Python export worker, personal correspondence, and old canary/terms statements are removed or replaced in the current checkout. They are not current operator policies or supported functionality. Original material remains traceable in Git history; this change does not rewrite history or claim to erase previously published data.

Retained or rewritten source is covered by [LICENSE](../LICENSE) and [NOTICE](../NOTICE). Do not reintroduce former operators' payment addresses, contact details, statistics, or legal assertions as if they describe this deployment.

The owner explicitly requested retaining and testing the inherited `sample.jsonl` (75,739 records). Its original bytes are preserved. Treat it as potentially sensitive: default CI uses only synthetic fixtures, while explicitly authorized corpus tests stay isolated and disclose only aggregate metrics. No history rewrite was performed, and no claim is made that the inherited dataset is synthetic or licensed for redistribution.
