// =====================================================
// Pagination Utility
// =====================================================

/**
 * Parse and validate pagination parameters from request query
 * @param {Object} query - Request query object
 * @param {Object} options - Options with defaults
 * @returns {Object} - { page, pageSize, limit, offset }
 */
const parsePagination = (query, options = {}) => {
  const defaultPageSize = options.defaultPageSize || 10;
  const maxPageSize = options.maxPageSize || 100;
  
  // Safely convert to numbers
  let page = Number(query.page);
  let pageSize = Number(query.pageSize);
  
  // Validate and set defaults
  if (!Number.isInteger(page) || page < 1) {
    page = 1;
  }
  
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    pageSize = defaultPageSize;
  }
  
  // Enforce maximum page size
  if (pageSize > maxPageSize) {
    pageSize = maxPageSize;
  }
  
  // Calculate offset
  const offset = (page - 1) * pageSize;
  
  return {
    page,
    pageSize,
    limit: pageSize,
    offset
  };
};

/**
 * Get pagination metadata for response
 * @param {Number} total - Total number of records
 * @param {Number} page - Current page
 * @param {Number} pageSize - Page size
 * @returns {Object} - Pagination metadata
 */
const getPaginationMeta = (total, page, pageSize) => {
  const totalPages = Math.ceil(total / pageSize);
  
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1
  };
};

module.exports = {
  parsePagination,
  getPaginationMeta
};

