const express = require("express");
const router = express.Router();
const {
  createProfile,
  getAllProfiles,
  searchProfiles,
  getProfileById,
  deleteProfile,
} = require("../controllers/profileController");

router.post("/", createProfile);
router.get("/search", searchProfiles); 
router.get("/", getAllProfiles);
router.get("/:id", getProfileById);
router.delete("/:id", deleteProfile);

module.exports = router;