const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      
    },
    role: {
      type: String,
      enum: ["Admin", "Manager", "Member"],
      default: "Member",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    inviteToken: {
      type: String,
    },
    inviteExpires: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
)

// Index for performance
userSchema.index({ email: 1, organization: 1 })
userSchema.index({ organization: 1, role: 1 })

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next()

  try {
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const user = this.toObject()
  delete user.password
  delete user.inviteToken
  return user
}

module.exports = mongoose.model("User", userSchema)
