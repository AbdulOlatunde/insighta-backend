const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS header on every response
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

app.get("/api/classify", async (req, res) => {
  const { name } = req.query;

  // Input validation
  if (name === undefined || name === "") {
    return res.status(400).json({
      status: "error",
      message: "Missing or empty 'name' query parameter",
    });
  }

  if (typeof name !== "string") {
    return res.status(422).json({
      status: "error",
      message: "'name' must be a string",
    });
  }

  // Call Genderize API
  let apiResponse;
  try {
    apiResponse = await axios.get("https://api.genderize.io", {
      params: { name },
      timeout: 4500, // stay well under 500ms processing budget; network is external
    });
  } catch (err) {
    return res.status(502).json({
      status: "error",
      message: "Failed to reach the Genderize API",
    });
  }

  const raw = apiResponse.data;

  //Genderize edge cases
  if (!raw.gender || raw.count === 0) {
    return res.status(200).json({
      status: "error",
      message: "No prediction available for the provided name",
    });
  }

  // Processing rules
  const gender      = raw.gender;
  const probability = raw.probability;
  const sample_size = raw.count;                          // renamed
  const is_confident = probability >= 0.7 && sample_size >= 100;
  const processed_at = new Date().toISOString();          // UTC ISO 8601

  return res.status(200).json({
    status: "success",
    data: {
      name,
      gender,
      probability,
      sample_size,
      is_confident,
      processed_at,
    },
  });
});

// Catch-all for unexpected errors
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});