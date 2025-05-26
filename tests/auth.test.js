const request = require("supertest")
const mongoose = require("mongoose")
const app = require("../server")
const User = require("../models/User")
const Organization = require("../models/Organization")

describe("Authentication Endpoints", () => {
  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/task-platform-test"
    await mongoose.connect(mongoUri)
  })

  beforeEach(async () => {
    // Clean up database before each test
    await User.deleteMany({})
    await Organization.deleteMany({})
  })

  afterAll(async () => {
    await mongoose.connection.close()
  })

  describe("POST /api/auth/register", () => {
    it("should register a new user and organization", async () => {
      const userData = {
        name: "John Doe",
        email: "john@example.com",
        password: "password123",
        organizationName: "Test Company",
      }

      const response = await request(app).post("/api/auth/register").send(userData).expect(201)

      expect(response.body).toHaveProperty("token")
      expect(response.body.user).toHaveProperty("id")
      expect(response.body.user.name).toBe(userData.name)
      expect(response.body.user.email).toBe(userData.email)
      expect(response.body.user.role).toBe("Admin")
      expect(response.body.user.organization.name).toBe(userData.organizationName)
    })

    it("should not register user with invalid email", async () => {
      const userData = {
        name: "John Doe",
        email: "invalid-email",
        password: "password123",
        organizationName: "Test Company",
      }

      await request(app).post("/api/auth/register").send(userData).expect(400)
    })

    it("should not register user with short password", async () => {
      const userData = {
        name: "John Doe",
        email: "john@example.com",
        password: "123",
        organizationName: "Test Company",
      }

      await request(app).post("/api/auth/register").send(userData).expect(400)
    })

    it("should not register duplicate email", async () => {
      const userData = {
        name: "John Doe",
        email: "john@example.com",
        password: "password123",
        organizationName: "Test Company",
      }

      // Register first user
      await request(app).post("/api/auth/register").send(userData).expect(201)

      // Try to register with same email
      await request(app).post("/api/auth/register").send(userData).expect(400)
    })
  })

  describe("POST /api/auth/login", () => {
    let user
    let organization

    beforeEach(async () => {
      // Create test organization
      organization = new Organization({
        name: "Test Company",
        createdBy: new mongoose.Types.ObjectId(),
      })
      await organization.save()

      // Create test user
      user = new User({
        name: "John Doe",
        email: "john@example.com",
        password: "password123",
        organization: organization._id,
        role: "Admin",
      })
      await user.save()

      // Update organization with creator
      organization.createdBy = user._id
      await organization.save()
    })

    it("should login with valid credentials", async () => {
      const loginData = {
        email: "john@example.com",
        password: "password123",
      }

      const response = await request(app).post("/api/auth/login").send(loginData).expect(200)

      expect(response.body).toHaveProperty("token")
      expect(response.body.user.email).toBe(loginData.email)
      expect(response.body.user.organization.name).toBe("Test Company")
    })

    it("should not login with invalid email", async () => {
      const loginData = {
        email: "wrong@example.com",
        password: "password123",
      }

      await request(app).post("/api/auth/login").send(loginData).expect(400)
    })

    it("should not login with invalid password", async () => {
      const loginData = {
        email: "john@example.com",
        password: "wrongpassword",
      }

      await request(app).post("/api/auth/login").send(loginData).expect(400)
    })

    it("should not login inactive user", async () => {
      // Deactivate user
      user.isActive = false
      await user.save()

      const loginData = {
        email: "john@example.com",
        password: "password123",
      }

      await request(app).post("/api/auth/login").send(loginData).expect(400)
    })
  })

  describe("GET /api/auth/me", () => {
    let user
    let organization
    let token

    beforeEach(async () => {
      // Create test data and get token
      const userData = {
        name: "John Doe",
        email: "john@example.com",
        password: "password123",
        organizationName: "Test Company",
      }

      const response = await request(app).post("/api/auth/register").send(userData)

      token = response.body.token
    })

    it("should get current user with valid token", async () => {
      const response = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`).expect(200)

      expect(response.body.user).toHaveProperty("id")
      expect(response.body.user.name).toBe("John Doe")
      expect(response.body.user.email).toBe("john@example.com")
    })

    it("should not get user without token", async () => {
      await request(app).get("/api/auth/me").expect(401)
    })

    it("should not get user with invalid token", async () => {
      await request(app).get("/api/auth/me").set("Authorization", "Bearer invalid-token").expect(401)
    })
  })
})
