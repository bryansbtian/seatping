import nodemailer from 'nodemailer';

// Create a transporter using SMTP
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'bryansusanto22@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'your-app-password-here', // Use app password for Gmail
  },
  tls: {
    rejectUnauthorized: false
  }
});

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string; // Optional custom sender email
}

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  try {
    console.log('[EMAIL] Attempting to send email to:', options.to);
    console.log('[EMAIL] Using transporter config:', {
      host: (transporter.options as any).host,
      port: (transporter.options as any).port,
      secure: (transporter.options as any).secure,
      user: (transporter.options as any).auth?.user
    });

    const mailOptions = {
      from: options.from || 'bryansusanto22@gmail.com',
      to: options.to,
      subject: options.subject,
      html: options.html,
    };

    console.log('[EMAIL] Mail options prepared, sending...');
    const info = await transporter.sendMail(mailOptions);
    console.log('[EMAIL] Email sent successfully:', info.messageId);
    console.log('[EMAIL] Response:', info);
    return true;
  } catch (error: any) {
    console.error('[EMAIL] Error sending email:', error);
    console.error('[EMAIL] Error details:', {
      message: error?.message,
      code: error?.code,
      command: error?.command
    });
    return false;
  }
};

export const sendPasswordResetEmail = async (email: string, resetToken: string): Promise<boolean> => {
  const resetUrl = `${process.env.FRONTEND_URL || 'https://www.seatping.biz'}/reset?token=${resetToken}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 28px;">SeatPing</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Password Reset Request</p>
      </div>
      
      <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-bottom: 20px;">Reset Your Password</h2>
        <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
          You requested a password reset for your SeatPing account. Click the button below to reset your password.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
            Reset Password
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px; margin-top: 25px;">
          If you didn't request this password reset, you can safely ignore this email. The link will expire in 1 hour.
        </p>
        
        <p style="color: #666; font-size: 14px; margin-top: 15px;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${resetUrl}" style="color: #667eea; word-break: break-all;">${resetUrl}</a>
        </p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
        <p>© 2025 SeatPing. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Reset Your SeatPing Password',
    html,
    from: 'bryan.susanto@seatping.biz', // Use business email for password resets
  });
};

export const sendPlanChangeEmail = async (email: string, newPlan: string): Promise<boolean> => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 28px;">SeatPing</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Subscription Plan Update</p>
      </div>
      
      <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-bottom: 20px;">Your Plan Has Been Updated</h2>
        <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
          Your SeatPing subscription has been successfully updated to the <strong>${newPlan}</strong> plan.
        </p>
        
        <p style="color: #666; font-size: 14px; margin-top: 25px;">
          You can view your subscription details and manage your account in your business dashboard.
        </p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
        <p>© 2025 SeatPing. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Your SeatPing Subscription Has Been Updated',
    html,
  });
};

export const sendSubscriptionCancellationEmail = async (email: string): Promise<boolean> => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #d32f2f 0%, #c2185b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 28px;">SeatPing</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Subscription Canceled</p>
      </div>

      <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-bottom: 20px;">Your Subscription Has Been Canceled</h2>
        <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
          Your SeatPing subscription has been successfully canceled. We're sorry to see you go.
        </p>

        <p style="color: #666; font-size: 14px; margin-top: 25px;">
          If you have any feedback, please let us know. You can resubscribe at any time from your dashboard.
        </p>
      </div>

      <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
        <p>© 2025 SeatPing. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Your SeatPing Subscription Has Been Canceled',
    html,
  });
};

export interface SalesInquiryData {
  businessName: string;
  businessWebsite?: string;
  contactName: string;
  workEmail: string;
  phone?: string;
  locations?: string;
  smsPerMonth?: string;
  customersPerDay?: string;
  useCase: string;
  budget: string;
  subject: string;
  message: string;
}

export interface FeedbackData {
  name: string;
  email: string;
  businessName?: string;
  phone?: string;
  feedbackType: string;
  subject: string;
  message: string;
  severity?: string;
}

export const sendFeedbackEmail = async (data: FeedbackData): Promise<boolean> => {
  const feedbackTypeLabels: Record<string, string> = {
    bug: 'Bug / Something Broken',
    ux: 'UX / Usability Issue',
    feature: 'Feature Request',
    billing: 'Pricing / Billing',
    other: 'Other'
  };

  const severityLabels: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High'
  };

  // Determine severity color and emoji
  const getSeverityStyle = (severity?: string) => {
    switch (severity) {
      case 'high':
        return { color: '#d32f2f', emoji: '🔴', label: 'High Priority' };
      case 'medium':
        return { color: '#f57c00', emoji: '🟡', label: 'Medium Priority' };
      case 'low':
        return { color: '#388e3c', emoji: '🟢', label: 'Low Priority' };
      default:
        return { color: '#666', emoji: '', label: '' };
    }
  };

  const severityStyle = getSeverityStyle(data.severity);
  const isIssue = ['bug', 'ux', 'billing'].includes(data.feedbackType);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 28px;">SeatPing</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">New Feedback Received</p>
      </div>

      <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
        ${isIssue && data.severity ? `
        <div style="background: ${severityStyle.color}15; border-left: 4px solid ${severityStyle.color}; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
          <p style="margin: 0; color: ${severityStyle.color}; font-weight: bold; font-size: 16px;">
            ${severityStyle.emoji} ${severityStyle.label}
          </p>
        </div>
        ` : ''}

        <h2 style="color: #333; margin-bottom: 20px;">${data.subject}</h2>

        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="color: #667eea; margin-top: 0; margin-bottom: 15px; font-size: 18px;">Feedback Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold; width: 180px;">Type:</td>
              <td style="padding: 8px 0; color: #333;">${feedbackTypeLabels[data.feedbackType] || data.feedbackType}</td>
            </tr>
            ${isIssue && data.severity ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold;">Severity:</td>
              <td style="padding: 8px 0; color: ${severityStyle.color}; font-weight: bold;">${severityLabels[data.severity] || data.severity}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="color: #667eea; margin-top: 0; margin-bottom: 15px; font-size: 18px;">Contact Information</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold; width: 180px;">Name:</td>
              <td style="padding: 8px 0; color: #333;">${data.name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold;">Email:</td>
              <td style="padding: 8px 0; color: #333;"><a href="mailto:${data.email}" style="color: #667eea;">${data.email}</a></td>
            </tr>
            ${data.businessName ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold;">Business:</td>
              <td style="padding: 8px 0; color: #333;">${data.businessName}</td>
            </tr>
            ` : ''}
            ${data.phone ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold;">Phone:</td>
              <td style="padding: 8px 0; color: #333;">${data.phone}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px;">
          <h3 style="color: #667eea; margin-top: 0; margin-bottom: 15px; font-size: 18px;">Message</h3>
          <p style="color: #333; line-height: 1.6; white-space: pre-wrap;">${data.message}</p>
        </div>
      </div>

      <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
        <p>© 2025 SeatPing. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: 'bryan.susanto@seatping.biz',
    subject: `Feedback [${feedbackTypeLabels[data.feedbackType]}]: ${data.subject}`,
    html,
  });
};

