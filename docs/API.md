# Analyst preview API

This API serves one trusted operator's configured collection. It is not a multi-tenant investigator or commercial API yet. All examples use the fictional fixture in `samples/sample.json`.

## Authentication

Send `Authorization: Bearer <API_TOKEN>`. Browsers can use HTTP Basic authentication with username `operator` and the token as the password. Use HTTPS for remote access. Tokens in URLs, user-agent strings, and Cloudflare headers are not accepted as credentials.

For a local interactive CLI request, curl can prompt for the password without placing it in shell history:

```bash
curl --fail --user operator --get \
  --data-urlencode 'emails=record-one@example.invalid' \
  --data 'wt=json' \
  http://127.0.0.1:3000/records
```

Do not share the operator token across customer accounts. Individual identities, MFA, organization/case scopes, and metering are specified in [PRODUCT.md](PRODUCT.md).

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/` | Authenticated analyst search page. |
| GET | `/records` | Field search; HTML by default, JSON with `wt=json`. |
| GET | `/documents/by_id/:id` | One exact record ID; HTML or JSON. URL-encode the ID. |
| GET | `/spatial` | JSON coordinate/radius lookup. |
| GET | `/map` | Local spatial-search interface. |
| GET | `/visualize` | Record explorer; automatic relationship expansion is unavailable. |
| GET | `/faq`, `/terms` | Operator guide and software data-handling information. |
| GET | `/health/live` | Unauthenticated minimal process status. |
| GET | `/health/ready` | Unauthenticated, rate-limited minimal backend status. |

`/assets/*`, `/robots.txt`, and the empty favicon response do not expose collection data. Application and data routes require authentication.

## Search contract

Supported positive search fields:

```text
firstName lastName birthYear ips asn domain asnOrg country continent
source emails VRN usernames address city zipCode state phoneNumbers vin
```

Add `not` before a supported field to exclude values, for example `notsource`. At least one nonempty positive search field is required. Different fields combine with AND; repeated values within one field combine with OR. A field accepts at most five values. Each nonempty value is at most 256 characters; control characters are rejected. Blank known fields are ignored so ordinary HTML forms work without JavaScript.

A request accepts at most 40 distinct parameter names, including control parameters such as `wt`, `rows`, `start`, and `exact`. Repeated values under the same name count as one parameter name and remain subject to the five-value field limit. The `asn` and `notasn` fields additionally require decimal digits representing an integer from 0 through 2,147,483,647, matching the current schema's signed 32-bit integer field.

Values are escaped as literal phrases. Raw Solr parameters such as `q`, `fq`, `fl`, `sort`, and local-parser instructions are not accepted. Operators pasted into a supported field are treated as text, not instructions. Parameter names are case-sensitive. Unknown parameters fail with 400.

| Parameter | Values |
| --- | --- |
| `wt` | `html` or `json`; defaults to HTML. |
| `rows` | Integer from 1 through `MAX_RESULTS` (default 100). |
| `start` | Integer from 0 through 10,000; defaults to 0. |
| `exact` | Compatibility flag: `true`, `false`, `1`, `0`, or `on`. All values use the same literal query path; there is no legacy fuzzy expansion. |

The fresh schema uses whole-value, lowercase-normalized email/domain fields. Username lookup is case-sensitive. Other fields follow their schema analyzers; a quoted text-field query is not a universal byte-for-byte equality guarantee. Old `text_general` email indexes must be reindexed to get the new identifier semantics.

JSON search results have this shape:

```json
{
  "resultCount": 1,
  "count": 1,
  "start": 0,
  "records": [{
    "id": "00000000-0000-4000-8000-000000000001",
    "emails": ["Record-One@Example.Invalid"],
    "source": "synthetic-fixture",
    "breachName": "Synthetic demonstration breach",
    "breachDate": "2026-01-01",
    "sourceReference": "synthetic-fixture-v1",
    "dataClasses": ["Email addresses", "Usernames"],
    "credentialExposure": false
  }]
}
```

Additional allowed record fields may be present. Password material, raw lines, photos/links, notes, internal Solr metadata, and arbitrary dynamic fields are excluded even if an existing backend contains them. A false exposure flag is retained as false; a missing flag remains unknown. The application does not infer credential exposure or verify the supplied provenance.

`resultCount` is the backend's total match count for a completed query; `count` is the number actually returned. Results sort by ID for stable pagination within an unchanged collection. Concurrent imports or deletions can shift offset pages. This preview has no snapshot/cursor export guarantee.

## Single record

`GET /documents/by_id/<encoded-id>?wt=json` returns `{ "record": { ... } }` or 404. IDs are limited to 256 characters, must contain a non-whitespace character, and cannot contain control characters. Valid IDs are preserved exactly, including surrounding spaces, and escaped as literals. A mismatched backend ID is rejected. `moreLikeThis=false` is accepted for compatibility; `moreLikeThis=true` returns 501 until a bounded, authorized relationship model exists.

## Spatial lookup

`GET /spatial?latLong=0,0&d=1&rows=10` returns `{ "numDocs": 2, "records": [...] }` for the fixture. Latitude must be −90 through 90 and longitude −180 through 180. Radius `d` is 0.1 through 1,000 kilometers and defaults to 0.2. `rows` uses the same result limit. Values must be finite decimal numbers; unknown parameters fail with 400.

## Limits and errors

Default upstream timeout is five seconds, configurable from 100 to 30,000 milliseconds. Upstream response bodies are capped at 2 MiB. Redirects, malformed JSON, excess returned rows, nonzero/missing Solr status, and partial/omitted results are rejected. An upstream failure never appears as a successful zero-result search.

Requests are limited to 60 per minute per client address by default. The single-process store expires entries and caps the number retained. Forwarded client addresses are used only when `TRUST_PROXY` explicitly names trusted peers. Multiple application replicas require shared rate enforcement.

| Status | Meaning |
| --- | --- |
| 400 | Invalid, unsupported, or malformed input. |
| 401 | Missing or invalid operator credentials. |
| 404 | No matching record or route. |
| 410 | Historical wallet/export/payment/callback endpoint unavailable pending rebuilding. |
| 414 | Request URL exceeds 8,192 characters. |
| 429 | Request rate exceeded; honor `Retry-After`. |
| 500 | Unexpected application error, without internal details. |
| 501 | Automatic related-record discovery is not implemented. |
| 502 | Backend failure or invalid response. |
| 503 | Backend not ready, incomplete query, or bounded request-store capacity reached. |
| 504 | Backend deadline exceeded. |

Errors return JSON with an `error` message; readiness instead returns `{ "status": "unavailable" }`. Responses disable caching and indexing and set a same-origin browser content policy. These controls do not remove browser history or infrastructure logs.
