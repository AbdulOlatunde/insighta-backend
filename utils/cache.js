const Redis = require("ioredis");

let client = null;

const getClient = () => {
  if (!client) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      // No Redis configured — return null, cache will be skipped gracefully
      return null;
    }
    client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    client.on("error", (err) => {
      console.warn("Redis error (cache disabled):", err.message);
      client = null;
    });
  }
  return client;
};

const get = async (key) => {
  try {
    const redis = getClient();
    if (!redis) return null;
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
};

const set = async (key, value, ttlSeconds = 120) => {
  try {
    const redis = getClient();
    if (!redis) return;
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Cache write failure is non-fatal
  }
};

const del = async (pattern) => {
  try {
    const redis = getClient();
    if (!redis) return;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Cache invalidation failure is non-fatal
  }
};

module.exports = { get, set, del };