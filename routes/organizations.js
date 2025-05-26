const express = require("express")
const { body, validationResult } = require("express-validator")
const crypto = require("crypto")
const User = require("../models/User")
const Organization = require("../models/Organization")
const { auth, authorize } = require("../middleware/auth")
const { tenantIsolation } = require("../middleware/tenant")

const router = express.Router()

// Apply authentication and tenant isolation to all routes
router.use(auth)
router.use(tenantIsolation)

// Get organization details
router.get("/", async (req, res) => {
  try {
    const organization = await Organization.findById(req.organizationId).populate("createdBy", "name email")

    if (!organization) {
      return res.status(404).json({ message: "Organization not found" })
    }

    res.json(organization)
  } catch (error) {
    console.error("Get organization error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Update organization settings
router.put(
  "/settings",
  [
    authorize("Admin"),
    body("name").optional().trim().isLength({ min: 2, max: 100 }),
    body("description").optional().isLength({ max: 500 }),
    body("settings.theme").optional().isIn(["light", "dark", "auto"]),
    body("settings.allowPublicSignup").optional().isBoolean(),
    body("settings.defaultRole").optional().isIn(["Manager", "Member"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const organization = await Organization.findById(req.organizationId)
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" })
      }

      // Update fields
      if (req.body.name) organization.name = req.body.name
      if (req.body.description !== undefined) organization.description = req.body.description
      if (req.body.settings) {
        organization.settings = { ...organization.settings, ...req.body.settings }
      }

      await organization.save()
      res.json(organization)
    } catch (error) {
      console.error("Update organization error:", error)
      res.status(500).json({ message: "Server error" })
    }
  },
)

// Get organization members
router.get("/members", async (req, res) => {
  try {
    const members = await User.find({
      organization: req.organizationId,
      isActive: true,
    })
      .select("-password")
      .sort({ createdAt: -1 })

    res.json(members)
  } catch (error) {
    console.error("Get members error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Generate invite token
router.post(
  "/invite",
  [
    authorize("Admin", "Manager"),
    body("email").isEmail().normalizeEmail(),
    body("role").optional().isIn(["Manager", "Member"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { email, role = "Member" } = req.body

      // Check if user already exists
      const existingUser = await User.findOne({ email })
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" })
      }

      // Generate invite token
      const inviteToken = crypto.randomBytes(32).toString("hex")
      const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

      // Create placeholder user with invite token
      const inviteUser = new User({
        name: "Invited User",
        email,
        password: "temporary", // Will be replaced when user accepts invite
        organization: req.organizationId,
        role,
        isActive: false,
        inviteToken,
        inviteExpires,
      })

      await inviteUser.save()

      res.json({
        message: "Invite created successfully",
        inviteToken,
        inviteUrl: `${process.env.FRONTEND_URL}/join?token=${inviteToken}`,
        expiresAt: inviteExpires,
      })
    } catch (error) {
      console.error("Create invite error:", error)
      res.status(500).json({ message: "Server error" })
    }
  },
)

// Update member role
router.put(
  "/members/:userId/role",
  [authorize("Admin"), body("role").isIn(["Admin", "Manager", "Member"])],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { role } = req.body
      const { userId } = req.params

      // Can't change own role
      if (userId === req.user._id.toString()) {
        return res.status(400).json({ message: "Cannot change your own role" })
      }

      const user = await User.findOne({
        _id: userId,
        organization: req.organizationId,
        isActive: true,
      })

      if (!user) {
        return res.status(404).json({ message: "User not found" })
      }

      user.role = role
      await user.save()

      res.json({ message: "User role updated successfully", user })
    } catch (error) {
      console.error("Update member role error:", error)
      res.status(500).json({ message: "Server error" })
    }
  },
)

// Remove member
router.delete("/members/:userId", authorize("Admin"), async (req, res) => {
  try {
    const { userId } = req.params

    // Can't remove yourself
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: "Cannot remove yourself" })
    }

    const user = await User.findOne({
      _id: userId,
      organization: req.organizationId,
    })

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    user.isActive = false
    await user.save()

    res.json({ message: "User removed successfully" })
  } catch (error) {
    console.error("Remove member error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
