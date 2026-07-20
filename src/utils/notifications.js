const { query } = require("../config/db");
const { newId } = require("./mappers");

async function createNotification({
  email,
  customerId = null,
  type = "general",
  title,
  message,
  link = "",
}) {
  if (!email || !title || !message) return null;

  const id = newId("ntf");
  await query(
    `INSERT INTO notifications
    (id, email, customer_id, type, title, message, link, is_read)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      String(email).toLowerCase().trim(),
      customerId,
      type,
      title,
      message,
      link || "",
    ]
  );
  return id;
}

function mapNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    customerId: row.customer_id || "",
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link || "",
    read: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

module.exports = { createNotification, mapNotification };
