require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const Profile = require("./models/Profile");

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    const filePath = path.join(__dirname, "profiles.json");
    if (!fs.existsSync(filePath)) {
      console.error("profiles.json not found. Place the seed file in the project root.");
      process.exit(1);
    }

    const raw  = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const data = raw.profiles || raw; // handles both { profiles: [...] } and [...]
    console.log(`Seeding ${data.length} profiles...`);

    let inserted = 0;
    let skipped  = 0;

    for (const p of data) {
      const cleanName = p.name.trim().toLowerCase();
      const exists = await Profile.findOne({ name: cleanName });
      if (exists) { skipped++; continue; }

      await Profile.create({
        id:                  uuidv4(),
        name:                cleanName,
        gender:              p.gender,
        gender_probability:  p.gender_probability,
        age:                 p.age,
        age_group:           p.age_group,
        country_id:          p.country_id,
        country_name:        p.country_name,
        country_probability: p.country_probability,
        created_at:          new Date().toISOString(),
      });
      inserted++;
    }

    console.log(`Done. Inserted: ${inserted}, Skipped (duplicates): ${skipped}`);
    process.exit(0);

  } catch (err) {
    console.error("Seed error:", err.message);
    process.exit(1);
  }
};

seedDB();