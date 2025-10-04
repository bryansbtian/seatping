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
}

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  try {
    console.log('[EMAIL] Attempting to send email to:', options.to);
    console.log('[EMAIL] Using transporter config:', {
      host: transporter.options.host,
      port: transporter.options.port,
      secure: transporter.options.secure,
      user: transporter.options.auth?.user
    });

    const mailOptions = {
      from: 'bryansusanto22@gmail.com',
      to: options.to,
      subject: options.subject,
      html: options.html,
    };

    console.log('[EMAIL] Mail options prepared, sending...');
    const info = await transporter.sendMail(mailOptions);
    console.log('[EMAIL] Email sent successfully:', info.messageId);
    console.log('[EMAIL] Response:', info);
    return true;
  } catch (error) {
    console.error('[EMAIL] Error sending email:', error);
    console.error('[EMAIL] Error details:', {
      message: error.message,
      code: error.code,
      command: error.command
    });
    return false;
  }
};

export const sendPasswordResetEmail = async (email: string, resetToken: string): Promise<boolean> => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset?token=${resetToken}`;
  
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

