const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema(
  {
    id:                  { type: String, required: true, unique: true },
    name:                { type: String, required: true, unique: true, trim: true },
    gender:              { type: String, required: true },
    gender_probability:  { type: Number, required: true },
    age:                 { type: Number, required: true },
    age_group:           { type: String, required: true },
    country_id:          { type: String, required: true },
    country_name:        { type: String, required: true },
    country_probability: { type: Number, required: true },
    created_at:          { type: String, required: true },
  },
  { versionKey: false }
);

// Single-field indexes for simple filters 
profileSchema.index({ gender: 1 });
profileSchema.index({ age_group: 1 });
profileSchema.index({ country_id: 1 });
profileSchema.index({ age: 1 });
profileSchema.index({ gender_probability: 1 });
profileSchema.index({ country_probability: 1 });
profileSchema.index({ created_at: 1 });
//profileSchema.index({ name: 1 });

//  Compound indexes for the most common combined queries 
// Covers: gender + country filter (most frequent analyst pattern)
profileSchema.index({ gender: 1, country_id: 1 });
// Covers: gender + age_group filter
profileSchema.index({ gender: 1, age_group: 1 });
// Covers: age range queries
profileSchema.index({ age: 1, gender: 1 });
// Covers: age_group + country
profileSchema.index({ age_group: 1, country_id: 1 });
// Covers: full combined sort by created_at
profileSchema.index({ gender: 1, country_id: 1, created_at: -1 });

module.exports = mongoose.model("Profile", profileSchema);