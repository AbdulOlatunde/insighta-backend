const express = require("express");
const router = express.Router();
const {
  githubLogin,
  githubCallback,
  cliCallback,
  refreshToken,
  logout,
  getMe,
} = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");

router.get("/github", authLimiter, githubLogin);
router.get("/github/callback", authLimiter, githubCallback);
router.post("/github/cli-callback", authLimiter, cliCallback);
router.post("/refresh", authLimiter, refreshToken);
router.post("/logout", authenticate, logout);
router.get("/me", authenticate, getMe);

module.exports = router;