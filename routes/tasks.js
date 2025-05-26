const express = require("express")
const { body, query, validationResult } = require("express-validator")
const Task = require("../models/Task")
const User = require("../models/User")
const { auth, authorize } = require("../middleware/auth")
const { tenantIsolation } = require("../middleware/tenant")

const router = express.Router()

// Apply authentication and tenant isolation to all routes
router.use(auth)
router.use(tenantIsolation)

// Get tasks with filtering and pagination
router.get(
  "/",
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("status").optional().isIn(["Todo", "In Progress", "Completed", "Expired"]),
    query("priority").optional().isIn(["Low", "Medium", "High"]),
    query("category").optional().isIn(["Bug", "Feature", "Improvement"]),
    query("assignedTo").optional().isMongoId(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const page = Number.parseInt(req.query.page) || 1
      const limit = Number.parseInt(req.query.limit) || 10
      const skip = (page - 1) * limit

      // Build filter
      const filter = { organization: req.organizationId }

      if (req.query.status) filter.status = req.query.status
      if (req.query.priority) filter.priority = req.query.priority
      if (req.query.category) filter.category = req.query.category
      if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo

      // For members, only show tasks assigned to them or created by them
      if (req.user.role === "Member") {
        filter.$or = [{ assignedTo: req.user._id }, { createdBy: req.user._id }]
      }

      const tasks = await Task.find(filter)
        .populate("assignedTo", "name email")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)

      const total = await Task.countDocuments(filter)

      res.json({
        tasks,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      })
    } catch (error) {
      console.error("Get tasks error:", error)
      res.status(500).json({ message: "Server error" })
    }
  },
)

// Get task by ID
router.get("/:id", async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.organizationId,
    })
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .populate("comments.user", "name email")

    if (!task) {
      return res.status(404).json({ message: "Task not found" })
    }

    // Members can only view tasks assigned to them or created by them
    if (req.user.role === "Member") {
      if (!task.assignedTo?.equals(req.user._id) && !task.createdBy.equals(req.user._id)) {
        return res.status(403).json({ message: "Access denied" })
      }
    }

    res.json(task)
  } catch (error) {
    console.error("Get task error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Create task
router.post(
  "/",
  [
    authorize("Admin", "Manager"),
    body("title").trim().isLength({ min: 1, max: 200 }),
    body("description").optional().isLength({ max: 2000 }),
    body("category").isIn(["Bug", "Feature", "Improvement"]),
    body("priority").optional().isIn(["Low", "Medium", "High"]),
    body("dueDate").optional().isISO8601(),
    body("assignedTo").optional().isMongoId(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { title, description, category, priority, dueDate, assignedTo } = req.body

      // Validate assigned user belongs to same organization
      if (assignedTo) {
        const assignedUser = await User.findOne({
          _id: assignedTo,
          organization: req.organizationId,
          isActive: true,
        })

        if (!assignedUser) {
          return res.status(400).json({ message: "Invalid assigned user" })
        }
      }

      const task = new Task({
        title,
        description,
        category,
        priority: priority || "Medium",
        dueDate: dueDate ? new Date(dueDate) : undefined,
        assignedTo: assignedTo || undefined,
        createdBy: req.user._id,
        organization: req.organizationId,
      })

      await task.save()
      await task.populate("assignedTo", "name email")
      await task.populate("createdBy", "name email")

      res.status(201).json(task)
    } catch (error) {
      console.error("Create task error:", error)
      res.status(500).json({ message: "Server error" })
    }
  },
)

// Update task
router.put(
  "/:id",
  [
    body("title").optional().trim().isLength({ min: 1, max: 200 }),
    body("description").optional().isLength({ max: 2000 }),
    body("status").optional().isIn(["Todo", "In Progress", "Completed"]),
    body("priority").optional().isIn(["Low", "Medium", "High"]),
    body("category").optional().isIn(["Bug", "Feature", "Improvement"]),
    body("dueDate").optional().isISO8601(),
    body("assignedTo").optional().isMongoId(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const task = await Task.findOne({
        _id: req.params.id,
        organization: req.organizationId,
      })

      if (!task) {
        return res.status(404).json({ message: "Task not found" })
      }

      // Permission check
      if (req.user.role === "Member") {
        // Members can only update status of tasks assigned to them
        if (!task.assignedTo?.equals(req.user._id)) {
          return res.status(403).json({ message: "Access denied" })
        }
        // Members can only update status
        const allowedFields = ["status"]
        const updateFields = Object.keys(req.body)
        const hasInvalidFields = updateFields.some((field) => !allowedFields.includes(field))

        if (hasInvalidFields) {
          return res.status(403).json({ message: "Members can only update task status" })
        }
      }

      // Validate assigned user if being updated
      if (req.body.assignedTo) {
        const assignedUser = await User.findOne({
          _id: req.body.assignedTo,
          organization: req.organizationId,
          isActive: true,
        })

        if (!assignedUser) {
          return res.status(400).json({ message: "Invalid assigned user" })
        }
      }

      // Update task
      Object.keys(req.body).forEach((key) => {
        if (key === "dueDate" && req.body[key]) {
          task[key] = new Date(req.body[key])
        } else {
          task[key] = req.body[key]
        }
      })

      await task.save()
      await task.populate("assignedTo", "name email")
      await task.populate("createdBy", "name email")

      res.json(task)
    } catch (error) {
      console.error("Update task error:", error)
      res.status(500).json({ message: "Server error" })
    }
  },
)

// Delete task
router.delete("/:id", authorize("Admin", "Manager"), async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      organization: req.organizationId,
    })

    if (!task) {
      return res.status(404).json({ message: "Task not found" })
    }

    res.json({ message: "Task deleted successfully" })
  } catch (error) {
    console.error("Delete task error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Get task statistics
router.get("/stats/overview", async (req, res) => {
  try {
    const filter = { organization: req.organizationId }

    // For members, only show stats for their tasks
    if (req.user.role === "Member") {
      filter.$or = [{ assignedTo: req.user._id }, { createdBy: req.user._id }]
    }

    const stats = await Task.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          todo: { $sum: { $cond: [{ $eq: ["$status", "Todo"] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ["$status", "In Progress"] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
          expired: { $sum: { $cond: [{ $eq: ["$status", "Expired"] }, 1, 0] } },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$status", "Completed"] },
                    { $ne: ["$status", "Expired"] },
                    { $lt: ["$dueDate", new Date()] },
                    { $ne: ["$dueDate", null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ])

    const result = stats[0] || {
      total: 0,
      todo: 0,
      inProgress: 0,
      completed: 0,
      expired: 0,
      overdue: 0,
    }

    res.json(result)
  } catch (error) {
    console.error("Get stats error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
