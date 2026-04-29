const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true, unique: true, trim: true },
    gender: { type: String, required: true },
    gender_probability: { type: Number, required: true },
    age: { type: Number, required: true },
    age_group: { type: String, required: true },
    country_id: { type: String, required: true },
    country_name: { type: String, required: true },
    country_probability: { type: Number, required: true },
    created_at: { type: String, required: true },
  },
  { versionKey: false }
);

profileSchema.index({ gender: 1 });
profileSchema.index({ age_group: 1 });
profileSchema.index({ country_id: 1 });
profileSchema.index({ age: 1 });
profileSchema.index({ gender_probability: 1 });
profileSchema.index({ country_probability: 1 });
profileSchema.index({ created_at: 1 });


module.exports = mongoose.model("Profile", profileSchema);