const { verifyAccessToken } = require("../utils/tokens");
const User = require("../models/User");

// Authenticate every request
const authenticate = async (req, res, next) => {
  try {
    let token = null;

    // Check Authorization header (CLI)
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    // Check HTTP-only cookie (Web portal)
    if (!token && req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) {
      return res.status(401).json({ status: "error", message: "Authentication required" });
    }

    const decoded = verifyAccessToken(token);

    const user = await User.findOne({ id: decoded.id });
    if (!user) {
      return res.status(401).json({ status: "error", message: "User not found" });
    }
    if (!user.is_active) {
      return res.status(403).json({ status: "error", message: "Account is inactive" });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ status: "error", message: "Invalid or expired token" });
  }
};

// Require admin role
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ status: "error", message: "Admin access required" });
  }
  next();
};

// Require API version header
const requireApiVersion = (req, res, next) => {
  const version = req.headers["x-api-version"];
  if (!version) {
    return res.status(400).json({ status: "error", message: "API version header required" });
  }
  next();
};

module.exports = { authenticate, requireAdmin, requireApiVersion };