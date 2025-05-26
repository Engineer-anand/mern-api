const mongoose = require("mongoose")

// Middleware to ensure data isolation per organization
const tenantIsolation = (req, res, next) => {
  if (!req.user || !req.user.organization) {
    return res.status(401).json({ message: "Organization context required" })
  }

  // Add organization filter to all queries
  req.organizationId = req.user.organization._id
  next()
}

// Helper function to add organization filter to queries
const addOrganizationFilter = (query, organizationId) => {
  if (query.getFilter) {
    // Mongoose query
    query.where({ organization: organizationId })
  } else {
    // Plain object
    query.organization = organizationId
  }
  return query
}

module.exports = { tenantIsolation, addOrganizationFilter }