export const sendSalesInquiryEmail = async (data: SalesInquiryData): Promise<boolean> => {
  const useCaseLabels: Record<string, string> = {
    restaurant: 'Restaurant / F&B',
    clinic: 'Clinic / Healthcare',
    retail: 'Retail / Service',
    salon: 'Salon / Beauty',
    other: 'Other'
  };

  const budgetLabels: Record<string, string> = {
    low: 'Entry',
    mid: 'Mid',
    high: 'Enterprise',
    not_sure: 'Not Sure Yet'
  };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 28px;">SeatPing</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">New Sales Inquiry</p>
      </div>

      <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-bottom: 20px;">${data.subject}</h2>

        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="color: #667eea; margin-top: 0; margin-bottom: 15px; font-size: 18px;">Contact Information</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold; width: 180px;">Business Name:</td>
              <td style="padding: 8px 0; color: #333;">${data.businessName}</td>
            </tr>
            ${data.businessWebsite ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold;">Website:</td>
              <td style="padding: 8px 0; color: #333;"><a href="${data.businessWebsite}" style="color: #667eea;">${data.businessWebsite}</a></td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold;">Contact Name:</td>
              <td style="padding: 8px 0; color: #333;">${data.contactName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold;">Email:</td>
              <td style="padding: 8px 0; color: #333;"><a href="mailto:${data.workEmail}" style="color: #667eea;">${data.workEmail}</a></td>
            </tr>
            ${data.phone ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold;">Phone:</td>
              <td style="padding: 8px 0; color: #333;">${data.phone}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="color: #667eea; margin-top: 0; margin-bottom: 15px; font-size: 18px;">Requirements</h3>
          <table style="width: 100%; border-collapse: collapse;">
            ${data.locations ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold; width: 180px;">Locations:</td>
              <td style="padding: 8px 0; color: #333;">${data.locations}</td>
            </tr>
            ` : ''}
            ${data.smsPerMonth ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold;">SMS / Month:</td>
              <td style="padding: 8px 0; color: #333;">${data.smsPerMonth}</td>
            </tr>
            ` : ''}
            ${data.customersPerDay ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold;">Customers / Day:</td>
              <td style="padding: 8px 0; color: #333;">${data.customersPerDay}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold;">Use Case:</td>
              <td style="padding: 8px 0; color: #333;">${useCaseLabels[data.useCase] || data.useCase}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: bold;">Budget Range:</td>
              <td style="padding: 8px 0; color: #333;">${budgetLabels[data.budget] || data.budget}</td>
            </tr>
          </table>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px;">
          <h3 style="color: #667eea; margin-top: 0; margin-bottom: 15px; font-size: 18px;">Message</h3>
          <p style="color: #333; line-height: 1.6; white-space: pre-wrap;">${data.message}</p>
        </div>
      </div>

      <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
        <p>© 2025 SeatPing. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: 'bryan.susanto@seatping.biz',
    subject: `Sales Inquiry: ${data.subject} - ${data.businessName}`,
    html,
  });
};

