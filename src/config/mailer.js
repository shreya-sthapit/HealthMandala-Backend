const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send 6-digit OTP to email
const sendEmailOTP = async (to, name, otp) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'HealthMandala <no-reply@healthmandala.com>',
    to,
    subject: 'Your HealthMandala verification code',
    html: `
      <div style="font-family:Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f0fdfa;border-radius:12px;">
        <h2 style="color:#00a896;margin-bottom:8px;">HealthMandala</h2>
        <h3 style="color:#1e293b;">Hi ${name}, here's your verification code</h3>
        <p style="color:#475569;line-height:1.6;">Use this code to verify your email address. It expires in <strong>1 minute</strong>.</p>
        <div style="font-size:2.5rem;font-weight:800;letter-spacing:0.3em;color:#00a896;text-align:center;padding:24px;background:#fff;border-radius:12px;margin:24px 0;border:2px solid #e0f5f2;">${otp}</div>
        <p style="color:#94a3b8;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
        <p style="color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} HealthMandala. All rights reserved.</p>
      </div>
    `,
  });
};

// Send welcome email after registration
const sendWelcomeEmail = async (to, name) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'HealthMandala <no-reply@healthmandala.com>',
    to,
    subject: 'Welcome to HealthMandala!',
    html: `
      <div style="font-family:Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f0fdfa;border-radius:12px;">
        <h2 style="color:#00a896;">Welcome, ${name}!</h2>
        <p style="color:#475569;">Your account has been created successfully. You can now book appointments with top doctors in Nepal.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" style="display:inline-block;margin:16px 0;padding:12px 28px;background:#00a896;color:#fff;border-radius:25px;text-decoration:none;font-weight:700;">Get Started</a>
      </div>
    `,
  });
};

module.exports = { transporter, sendEmailOTP, sendWelcomeEmail };
