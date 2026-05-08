const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      // Connection pool which allows concurrent queries without waiting for a free connection
      maxPoolSize: 20,
      minPoolSize: 5,
      // Fail fast if the DB is unreachable at startup
      serverSelectionTimeoutMS: 5000,
      // Reuse connections aggressively
      socketTimeoutMS: 45000,
    });
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;