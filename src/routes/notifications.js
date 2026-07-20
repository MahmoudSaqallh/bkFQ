const express = require("express");
const { query } = require("../config/db");
const { requireCustomer } = require("../middleware/auth");
const { mapNotification } = require("../utils/notifications");

const router = express.Router();

function customerEmail(req) {
  return String(req.user?.email || "")
    .toLowerCase()
    .trim();
}

router.get("/", requireCustomer, async (req, res) => {
  try {
    const email = customerEmail(req);
    const rows = await query(
      `SELECT * FROM notifications
       WHERE email = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      [email]
    );

    const notifications = rows.map(mapNotification);
    const unreadCount = notifications.filter((n) => !n.read).length;

    return res.json({ notifications, unreadCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.patch("/:id/read", requireCustomer, async (req, res) => {
  try {
    const email = customerEmail(req);
    const result = await query(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND email = ?",
      [req.params.id, email]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const rows = await query("SELECT * FROM notifications WHERE id = ?", [
      req.params.id,
    ]);
    return res.json({ notification: mapNotification(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update notification" });
  }
});

router.patch("/read-all", requireCustomer, async (req, res) => {
  try {
    const email = customerEmail(req);
    await query(
      "UPDATE notifications SET is_read = 1 WHERE email = ? AND is_read = 0",
      [email]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to mark all as read" });
  }
});

router.delete("/:id", requireCustomer, async (req, res) => {
  try {
    const email = customerEmail(req);
    const result = await query(
      "DELETE FROM notifications WHERE id = ? AND email = ?",
      [req.params.id, email]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete notification" });
  }
});

module.exports = router;
