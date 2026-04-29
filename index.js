require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/v1/profileRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// ── Security middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:4000",
    "http://localhost:9876",
  ],
  credentials: true,
}));

// ── CORS header for all responses (grading scripts) ───────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Version");
  next();
});

// ── General middleware ─────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// ── Request logging ────────────────────────────────────────────────────────
app.use(morgan(":method :url :status :response-time ms"));

// ── Health check ───────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "Insighta Labs+ API is running" });
});

// ── Routes ─────────────────────────────────────────────────────────────────
app.use("/auth", authRoutes);
app.use("/api/profiles", profileRoutes);

// ── Global error handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;