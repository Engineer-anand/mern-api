const cron = require("node-cron")
const Task = require("../models/Task")

// Run every hour to check for expired tasks
const taskExpirationJob = cron.schedule(
  "0 * * * *",
  async () => {
    try {
      console.log("Running task expiration job...")

      const now = new Date()

      // Find tasks that are overdue and not completed or expired
      const expiredTasks = await Task.updateMany(
        {
          dueDate: { $lt: now },
          status: { $nin: ["Completed", "Expired"] },
        },
        {
          $set: { status: "Expired" },
        },
      )

      if (expiredTasks.modifiedCount > 0) {
        console.log(`Expired ${expiredTasks.modifiedCount} overdue tasks`)
      }
    } catch (error) {
      console.error("Task expiration job error:", error)
    }
  },
  {
    scheduled: false, // Don't start automatically
  },
)

module.exports = taskExpirationJob
