const axios = require("axios");
const cache = require("../utils/cache");
const { buildCacheKey, buildMongoFilter, normalizeFilters } = require("../utils/queryNormalizer");
const { v4: uuidv4 } = require("uuid");
const { stringify } = require("fast-csv");
const Profile = require("../models/Profile");

// Helpers
const getAgeGroup = (age) => {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
};

const formatProfile = (p) => ({
  id: p.id,
  name: p.name,
  gender: p.gender,
  gender_probability: p.gender_probability,
  age: p.age,
  age_group: p.age_group,
  country_id: p.country_id,
  country_name: p.country_name,
  country_probability: p.country_probability,
  created_at: p.created_at,
});

const buildPaginationLinks = (baseUrl, query, page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  const buildUrl = (p) => {
    const params = new URLSearchParams({ ...query, page: p, limit });
    return `${baseUrl}?${params.toString()}`;
  };
  return {
    self: buildUrl(page),
    next: page < totalPages ? buildUrl(page + 1) : null,
    prev: page > 1 ? buildUrl(page - 1) : null,
  };
};

const COUNTRY_NAMES = {
  AF:"Afghanistan",DZ:"Algeria",AO:"Angola",AR:"Argentina",AU:"Australia",
  AT:"Austria",AZ:"Azerbaijan",BD:"Bangladesh",BE:"Belgium",BJ:"Benin",
  BO:"Bolivia",BR:"Brazil",BG:"Bulgaria",BF:"Burkina Faso",BI:"Burundi",
  CM:"Cameroon",CA:"Canada",CF:"Central African Republic",TD:"Chad",
  CL:"Chile",CN:"China",CO:"Colombia",CG:"Congo",CD:"DR Congo",
  CR:"Costa Rica",CI:"Côte d'Ivoire",HR:"Croatia",CU:"Cuba",CZ:"Czech Republic",
  DK:"Denmark",DO:"Dominican Republic",EC:"Ecuador",EG:"Egypt",SV:"El Salvador",
  ET:"Ethiopia",FI:"Finland",FR:"France",GA:"Gabon",DE:"Germany",
  GH:"Ghana",GR:"Greece",GT:"Guatemala",GN:"Guinea",HT:"Haiti",
  HN:"Honduras",HU:"Hungary",IN:"India",ID:"Indonesia",IQ:"Iraq",
  IE:"Ireland",IL:"Israel",IT:"Italy",JM:"Jamaica",JP:"Japan",
  JO:"Jordan",KZ:"Kazakhstan",KE:"Kenya",KW:"Kuwait",LB:"Lebanon",
  LY:"Libya",MG:"Madagascar",MW:"Malawi",MY:"Malaysia",ML:"Mali",
  MX:"Mexico",MA:"Morocco",MZ:"Mozambique",MM:"Myanmar",NP:"Nepal",
  NL:"Netherlands",NZ:"New Zealand",NI:"Nicaragua",NE:"Niger",NG:"Nigeria",
  NO:"Norway",PK:"Pakistan",PA:"Panama",PY:"Paraguay",PE:"Peru",
  PH:"Philippines",PL:"Poland",PT:"Portugal",RO:"Romania",RU:"Russia",
  RW:"Rwanda",SA:"Saudi Arabia",SN:"Senegal",SL:"Sierra Leone",SO:"Somalia",
  ZA:"South Africa",KR:"South Korea",ES:"Spain",LK:"Sri Lanka",SD:"Sudan",
  SE:"Sweden",CH:"Switzerland",SY:"Syria",TZ:"Tanzania",TH:"Thailand",
  TG:"Togo",TN:"Tunisia",TR:"Turkey",UG:"Uganda",UA:"Ukraine",
  AE:"United Arab Emirates",GB:"United Kingdom",US:"United States",
  UY:"Uruguay",UZ:"Uzbekistan",VE:"Venezuela",VN:"Vietnam",YE:"Yemen",
  ZM:"Zambia",ZW:"Zimbabwe",
};

const getCountryName = (code) => COUNTRY_NAMES[code] || code;

