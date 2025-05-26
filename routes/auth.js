const express = require("express")
const jwt = require("jsonwebtoken")
const { body, validationResult } = require("express-validator")
const User = require("../models/User")
const Organization = require("../models/Organization")
const { auth } = require("../middleware/auth")

const router = express.Router()

// Helper function to generate a slug from organization name
function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")        // Replace spaces with -
    .replace(/[^\w\-]+/g, "")    // Remove all non-word chars
    .replace(/\-\-+/g, "-")      // Replace multiple - with single -
}
router.post(
  "/register",
  [
    body("name").trim().isLength({ min: 2, max: 100 }),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
    body("organizationName").trim().isLength({ min: 2, max: 100 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { name, email, password, organizationName } = req.body

      // Check if user already exists
      const existingUser = await User.findOne({ email })
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" })
      }

      // 1. Create the user WITHOUT organization yet
      const user = new User({
        name,
        email,
        password,
        role: "Admin",
      })
      await user.save()

      // 2. Create the organization WITH createdBy as user._id
      const organization = new Organization({
        name: organizationName,
        slug: generateSlug(organizationName),
        createdBy: user._id,
      })
      await organization.save()

      // 3. Update user with organization id
      user.organization = organization._id
      await user.save()

      // 4. Generate JWT token
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" })

      res.status(201).json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          organization: {
            id: organization._id,
            name: organization.name,
            slug: organization.slug,
          },
        },
      })
    } catch (error) {
      console.error("Registration error:", error)
      res.status(500).json({ message: "Server error during registration" })
    }
  }
)


// Login
router.post(
  "/login",
  [body("email").isEmail().normalizeEmail(), body("password").exists()],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { email, password } = req.body

      // Find user and populate organization
      const user = await User.findOne({ email, isActive: true }).populate("organization")

      if (!user) {
        return res.status(400).json({ message: "Invalid credentials" })
      }

      // Check password
      const isMatch = await user.comparePassword(password)
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid credentials" })
      }

      // Update last login
      user.lastLogin = new Date()
      await user.save()

      // Generate JWT token
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" })

      res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          organization: {
            id: user.organization._id,
            name: user.organization.name,
            slug: user.organization.slug,
          },
        },
      })
    } catch (error) {
      console.error("Login error:", error)
      res.status(500).json({ message: "Server error during login" })
    }
  }
)

// Get current user
router.get("/me", auth, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        organization: {
          id: req.user.organization._id,
          name: req.user.organization.name,
          slug: req.user.organization.slug,
        },
      },
    })
  } catch (error) {
    console.error("Get user error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Join organization with invite
router.post(
  "/join",
  [
    body("name").trim().isLength({ min: 2, max: 100 }),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
    body("inviteToken").exists(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { name, email, password, inviteToken } = req.body

      // Find organization by invite token
      const existingUser = await User.findOne({
        inviteToken,
        inviteExpires: { $gt: Date.now() },
      }).populate("organization")

      if (!existingUser) {
        return res.status(400).json({ message: "Invalid or expired invite token" })
      }

      // Check if user already exists
      const userExists = await User.findOne({ email })
      if (userExists) {
        return res.status(400).json({ message: "User already exists" })
      }

      // Create new user
      const user = new User({
        name,
        email,
        password,
        organization: existingUser.organization._id,
        role: "Member",
      })

      await user.save()

      // Generate JWT token
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" })

      res.status(201).json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          organization: {
            id: existingUser.organization._id,
            name: existingUser.organization.name,
            slug: existingUser.organization.slug,
          },
        },
      })
    } catch (error) {
      console.error("Join organization error:", error)
      res.status(500).json({ message: "Server error during registration" })
    }
  }
)

module.exports = router