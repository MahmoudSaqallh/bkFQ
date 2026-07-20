/**
 * Order/transactional email helper.
 * If SMTP is not configured, logs and no-ops (dev-friendly).
 */
async function sendOrderEmail({ to, subject, text, html }) {
  if (!to || !subject) return false;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.log(`[email:skipped] to=${to} subject=${subject}`);
    return false;
  }

  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    console.log("[email:skipped] nodemailer not installed");
    return false;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || user,
    to,
    subject,
    text,
    html: html || undefined,
  });

  return true;
}

module.exports = { sendOrderEmail };
