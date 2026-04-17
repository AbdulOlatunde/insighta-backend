const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const Profile = require("../models/Profile");

// Helpers

const getAgeGroup = (age) => {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
};

const formatProfile = (profile) => ({
  id: profile.id,
  name: profile.name,
  gender: profile.gender,
  gender_probability: profile.gender_probability,
  sample_size: profile.sample_size,
  age: profile.age,
  age_group: profile.age_group,
  country_id: profile.country_id,
  country_probability: profile.country_probability,
  created_at: profile.created_at,
});

const formatProfileList = (profile) => ({
  id: profile.id,
  name: profile.name,
  gender: profile.gender,
  age: profile.age,
  age_group: profile.age_group,
  country_id: profile.country_id,
});

//  POST /api/profiles 

exports.createProfile = async (req, res) => {
  try {
    const { name } = req.body;

    // Input validation
    if (name === undefined || name === null) {
      return res.status(400).json({
        status: "error",
        message: "Missing or empty 'name' field",
      });
    }

    if (typeof name !== "string" || name.trim() === "") {
      return res.status(422).json({
        status: "error",
        message: "'name' must be a non-empty string",
      });
    }

    const cleanName = name.trim().toLowerCase();

    // Idempotency to return existing profile if name already stored
    const existing = await Profile.findOne({ name: cleanName });
    if (existing) {
      return res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: formatProfile(existing),
      });
    }

    //  Call all three external APIs in parallel 
    let genderData, agifyData, nationalizeData;

    try {
      const [genderRes, agifyRes, nationalizeRes] = await Promise.all([
        axios.get("https://api.genderize.io", { params: { name: cleanName }, timeout: 5000 }),
        axios.get("https://api.agify.io", { params: { name: cleanName }, timeout: 5000 }),
        axios.get("https://api.nationalize.io", { params: { name: cleanName }, timeout: 5000 }),
      ]);

      genderData      = genderRes.data;
      agifyData       = agifyRes.data;
      nationalizeData = nationalizeRes.data;

    } catch (err) {
      return res.status(502).json({
        status: "error",
        message: "Failed to reach one or more external APIs",
      });
    }

    // Validate Genderize response 
    if (!genderData.gender || genderData.count === 0) {
      return res.status(502).json({
        status: "error",
        message: "Genderize returned an invalid response",
      });
    }

    //  Validate Agify response
    if (agifyData.age === null || agifyData.age === undefined) {
      return res.status(502).json({
        status: "error",
        message: "Agify returned an invalid response",
      });
    }

    //  Validate Nationalize response
    if (!nationalizeData.country || nationalizeData.country.length === 0) {
      return res.status(502).json({
        status: "error",
        message: "Nationalize returned an invalid response",
      });
    }

    // Classification logic 
    const gender             = genderData.gender;
    const gender_probability = genderData.probability;
    const sample_size        = genderData.count;

    const age                = agifyData.age;
    const age_group          = getAgeGroup(age);

    // Pick country with highest probability
    const topCountry          = nationalizeData.country.reduce((a, b) =>
      a.probability > b.probability ? a : b
    );
    const country_id          = topCountry.country_id;
    const country_probability = topCountry.probability;

    // Build and save profile 
    const profile = new Profile({
      id:               uuidv4(),
      name:             cleanName,
      gender,
      gender_probability,
      sample_size,
      age,
      age_group,
      country_id,
      country_probability,
      created_at:       new Date().toISOString(),
    });

    await profile.save();

    return res.status(201).json({
      status: "success",
      data: formatProfile(profile),
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// GET /api/profiles 

exports.getAllProfiles = async (req, res) => {
  try {
    const { gender, country_id, age_group } = req.query;

    const filter = {};

    // Case-insensitive filtering using regex
    if (gender)     filter.gender     = { $regex: new RegExp(`^${gender}$`, "i") };
    if (country_id) filter.country_id = { $regex: new RegExp(`^${country_id}$`, "i") };
    if (age_group)  filter.age_group  = { $regex: new RegExp(`^${age_group}$`, "i") };

    const profiles = await Profile.find(filter);

    return res.status(200).json({
      status: "success",
      count: profiles.length,
      data: profiles.map(formatProfileList),
    });

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
      return res.status(404).json({
        status: "error",
        message: "Profile not found",
      });
    }

    return res.status(200).json({
      status: "success",
      data: formatProfile(profile),
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// DELETE /api/profiles/:id 

exports.deleteProfile = async (req, res) => {
  try {
    const profile = await Profile.findOneAndDelete({ id: req.params.id });

    if (!profile) {
      return res.status(404).json({
        status: "error",
        message: "Profile not found",
      });
    }

    return res.status(204).send();

  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};