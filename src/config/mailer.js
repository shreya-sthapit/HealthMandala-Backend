const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,   // Gmail App Password (not your account password)
  },
});

/**
 * Send a verification email with a clickable link.
 * @param {string} to  - recipient email
 * @param {string} name - recipient first name
 * @param {string} token - verification token
 */
const sendVerificationEmail = async (to, name, token) => {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'HealthMandala <no-reply@healthmandala.com>',
    to,
    subject: 'Verify your HealthMandala account',
    html: `
      <div style="font-family:Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f0fdfa;border-radius:12px;">
        <h2 style="color:#00a896;margin-bottom:8px;">HealthMandala</h2>
        <h3 style="color:#1e293b;">Hi ${name}, verify your email</h3>
        <p style="color:#475569;line-height:1.6;">
          Thanks for signing up! Click the button below to verify your email address and complete your registration.
        </p>
        <a href="${verifyUrl}"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#00a896;color:#fff;border-radius:25px;text-decoration:none;font-weight:700;font-size:15px;">
          Verify Email
        </a>
        <p style="color:#94a3b8;font-size:13px;">
          This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
        <p style="color:#94a3b8;font-size:12px;">© 2026 HealthMandala. All rights reserved.</p>
      </div>
    `,
  });
};

module.exports = { transporter, sendVerificationEmail };

const sendWelcomeEmail = async (to, name) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'HealthMandala <no-reply@healthmandala.com>',
    to,
    subject: 'Welcome to HealthMandala!',
    html: `<div style="font-family:Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f0fdfa;border-radius:12px;">
      <h2 style="color:#00a896;">Welcome, ${name}!</h2>
      <p style="color:#475569;">Your account has been created successfully. You can now book appointments with top doctors in Nepal.</p>
      <a href="${process.env.FRONTEND_URL}" style="display:inline-block;margin:16px 0;padding:12px 28px;background:#00a896;color:#fff;border-radius:25px;text-decoration:none;font-weight:700;">Get Started</a>
    </div>`,
  });
};

module.exports = { transporter, sendVerificationEmail, sendWelcomeEmail };
