const { parse } = require("csv-parse");
const { v4: uuidv4 } = require("uuid");
const { Readable } = require("stream");
const Profile = require("../models/Profile");
const { del } = require("../utils/cache");

const VALID_GENDERS    = new Set(["male", "female"]);
const VALID_AGE_GROUPS = new Set(["child", "teenager", "adult", "senior"]);
const CHUNK_SIZE       = 500; // bulk insert batch size

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

const REQUIRED_FIELDS = [
  "name", "gender", "gender_probability", "age",
  "age_group", "country_id", "country_probability",
];

const validateRow = (row) => {
  // Check all required fields present
  for (const field of REQUIRED_FIELDS) {
    if (!row[field] || String(row[field]).trim() === "") {
      return { valid: false, reason: "missing_fields" };
    }
  }

  const gender = String(row.gender).toLowerCase().trim();
  if (!VALID_GENDERS.has(gender)) {
    return { valid: false, reason: "invalid_gender" };
  }

  const age = Number(row.age);
  if (!Number.isInteger(age) || age < 0 || age > 150) {
    return { valid: false, reason: "invalid_age" };
  }

  const age_group = String(row.age_group).toLowerCase().trim();
  if (!VALID_AGE_GROUPS.has(age_group)) {
    return { valid: false, reason: "invalid_age_group" };
  }

  const gender_probability = Number(row.gender_probability);
  const country_probability = Number(row.country_probability);
  if (
    isNaN(gender_probability) || gender_probability < 0 || gender_probability > 1 ||
    isNaN(country_probability) || country_probability < 0 || country_probability > 1
  ) {
    return { valid: false, reason: "invalid_probability" };
  }

  const country_id = String(row.country_id).trim().toUpperCase();
  if (!country_id || country_id.length < 2) {
    return { valid: false, reason: "invalid_country" };
  }

  return { valid: true };
};

const buildProfile = (row) => ({
  id: uuidv4(),
  name: String(row.name).trim().toLowerCase(),
  gender: String(row.gender).toLowerCase().trim(),
  gender_probability: Number(row.gender_probability),
  age: Number(row.age),
  age_group: String(row.age_group).toLowerCase().trim(),
  country_id: String(row.country_id).trim().toUpperCase(),
  country_name: COUNTRY_NAMES[String(row.country_id).trim().toUpperCase()] || String(row.country_id).trim(),
  country_probability: Number(row.country_probability),
  created_at: new Date().toISOString(),
});

// POST /api/profiles/import
exports.importCSV = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: "error", message: "No CSV file uploaded" });
  }

  const stats = {
    total_rows: 0,
    inserted: 0,
    skipped: 0,
    reasons: {},
  };

  const trackSkip = (reason) => {
    stats.skipped++;
    stats.reasons[reason] = (stats.reasons[reason] || 0) + 1;
  };

  try {
    // Stream the uploaded buffer which never loads the full file into memory
    const readable = Readable.from(req.file.buffer);
    const parser = readable.pipe(
      parse({
        columns: true,         
        trim: true,
        skip_empty_lines: true,
        relax_column_count: true, 
        encoding: "utf8",
      })
    );

    let chunk = [];

    const flushChunk = async () => {
      if (chunk.length === 0) return;

      const names = chunk.map((p) => p.name);

      // Find which names already exist in one query
      const existing = await Profile.find(
        { name: { $in: names } },
        { name: 1, _id: 0 }
      ).lean();
      const existingSet = new Set(existing.map((e) => e.name));

      const toInsert = [];
      for (const profile of chunk) {
        if (existingSet.has(profile.name)) {
          trackSkip("duplicate_name");
        } else {
          toInsert.push(profile);
        }
      }

      if (toInsert.length > 0) {
        // ordered: false will allow other inserts to continue if one fails
        try {
          const result = await Profile.insertMany(toInsert, {
            ordered: false,
            lean: true,
          });
          stats.inserted += result.length;
        } catch (bulkErr) {
          // Handle partial bulk insert as some mayhave succeeded
          if (bulkErr.insertedDocs) {
            stats.inserted += bulkErr.insertedDocs.length;
          }
          const dupes = bulkErr.writeErrors?.filter(
            (e) => e.code === 11000
          ).length || 0;
          if (dupes > 0) {
            stats.skipped += dupes;
            stats.reasons["duplicate_name"] = (stats.reasons["duplicate_name"] || 0) + dupes;
          }
        }
      }

      chunk = [];
    };

    for await (const row of parser) {
      stats.total_rows++;

      // Skip malformed rows (wrong column count)
      if (typeof row !== "object" || Array.isArray(row)) {
        trackSkip("malformed_row");
        continue;
      }

      const { valid, reason } = validateRow(row);
      if (!valid) {
        trackSkip(reason);
        continue;
      }

      chunk.push(buildProfile(row));

      // Flush every CHUNK_SIZE rows to avoid memory buildup
      if (chunk.length >= CHUNK_SIZE) {
        await flushChunk();
      }
    }

    // Flush any remaining rows
    await flushChunk();

    // Invalidate profile cache since new data was inserted
    await del("profiles:*");

    return res.status(200).json({
      status: "success",
      total_rows: stats.total_rows,
      inserted: stats.inserted,
      skipped: stats.skipped,
      reasons: stats.reasons,
    });

  } catch (err) {
    console.error("CSV import error:", err.message);
    return res.status(500).json({
      status: "error",
      message: "Import failed: " + err.message,
      partial_stats: stats,
    });
  }
};