// =====================================================
// Email Service Utility
// =====================================================

/**
 * Send email (placeholder - integrate with your email service)
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 * @param {Array} options.attachments - Attachments (optional)
 */
const sendEmail = async (options) => {
  try {
    // TODO: Integrate with email service (Nodemailer, SendGrid, etc.)
    // For now, log the email details
    console.log('📧 Email would be sent:', {
      to: options.to,
      subject: options.subject,
      html: options.html ? 'HTML content provided' : null,
      text: options.text || null,
      attachments: options.attachments?.length || 0
    });

    // Example integration with Nodemailer:
    /*
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@crmapp.com',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
    */

    return { success: true, message: 'Email sent successfully (simulated)' };
  } catch (error) {
    console.error('Email sending error:', error);
    throw error;
  }
};

/**
 * Generate proposal email HTML
 */
const generateProposalEmailHTML = (proposal, publicUrl) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Proposal: ${proposal.estimate_number || 'PROP#001'}</h1>
        </div>
        <div class="content">
          <p>Dear ${proposal.client_name || 'Client'},</p>
          <p>We are pleased to present the following proposal for your consideration.</p>
          <p><strong>Proposal Number:</strong> ${proposal.estimate_number || 'N/A'}</p>
          <p><strong>Date:</strong> ${new Date(proposal.estimate_date || Date.now()).toLocaleDateString()}</p>
          <p><strong>Valid Until:</strong> ${proposal.valid_till ? new Date(proposal.valid_till).toLocaleDateString() : 'N/A'}</p>
          <p><strong>Total Amount:</strong> ${proposal.currency || '$'}${parseFloat(proposal.total || 0).toFixed(2)}</p>
          <p style="margin-top: 30px;">
            <a href="${publicUrl}" class="button">View Proposal</a>
          </p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generate estimate email HTML
 */
const generateEstimateEmailHTML = (estimate, publicUrl) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10B981; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .button { display: inline-block; padding: 12px 24px; background: #10B981; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Estimate: ${estimate.estimate_number || 'EST#001'}</h1>
        </div>
        <div class="content">
          <p>Dear ${estimate.client_name || 'Client'},</p>
          <p>Please find attached the estimate for your review.</p>
          <p><strong>Estimate Number:</strong> ${estimate.estimate_number || 'N/A'}</p>
          <p><strong>Date:</strong> ${new Date(estimate.estimate_date || Date.now()).toLocaleDateString()}</p>
          <p><strong>Valid Until:</strong> ${estimate.valid_till ? new Date(estimate.valid_till).toLocaleDateString() : 'N/A'}</p>
          <p><strong>Total Amount:</strong> ${estimate.currency || '$'}${parseFloat(estimate.total || 0).toFixed(2)}</p>
          <p style="margin-top: 30px;">
            <a href="${publicUrl}" class="button">View Estimate</a>
          </p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generate invoice email HTML
 */
const generateInvoiceEmailHTML = (invoice, publicUrl) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #EF4444; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .button { display: inline-block; padding: 12px 24px; background: #EF4444; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Invoice: ${invoice.invoice_number || 'INV#001'}</h1>
        </div>
        <div class="content">
          <p>Dear ${invoice.client_name || 'Client'},</p>
          <p>Please find attached your invoice for payment.</p>
          <p><strong>Invoice Number:</strong> ${invoice.invoice_number || 'N/A'}</p>
          <p><strong>Date:</strong> ${new Date(invoice.invoice_date || Date.now()).toLocaleDateString()}</p>
          <p><strong>Due Date:</strong> ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A'}</p>
          <p><strong>Total Amount:</strong> ${invoice.currency || '$'}${parseFloat(invoice.total || 0).toFixed(2)}</p>
          <p><strong>Status:</strong> ${invoice.status || 'Unpaid'}</p>
          <p style="margin-top: 30px;">
            <a href="${publicUrl}" class="button">View Invoice</a>
          </p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  sendEmail,
  generateProposalEmailHTML,
  generateEstimateEmailHTML,
  generateInvoiceEmailHTML
};