const buildFilter = (query) => {
  const {
    gender, age_group, country_id,
    min_age, max_age,
    min_gender_probability, min_country_probability,
  } = query;

  const filter = {};
  if (gender)     filter.gender     = { $regex: new RegExp(`^${gender}$`, "i") };
  if (age_group)  filter.age_group  = { $regex: new RegExp(`^${age_group}$`, "i") };
  if (country_id) filter.country_id = { $regex: new RegExp(`^${country_id}$`, "i") };

  if (min_age !== undefined || max_age !== undefined) {
    filter.age = {};
    if (min_age !== undefined) filter.age.$gte = Number(min_age);
    if (max_age !== undefined) filter.age.$lte = Number(max_age);
  }
  if (min_gender_probability !== undefined) {
    filter.gender_probability = { $gte: Number(min_gender_probability) };
  }
  if (min_country_probability !== undefined) {
    filter.country_probability = { $gte: Number(min_country_probability) };
  }
  return filter;
};

//  POST /api/profiles (admin only) 
exports.createProfile = async (req, res) => {
  try {
    const { name } = req.body;

    if (name === undefined || name === null) {
      return res.status(400).json({ status: "error", message: "Missing or empty 'name' field" });
    }
    if (typeof name !== "string" || name.trim() === "") {
      return res.status(422).json({ status: "error", message: "'name' must be a non-empty string" });
    }

    const cleanName = name.trim().toLowerCase();
    const existing = await Profile.findOne({ name: cleanName });
    if (existing) {
      return res.status(200).json({ status: "success", message: "Profile already exists", data: formatProfile(existing) });
    }

    let genderData, agifyData, nationalizeData;
    try {
      const [genderRes, agifyRes, nationalizeRes] = await Promise.all([
        axios.get("https://api.genderize.io", { params: { name: cleanName }, timeout: 5000 }),
        axios.get("https://api.agify.io", { params: { name: cleanName }, timeout: 5000 }),
        axios.get("https://api.nationalize.io", { params: { name: cleanName }, timeout: 5000 }),
      ]);
      genderData = genderRes.data;
      agifyData = agifyRes.data;
      nationalizeData = nationalizeRes.data;
    } catch (err) {
      return res.status(502).json({ status: "error", message: "Failed to reach one or more external APIs" });
    }

    if (!genderData.gender || genderData.count === 0) {
      return res.status(502).json({ status: "error", message: "Genderize returned an invalid response" });
    }
    if (agifyData.age === null || agifyData.age === undefined) {
      return res.status(502).json({ status: "error", message: "Agify returned an invalid response" });
    }
    if (!nationalizeData.country || nationalizeData.country.length === 0) {
      return res.status(502).json({ status: "error", message: "Nationalize returned an invalid response" });
    }

    const topCountry = nationalizeData.country.reduce((a, b) => a.probability > b.probability ? a : b);

    const profile = new Profile({
      id: uuidv4(),
      name: cleanName,
      gender: genderData.gender,
      gender_probability: genderData.probability,
      age: agifyData.age,
      age_group: getAgeGroup(agifyData.age),
      country_id: topCountry.country_id,
      country_name: getCountryName(topCountry.country_id),
      country_probability: topCountry.probability,
      created_at: new Date().toISOString(),
    });

    await profile.save();
    return res.status(201).json({ status: "success", data: formatProfile(profile) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// GET /api/profiles 
exports.getAllProfiles = async (req, res) => {
  try {
    const { sort_by, order, page, limit } = req.query;
    const filter = buildMongoFilter(req.query);

    const allowedSortFields = ["age", "created_at", "gender_probability"];
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : "created_at";
    const sortOrder = (order || "").toLowerCase() === "asc" ? 1 : -1;

    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const skip     = (pageNum - 1) * limitNum;

    // Normalized cache key  (same filters always hit same key)
    const cacheKey = buildCacheKey("profiles", { ...req.query });
    const cached = await cache.get(cacheKey);
    if (cached) return res.status(200).json(cached);

    const [profiles, total] = await Promise.all([
      Profile.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(limitNum).lean(),
      Profile.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum);
    const links = buildPaginationLinks("/api/profiles", req.query, pageNum, limitNum, total);

    const response = {
      status: "success",
      page: pageNum,
      limit: limitNum,
      total,
      total_pages: totalPages,
      count: profiles.length,
      links,
      data: profiles.map(formatProfile),
    };

    await cache.set(cacheKey, response, 120);
    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// GET /api/profiles/search 
exports.searchProfiles = async (req, res) => {
  try {
    const { q, page, limit } = req.query;

    if (!q || q.trim() === "") {
      return res.status(400).json({ status: "error", message: "Missing or empty 'q' parameter" });
    }

    const query = q.toLowerCase().trim();
    const filter = {};
    let matched = false;

    const hasMale   = /\bmales?\b|\bmen\b|\bboys?\b/.test(query);
    const hasFemale = /\bfemales?\b|\bwomen\b|\bgirls?\b/.test(query);

    if (hasMale && !hasFemale) { filter.gender = "male"; matched = true; }
    else if (hasFemale && !hasMale) { filter.gender = "female"; matched = true; }
    else if (hasMale && hasFemale) { matched = true; }

    if (/\bchildren\b|\bchild\b|\bkids?\b/.test(query)) {
      filter.age_group = "child"; matched = true;
    } else if (/\bteen(ager)?s?\b/.test(query)) {
      filter.age_group = "teenager"; matched = true;
    } else if (/\badults?\b/.test(query)) {
      filter.age_group = "adult"; matched = true;
    } else if (/\bseniors?\b|\belderly\b/.test(query)) {
      filter.age_group = "senior"; matched = true;
    }

    if (/\byoung\b/.test(query)) {
      filter.age = { $gte: 16, $lte: 24 }; matched = true;
    }

    const aboveMatch = query.match(/(?:above|over)\s+(\d+)/);
    const belowMatch = query.match(/(?:below|under)\s+(\d+)/);
    if (aboveMatch) { filter.age = { ...(filter.age || {}), $gte: Number(aboveMatch[1]) }; matched = true; }
    if (belowMatch) { filter.age = { ...(filter.age || {}), $lte: Number(belowMatch[1]) }; matched = true; }

    const countryMatch = query.match(/(?:from|in)\s+([a-z\s]+?)(?:\s+(?:above|below|over|under|aged?|who|that)|$)/);
    if (countryMatch) {
      const countryQuery = countryMatch[1].trim();
      const matchedEntry = Object.entries(COUNTRY_NAMES).find(([, name]) => name.toLowerCase() === countryQuery);
      if (matchedEntry) { filter.country_id = matchedEntry[0]; matched = true; }
    }

    if (!matched) {
      return res.status(400).json({ status: "error", message: "Unable to interpret query" });
    }

    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const skip     = (pageNum - 1) * limitNum;

    // Normalize filter and cache (same semantic query = same key)
    const cacheKey = buildCacheKey("search", { ...filter, page: pageNum, limit: limitNum });
    const cached = await cache.get(cacheKey);
    if (cached) return res.status(200).json(cached);

    const [profiles, total] = await Promise.all([
      Profile.find(filter).skip(skip).limit(limitNum).lean(),
      Profile.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum);
    const links = buildPaginationLinks("/api/profiles/search", { q }, pageNum, limitNum, total);

    const response = {
      status: "success",
      page: pageNum,
      limit: limitNum,
      total,
      total_pages: totalPages,
      count: profiles.length,
      links,
      data: profiles.map(formatProfile),
    };

    await cache.set(cacheKey, response, 120);
    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// GET /api/profiles/export 
exports.exportProfiles = async (req, res) => {
  try {
    const { sort_by, order } = req.query;
    const filter = buildMongoFilter(req.query);

    const allowedSortFields = ["age", "created_at", "gender_probability"];
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : "created_at";
    const sortOrder = order === "asc" ? 1 : -1;

    const profiles = await Profile.find(filter).sort({ [sortField]: sortOrder });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="profiles_${timestamp}.csv"`);

    const csvStream = stringify({
      headers: ["id", "name", "gender", "gender_probability", "age", "age_group",
                 "country_id", "country_name", "country_probability", "created_at"],
    });

    csvStream.pipe(res);
    for (const p of profiles) {
      csvStream.write([
        p.id, p.name, p.gender, p.gender_probability, p.age, p.age_group,
        p.country_id, p.country_name, p.country_probability, p.created_at,
      ]);
    }
    csvStream.end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

//  GET /api/profiles/:id 
exports.getProfileById = async (req, res) => {
  try {
    const profile = await Profile.findOne({ id: req.params.id });
    if (!profile) {
      return res.status(404).json({ status: "error", message: "Profile not found" });
    }
    return res.status(200).json({ status: "success", data: formatProfile(profile) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

//  DELETE /api/profiles/:id (admin only)
exports.deleteProfile = async (req, res) => {
  try {
    const profile = await Profile.findOneAndDelete({ id: req.params.id });
    if (!profile) {
      return res.status(404).json({ status: "error", message: "Profile not found" });
    }
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};