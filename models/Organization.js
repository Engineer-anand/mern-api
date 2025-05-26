const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    settings: {
      theme: {
        type: String,
        enum: ["light", "dark", "auto"],
        default: "light",
      },
      allowPublicSignup: {
        type: Boolean,
        default: false,
      },
      defaultRole: {
        type: String,
        enum: ["Manager", "Member"],
        default: "Member",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for performance
organizationSchema.index({ slug: 1 });
organizationSchema.index({ createdBy: 1 });

// Generate unique slug from name before saving
organizationSchema.pre("save", async function (next) {
  if (this.isModified("name")) {
    let baseSlug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    let slug = baseSlug;
    let count = 1;

    // Check if slug exists; if yes, add suffix -1, -2, etc.
    while (
      await mongoose.models.Organization.findOne({
        slug,
        _id: { $ne: this._id }, // exclude current doc for updates
      })
    ) {
      slug = `${baseSlug}-${count++}`;
    }

    this.slug = slug;
  }
  next();
});

module.exports = mongoose.model("Organization", organizationSchema);
