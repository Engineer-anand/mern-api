const express = require("express")
const mongoose = require("mongoose")

const router = express.Router()

// Health check endpoint
router.get("/", async (req, res) => {
  try {
    // Check database connection
    const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected"

    // Basic health metrics
    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus,
      memory: process.memoryUsage(),
      version: process.version,
    }

    res.json(health)
  } catch (error) {
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: error.message,
    })
  }
})

// Readiness check
router.get("/ready", async (req, res) => {
  try {
    // Check if database is ready
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        status: "not ready",
        reason: "Database not connected",
      })
    }

    res.json({ status: "ready" })
  } catch (error) {
    res.status(503).json({
      status: "not ready",
      error: error.message,
    })
  }
})

// Liveness check
router.get("/live", (req, res) => {
  res.json({ status: "alive" })
})

module.exports = router
