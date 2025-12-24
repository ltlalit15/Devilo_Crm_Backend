// =====================================================
// Worksuite CRM Backend Server
// =====================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const leadRoutes = require('./routes/leadRoutes');
const clientRoutes = require('./routes/clientRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const estimateRoutes = require('./routes/estimateRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const contractRoutes = require('./routes/contractRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const timeTrackingRoutes = require('./routes/timeTrackingRoutes');
const eventRoutes = require('./routes/eventRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const positionRoutes = require('./routes/positionRoutes');
const messageRoutes = require('./routes/messageRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const customFieldRoutes = require('./routes/customFieldRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const companyPackageRoutes = require('./routes/companyPackageRoutes');
const companyRoutes = require('./routes/companyRoutes');
const documentRoutes = require('./routes/documentRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const API_VERSION = process.env.API_VERSION || 'v1';

// =====================================================
// Middleware
// =====================================================

// Security
app.use(helmet());
app.set('trust proxy', 1);

// CORS
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,       // future env based
    'http://localhost:5173',
    'https://crmnew11.netlify.app'
  ].filter(Boolean),
  credentials: true
}));


// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Static files (for uploads)
app.use('/uploads', express.static('uploads'));

// =====================================================
// Routes
// =====================================================

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
const apiBase = `/api/${API_VERSION}`;

app.use(`${apiBase}/auth`, authRoutes);
app.use(`${apiBase}/dashboard`, dashboardRoutes);
app.use(`${apiBase}/users`, userRoutes);
app.use(`${apiBase}/leads`, leadRoutes);
app.use(`${apiBase}/clients`, clientRoutes);
app.use(`${apiBase}/projects`, projectRoutes);
app.use(`${apiBase}/tasks`, taskRoutes);
app.use(`${apiBase}/invoices`, invoiceRoutes);
app.use(`${apiBase}/estimates`, estimateRoutes);
app.use(`${apiBase}/payments`, paymentRoutes);
app.use(`${apiBase}/expenses`, expenseRoutes);
app.use(`${apiBase}/contracts`, contractRoutes);
app.use(`${apiBase}/subscriptions`, subscriptionRoutes);
app.use(`${apiBase}/employees`, employeeRoutes);
app.use(`${apiBase}/attendance`, attendanceRoutes);
app.use(`${apiBase}/time-logs`, timeTrackingRoutes);
app.use(`${apiBase}/events`, eventRoutes);
app.use(`${apiBase}/departments`, departmentRoutes);
app.use(`${apiBase}/positions`, positionRoutes);
app.use(`${apiBase}/messages`, messageRoutes);
app.use(`${apiBase}/tickets`, ticketRoutes);
app.use(`${apiBase}/custom-fields`, customFieldRoutes);
app.use(`${apiBase}/settings`, settingsRoutes);
app.use(`${apiBase}/company-packages`, companyPackageRoutes);
app.use(`${apiBase}/companies`, companyRoutes);
app.use(`${apiBase}/documents`, documentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// =====================================================
// Start Server
// =====================================================

app.listen(PORT, () => {
  console.log(`🚀 Worksuite CRM Backend Server running on port ${PORT}`);
  console.log(`📡 API Base URL: http://localhost:${PORT}${apiBase}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;

