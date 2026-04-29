const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const RefreshToken = require("../models/refreshToken");

const issueAccessToken = (user) => {
  return jwt.sign(
    { id: user.id, role: user.role, username: user.username },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "3m" }
  );
};

const issueRefreshToken = async (user_id) => {
  const token = crypto.randomBytes(64).toString("hex");
  const expires_at = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await RefreshToken.create({ token, user_id, expires_at });
  return token;
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};

module.exports = { issueAccessToken, issueRefreshToken, verifyAccessToken };