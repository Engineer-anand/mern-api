const request = require("supertest")
const mongoose = require("mongoose")
const app = require("../server")
const User = require("../models/User")
const Organization = require("../models/Organization")
const Task = require("../models/Task")

describe("Task Endpoints", () => {
  let adminUser, memberUser, organization, adminToken, memberToken

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/task-platform-test"
    await mongoose.connect(mongoUri)
  })

  beforeEach(async () => {
    // Clean up database
    await User.deleteMany({})
    await Organization.deleteMany({})
    await Task.deleteMany({})

    // Create test organization
    organization = new Organization({
      name: "Test Company",
      createdBy: new mongoose.Types.ObjectId(),
    })
    await organization.save()

    // Create admin user
    adminUser = new User({
      name: "Admin User",
      email: "admin@example.com",
      password: "password123",
      organization: organization._id,
      role: "Admin",
    })
    await adminUser.save()

    // Create member user
    memberUser = new User({
      name: "Member User",
      email: "member@example.com",
      password: "password123",
      organization: organization._id,
      role: "Member",
    })
    await memberUser.save()

    // Update organization with creator
    organization.createdBy = adminUser._id
    await organization.save()

    // Get tokens
    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "password123" })
    adminToken = adminLogin.body.token

    const memberLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "member@example.com", password: "password123" })
    memberToken = memberLogin.body.token
  })

  afterAll(async () => {
    await mongoose.connection.close()
  })

  describe("POST /api/tasks", () => {
    it("should create task as admin", async () => {
      const taskData = {
        title: "Test Task",
        description: "Test Description",
        category: "Bug",
        priority: "High",
        assignedTo: memberUser._id,
      }

      const response = await request(app)
        .post("/api/tasks")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(taskData)
        .expect(201)

      expect(response.body.title).toBe(taskData.title)
      expect(response.body.category).toBe(taskData.category)
      expect(response.body.priority).toBe(taskData.priority)
      expect(response.body.status).toBe("Todo")
      expect(response.body.createdBy._id).toBe(adminUser._id.toString())
    })

    it("should not create task as member", async () => {
      const taskData = {
        title: "Test Task",
        description: "Test Description",
        category: "Bug",
      }

      await request(app).post("/api/tasks").set("Authorization", `Bearer ${memberToken}`).send(taskData).expect(403)
    })

    it("should not create task without authentication", async () => {
      const taskData = {
        title: "Test Task",
        category: "Bug",
      }

      await request(app).post("/api/tasks").send(taskData).expect(401)
    })

    it("should not create task with invalid data", async () => {
      const taskData = {
        title: "", // Empty title
        category: "InvalidCategory",
      }

      await request(app).post("/api/tasks").set("Authorization", `Bearer ${adminToken}`).send(taskData).expect(400)
    })
  })

  describe("GET /api/tasks", () => {
    let task1, task2

    beforeEach(async () => {
      // Create test tasks
      task1 = new Task({
        title: "Task 1",
        description: "Description 1",
        category: "Bug",
        priority: "High",
        status: "Todo",
        createdBy: adminUser._id,
        organization: organization._id,
        assignedTo: memberUser._id,
      })
      await task1.save()

      task2 = new Task({
        title: "Task 2",
        description: "Description 2",
        category: "Feature",
        priority: "Medium",
        status: "In Progress",
        createdBy: adminUser._id,
        organization: organization._id,
      })
      await task2.save()
    })

    it("should get all tasks as admin", async () => {
      const response = await request(app).get("/api/tasks").set("Authorization", `Bearer ${adminToken}`).expect(200)

      expect(response.body.tasks).toHaveLength(2)
      expect(response.body.pagination.total).toBe(2)
    })

    it("should get only assigned tasks as member", async () => {
      const response = await request(app).get("/api/tasks").set("Authorization", `Bearer ${memberToken}`).expect(200)

      expect(response.body.tasks).toHaveLength(1)
      expect(response.body.tasks[0]._id).toBe(task1._id.toString())
    })

    it("should filter tasks by status", async () => {
      const response = await request(app)
        .get("/api/tasks?status=Todo")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.tasks).toHaveLength(1)
      expect(response.body.tasks[0].status).toBe("Todo")
    })

    it("should paginate tasks", async () => {
      const response = await request(app)
        .get("/api/tasks?page=1&limit=1")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.tasks).toHaveLength(1)
      expect(response.body.pagination.page).toBe(1)
      expect(response.body.pagination.limit).toBe(1)
      expect(response.body.pagination.pages).toBe(2)
    })
  })

  describe("PUT /api/tasks/:id", () => {
    let task

    beforeEach(async () => {
      task = new Task({
        title: "Test Task",
        description: "Test Description",
        category: "Bug",
        priority: "Medium",
        status: "Todo",
        createdBy: adminUser._id,
        organization: organization._id,
        assignedTo: memberUser._id,
      })
      await task.save()
    })

    it("should update task as admin", async () => {
      const updateData = {
        title: "Updated Task",
        status: "In Progress",
        priority: "High",
      }

      const response = await request(app)
        .put(`/api/tasks/${task._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200)

      expect(response.body.title).toBe(updateData.title)
      expect(response.body.status).toBe(updateData.status)
      expect(response.body.priority).toBe(updateData.priority)
    })

    it("should update only status as member", async () => {
      const updateData = {
        status: "In Progress",
      }

      const response = await request(app)
        .put(`/api/tasks/${task._id}`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send(updateData)
        .expect(200)

      expect(response.body.status).toBe(updateData.status)
    })

    it("should not update non-status fields as member", async () => {
      const updateData = {
        title: "Updated Title",
        priority: "High",
      }

      await request(app)
        .put(`/api/tasks/${task._id}`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send(updateData)
        .expect(403)
    })

    it("should not update task not assigned to member", async () => {
      // Create task not assigned to member
      const otherTask = new Task({
        title: "Other Task",
        category: "Bug",
        createdBy: adminUser._id,
        organization: organization._id,
      })
      await otherTask.save()

      const updateData = {
        status: "In Progress",
      }

      await request(app)
        .put(`/api/tasks/${otherTask._id}`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send(updateData)
        .expect(403)
    })
  })

  describe("DELETE /api/tasks/:id", () => {
    let task

    beforeEach(async () => {
      task = new Task({
        title: "Test Task",
        category: "Bug",
        createdBy: adminUser._id,
        organization: organization._id,
      })
      await task.save()
    })

    it("should delete task as admin", async () => {
      await request(app).delete(`/api/tasks/${task._id}`).set("Authorization", `Bearer ${adminToken}`).expect(200)

      const deletedTask = await Task.findById(task._id)
      expect(deletedTask).toBeNull()
    })

    it("should not delete task as member", async () => {
      await request(app).delete(`/api/tasks/${task._id}`).set("Authorization", `Bearer ${memberToken}`).expect(403)
    })

    it("should not delete non-existent task", async () => {
      const fakeId = new mongoose.Types.ObjectId()

      await request(app).delete(`/api/tasks/${fakeId}`).set("Authorization", `Bearer ${adminToken}`).expect(404)
    })
  })

  describe("GET /api/tasks/stats/overview", () => {
    beforeEach(async () => {
      // Create test tasks with different statuses
      const tasks = [
        { status: "Todo", category: "Bug", createdBy: adminUser._id, organization: organization._id },
        { status: "Todo", category: "Feature", createdBy: adminUser._id, organization: organization._id },
        { status: "In Progress", category: "Bug", createdBy: adminUser._id, organization: organization._id },
        { status: "Completed", category: "Feature", createdBy: adminUser._id, organization: organization._id },
        { status: "Expired", category: "Bug", createdBy: adminUser._id, organization: organization._id },
      ]

      for (const taskData of tasks) {
        const task = new Task({
          title: `Task ${taskData.status}`,
          ...taskData,
        })
        await task.save()
      }
    })

    it("should get task statistics", async () => {
      const response = await request(app)
        .get("/api/tasks/stats/overview")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.total).toBe(5)
      expect(response.body.todo).toBe(2)
      expect(response.body.inProgress).toBe(1)
      expect(response.body.completed).toBe(1)
      expect(response.body.expired).toBe(1)
    })
  })
})
