const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshTokenModel");
const { issueAccessToken, issueRefreshToken } = require("../utils/tokens");

const BACKEND_URL = process.env.BACKEND_URL || "https://hng-genderize-production.up.railway.app";

// ── GET /auth/github ───────────────────────────────────────────────────────
// Redirects to GitHub OAuth — web portal flow
exports.githubLogin = (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID_WEB;
  const redirectUri = `${BACKEND_URL}/auth/github/callback`;
  const scope = "read:user user:email";
  const state = Math.random().toString(36).substring(2);

  res.cookie("oauth_state", state, { httpOnly: true, maxAge: 5 * 60 * 1000 });

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;
  res.redirect(url);
};

// ── GET /auth/github/callback ─────────────────────────────────────────────
// Web portal callback
exports.githubCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    const storedState = req.cookies?.oauth_state;

    if (!code) {
      return res.status(400).json({ status: "error", message: "Missing code from GitHub" });
    }

    if (state && storedState && state !== storedState) {
      return res.status(400).json({ status: "error", message: "Invalid OAuth state" });
    }

    const clientId = process.env.GITHUB_CLIENT_ID_WEB;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET_WEB;
    const redirectUri = `${BACKEND_URL}/auth/github/callback`;

    // Exchange code for access token
    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      { client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri },
      { headers: { Accept: "application/json" } }
    );

    const githubToken = tokenRes.data.access_token;
    if (!githubToken) {
      return res.status(502).json({ status: "error", message: "Failed to get GitHub access token" });
    }

    // Get GitHub user info
    const userRes = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${githubToken}` },
    });

    const githubUser = userRes.data;

    // Get email if not public
    let email = githubUser.email;
    if (!email) {
      try {
        const emailRes = await axios.get("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${githubToken}` },
        });
        const primary = emailRes.data.find((e) => e.primary && e.verified);
        email = primary?.email || null;
      } catch (_) {}
    }

    // Upsert user
    let user = await User.findOne({ github_id: String(githubUser.id) });
    if (!user) {
      user = await User.create({
        id: uuidv4(),
        github_id: String(githubUser.id),
        username: githubUser.login,
        email,
        avatar_url: githubUser.avatar_url,
        role: "analyst",
        is_active: true,
        last_login_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    } else {
      user.last_login_at = new Date().toISOString();
      user.avatar_url = githubUser.avatar_url;
      user.email = email || user.email;
      await user.save();
    }

    if (!user.is_active) {
      return res.status(403).json({ status: "error", message: "Account is inactive" });
    }

    const accessToken = issueAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);

    // Set HTTP-only cookies for web portal
    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 3 * 60 * 1000,
    });
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 5 * 60 * 1000,
    });
    res.clearCookie("oauth_state");

    // Return tokens as JSON so web portal can set its own cookies
    return res.status(200).json({
      status: "success",
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: user.id, username: user.username, email: user.email, role: user.role, avatar_url: user.avatar_url },
    });
  } catch (err) {
    console.error("GitHub callback error:", err.message);
    res.status(500).json({ status: "error", message: "Authentication failed" });
  }
};

// ── POST /auth/github/cli-callback ────────────────────────────────────────
// CLI PKCE flow — code + code_verifier sent directly from CLI
exports.cliCallback = async (req, res) => {
  try {
    const { code, code_verifier, state } = req.body;

    if (!code || !code_verifier) {
      return res.status(400).json({ status: "error", message: "Missing code or code_verifier" });
    }

    const clientId = process.env.GITHUB_CLIENT_ID_CLI;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET_CLI;
    const redirectUri = "http://localhost:9876/callback";

    // Exchange code for GitHub token
    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      { client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri },
      { headers: { Accept: "application/json" } }
    );

    const githubToken = tokenRes.data.access_token;
    if (!githubToken) {
      return res.status(502).json({ status: "error", message: "Failed to get GitHub access token" });
    }

    // Get user info
    const userRes = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${githubToken}` },
    });

    const githubUser = userRes.data;

    let email = githubUser.email;
    if (!email) {
      try {
        const emailRes = await axios.get("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${githubToken}` },
        });
        const primary = emailRes.data.find((e) => e.primary && e.verified);
        email = primary?.email || null;
      } catch (_) {}
    }

    let user = await User.findOne({ github_id: String(githubUser.id) });
    if (!user) {
      user = await User.create({
        id: uuidv4(),
        github_id: String(githubUser.id),
        username: githubUser.login,
        email,
        avatar_url: githubUser.avatar_url,
        role: "analyst",
        is_active: true,
        last_login_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    } else {
      user.last_login_at = new Date().toISOString();
      user.avatar_url = githubUser.avatar_url;
      await user.save();
    }

    if (!user.is_active) {
      return res.status(403).json({ status: "error", message: "Account is inactive" });
    }

    const accessToken = issueAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);

    return res.status(200).json({
      status: "success",
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
      },
    });
  } catch (err) {
    console.error("CLI callback error:", err.message);
    res.status(500).json({ status: "error", message: "Authentication failed" });
  }
};

// ── POST /auth/refresh ─────────────────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  try {
    // Accept from body (CLI) or cookie (web)
    const token = req.body.refresh_token || req.cookies?.refresh_token;

    if (!token) {
      return res.status(400).json({ status: "error", message: "Refresh token required" });
    }

    const stored = await RefreshToken.findOne({ token, used: false });
    if (!stored || stored.expires_at < new Date()) {
      return res.status(401).json({ status: "error", message: "Invalid or expired refresh token" });
    }

    // Invalidate old token immediately
    stored.used = true;
    await stored.save();

    const user = await User.findOne({ id: stored.user_id });
    if (!user || !user.is_active) {
      return res.status(403).json({ status: "error", message: "Account not found or inactive" });
    }

    const newAccessToken = issueAccessToken(user);
    const newRefreshToken = await issueRefreshToken(user.id);

    // Update cookies for web
    res.cookie("access_token", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 3 * 60 * 1000,
    });
    res.cookie("refresh_token", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 5 * 60 * 1000,
    });

    return res.status(200).json({
      status: "success",
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    });
  } catch (err) {
    console.error("Refresh error:", err.message);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// ── POST /auth/logout ──────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    const token = req.body.refresh_token || req.cookies?.refresh_token;
    if (token) {
      await RefreshToken.deleteOne({ token });
    }
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    return res.status(200).json({ status: "success", message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// ── GET /auth/me ───────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  const user = req.user;
  return res.status(200).json({
    status: "success",
    data: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
    },
  });
};
