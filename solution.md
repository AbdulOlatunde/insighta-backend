## 1. Query Performance Optimization

### What was done

**Compound indexes** were added to the Profile model on top of the existing single-field indexes:

- `{ gender, country_id }` — covers the most common analyst filter pattern
- `{ gender, age_group }` — covers demographic slicing
- `{ age, gender }` — covers age range queries with gender filter
- `{ age_group, country_id }` — covers regional age group queries
- `{ gender, country_id, created_at }` — covers combined filter + sort

Without compound indexes, MongoDB scans the entire collection for multi-field queries even when single-field indexes exist. Compound indexes let the database satisfy a filter + sort in a single index scan.

**Connection pooling** was configured with `maxPoolSize: 20` and `minPoolSize: 5`. Previously each query could queue behind others waiting for a free connection. Pooling allows concurrent queries to be served without blocking.

**`.lean()` queries** were added to all read operations. Mongoose normally wraps each result in a full document object with hydration overhead. `.lean()` returns plain JavaScript objects — faster and lower memory.

**Redis caching** was added in front of all read queries. If the same query (after normalization) has been seen before, the cached result is returned without touching MongoDB. Cache TTL is 120 seconds.

### Before / After

| Scenario | Before | After (estimated) |
|---|---|---|
| Repeated query (cache hit) | ~200–400ms | ~5–15ms |
| First query, indexed filter | ~150–300ms | ~30–80ms |
| Combined filter + sort, no index | ~800ms–2s+ | ~50–150ms |
| Cold start, no cache | same | same — fallback is faster due to lean + pool |

These are estimates based on typical MongoDB behavior at 100k–1M documents. Actual numbers depend on hardware and network latency to Atlas.

---

## 2. Query Normalization

### Problem

`{ gender: "Male", country_id: "NG" }` and `{ country_id: "ng", gender: "male" }` express the same filter but produce different cache keys without normalization, causing redundant database calls.

### Approach

A `queryNormalizer.js` utility normalizes all filter objects before cache key generation:

1. String values are lowercased and trimmed
2. Numeric values are coerced from strings to numbers
3. Empty/null/undefined keys are removed
4. Keys are sorted alphabetically

This means key order and casing in the query string never affect the cache key. Two queries that produce the same filter always hit the same cache entry.

The normalization is deterministic and rule-based — no AI involved. It does not interpret intent, only standardizes representation.

### Example

```
?gender=Male&country_id=NG   →  cache key: "country_id=ng|gender=male"
?country_id=ng&gender=male   →  cache key: "country_id=ng|gender=male"  ← same hit
```

---

## 3. CSV Data Ingestion

### Design

The import endpoint is `POST /api/profiles/import` — admin only, accepts a `multipart/form-data` request with a `file` field containing a CSV.

**Streaming, not buffering**: The CSV is parsed using `csv-parse` in async iterator mode. Rows are processed one at a time and never fully loaded into memory. This allows 500,000-row files to be handled on limited compute.

**Chunked bulk insert**: Valid rows are collected into chunks of 500 and inserted with `insertMany({ ordered: false })`. This batches writes to reduce round trips without loading the full file into memory. `ordered: false` means a failed row does not block the rest of the chunk.

**Duplicate detection**: Before inserting each chunk, a single `find({ name: { $in: [...names] } })` query checks for existing names in batch. This avoids one database call per row.

**Per-row validation**: Each row is validated before being added to a chunk. Bad rows are counted and skipped — they never reach the database. A single bad row never fails the upload.

**Cache invalidation**: After a successful import, all profile cache keys are invalidated so subsequent reads reflect the new data.

### Failure handling

- Malformed row (wrong column count, bad encoding) → skipped, counted as `malformed_row`
- Missing required fields → skipped, counted as `missing_fields`
- Invalid age (negative, non-integer) → skipped, counted as `invalid_age`
- Invalid gender → skipped, counted as `invalid_gender`
- Duplicate name → skipped, counted as `duplicate_name`
- Partial failure midway → rows already inserted remain. No rollback. The response includes `partial_stats`.

### Edge cases

- Empty file → `total_rows: 0, inserted: 0`
- All rows invalid → `inserted: 0` with full reasons breakdown
- Concurrent uploads → each runs independently; `ordered: false` bulk inserts handle duplicate conflicts gracefully via error code 11000 catching

### Trade-offs

- Multer stores the file buffer in memory before streaming begins. For 500k rows this is acceptable (typical CSV at ~50 bytes/row = ~25MB). If files grow larger, switching to disk storage and a file path stream would be needed.
- The chunk size of 500 balances write throughput against memory usage. Larger chunks reduce round trips but increase memory per chunk.