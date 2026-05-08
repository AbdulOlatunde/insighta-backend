/**
 * Query Normalization
 *
 * Two queries expressing the same intent must produce the same cache key.
 * We are going to normalize by:
 *  1. Lowercasing all string values
 *  2. Coercing numeric strings to numbers
 *  3. Sorting keys alphabetically
 *  4. Removing undefined/null/empty-string keys
 *
 * This means that:
 *   { gender: "Male", country_id: "NG" }
 *   { country_id: "ng", gender: "male" }
 * both produce the same key: "country_id=ng|gender=male"
 */

const NUMERIC_KEYS = new Set([
  "min_age", "max_age", "min_gender_probability", "min_country_probability",
  "page", "limit",
]);

const STRING_KEYS = new Set([
  "gender", "age_group", "country_id", "sort_by", "order",
]);

const normalizeFilters = (raw = {}) => {
  const normalized = {};

  for (const [key, val] of Object.entries(raw)) {
    if (val === undefined || val === null || val === "") continue;

    if (NUMERIC_KEYS.has(key)) {
      const num = Number(val);
      if (!isNaN(num)) normalized[key] = num;
    } else if (STRING_KEYS.has(key)) {
      normalized[key] = String(val).toLowerCase().trim();
    } else {
      // Unknown key to include as-is (e.g. q for search)
      normalized[key] = String(val).toLowerCase().trim();
    }
  }

  return normalized;
};

/**
 * Build a deterministic cache key from a normalized filter object.
 * Keys are sorted alphabetically so order of query params doesn't matter.
 */
const buildCacheKey = (prefix, filters) => {
  const normalized = normalizeFilters(filters);
  const parts = Object.keys(normalized)
    .sort()
    .map((k) => `${k}=${normalized[k]}`);
  return `${prefix}:${parts.join("|") || "all"}`;
};

/**
 * Build a MongoDB filter from normalized query params.
 * Used by both getAllProfiles and searchProfiles.
 */
const buildMongoFilter = (query) => {
  const {
    gender, age_group, country_id,
    min_age, max_age,
    min_gender_probability, min_country_probability,
  } = normalizeFilters(query);

  const filter = {};

  if (gender)     filter.gender     = { $regex: new RegExp(`^${gender}$`, "i") };
  if (age_group)  filter.age_group  = { $regex: new RegExp(`^${age_group}$`, "i") };
  if (country_id) filter.country_id = { $regex: new RegExp(`^${country_id}$`, "i") };

  if (min_age !== undefined || max_age !== undefined) {
    filter.age = {};
    if (min_age !== undefined) filter.age.$gte = min_age;
    if (max_age !== undefined) filter.age.$lte = max_age;
  }
  if (min_gender_probability !== undefined) {
    filter.gender_probability = { $gte: min_gender_probability };
  }
  if (min_country_probability !== undefined) {
    filter.country_probability = { $gte: min_country_probability };
  }

  return filter;
};

module.exports = { normalizeFilters, buildCacheKey, buildMongoFilter };