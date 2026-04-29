const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true },
    user_id: { type: String, required: true },
    expires_at: { type: Date, required: true },
    used: { type: Boolean, default: false },
  },
  { versionKey: false }
);

// Auto-delete expired tokens
refreshTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports =
  mongoose.models.RefreshToken ||
  mongoose.model("RefreshToken", refreshTokenSchema);