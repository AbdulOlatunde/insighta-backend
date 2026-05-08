const express = require("express");
const multer  = require("multer");
const router  = express.Router();
const {
  createProfile,
  getAllProfiles,
  searchProfiles,
  exportProfiles,
  getProfileById,
  deleteProfile,
} = require("../../controllers/profileController");
const { importCSV } = require("../../controllers/importController");
const { authenticate, requireAdmin, requireApiVersion } = require("../../middleware/auth");
const { apiLimiter } = require("../../middleware/rateLimiter");

// Multer: store in memory (buffer), 50MB max, CSV only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
});

// All profile routes require auth + API version header + rate limiting
router.use(authenticate, requireApiVersion, apiLimiter);

router.post("/",        requireAdmin, createProfile);
router.post("/import",  requireAdmin, upload.single("file"), importCSV);
router.get("/search",   searchProfiles);
router.get("/export",   exportProfiles);
router.get("/",         getAllProfiles);
router.get("/:id",      getProfileById);
router.delete("/:id",   requireAdmin, deleteProfile);

module.exports = router;