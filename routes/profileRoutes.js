const express = require("express");
const router = express.Router();
const {
  createProfile,
  getAllProfiles,
  getProfileById,
  deleteProfile,
} = require("../controllers/profileController");

router.post("/", createProfile);
router.get("/", getAllProfiles);
router.get("/:id", getProfileById);
router.delete("/:id", deleteProfile);

module.exports = router;