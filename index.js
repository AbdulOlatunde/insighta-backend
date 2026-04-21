require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const profileRoutes = require("./routes/profileRoutes");
const app = express();
const PORT = process.env.PORT || 3000;
// Connect to MongoDB
connectDB();
// Middleware
app.use(express.json());
// CORS header on every response
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});
// Health check
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "Genderize API is running" });
});
// Routes
app.use("/api/profiles", profileRoutes);
// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: "error", message: "Internal server error" });
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
module.exports = app;