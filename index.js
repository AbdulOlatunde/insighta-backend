const express = require("express");
const axios = require("axios");

const app = express();

// CORS header on every response
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// Health check route
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "Genderize API is running" });
});

app.get("/api/classify", async (req, res) => {
  const { name } = req.query;

  // Input validation
  if (name === undefined || name === null) {
    return res.status(400).json({
      status: "error",
      message: "Missing or empty 'name' query parameter",
    });
  }

  if (typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({
      status: "error",
      message: "Missing or empty 'name' query parameter",
    });
  }

  // Call Genderize API
  let apiResponse;
  try {
    apiResponse = await axios.get("https://api.genderize.io", {
      params: { name: name.trim() },
      timeout: 4500,
    });
  } catch (err) {
    return res.status(502).json({
      status: "error",
      message: "Failed to reach the Genderize API",
    });
  }

  const raw = apiResponse.data;

  // Genderize edge cases
  if (!raw.gender || raw.count === 0) {
    return res.status(200).json({
      status: "error",
      message: "No prediction available for the provided name",
    });
  }

  // Processing rules
  const gender       = raw.gender;
  const probability  = raw.probability;
  const sample_size  = raw.count;
  const is_confident = probability >= 0.7 && sample_size >= 100;
  const processed_at = new Date().toISOString();

  return res.status(200).json({
    status: "success",
    data: {
      name: name.trim(),
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


module.exports = app;