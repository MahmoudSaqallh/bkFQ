const express = require("express");
const { query } = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { mapMessage, newId } = require("../utils/mappers");
const { createNotification } = require("../utils/notifications");

const router = express.Router();

router.get("/", requireAdmin, async (_req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM messages ORDER BY created_at DESC"
    );
    return res.json({ messages: rows.map(mapMessage) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.email || !body.message) {
      return res
        .status(400)
        .json({ error: "name, email and message are required" });
    }
    const id = newId("msg");
    const email = String(body.email).toLowerCase().trim();
    await query(
      `INSERT INTO messages (id, name, email, phone, subject, message, status)
       VALUES (?, ?, ?, ?, ?, ?, 'new')`,
      [
        id,
        body.name,
        email,
        body.phone || "",
        body.subject || "",
        body.message,
      ]
    );

    let customerId = null;
    try {
      const customers = await query(
        "SELECT id FROM customers WHERE email = ? LIMIT 1",
        [email]
      );
      customerId = customers[0]?.id || null;
    } catch {
      customerId = null;
    }

    try {
      await createNotification({
        email,
        customerId,
        type: "contact",
        title: "تم استلام رسالتك",
        message:
          "وصلتنا رسالتك من Contact Us بنجاح. فريقنا راح يراجعها ويرد عليك في أقرب وقت.",
        link: "/Ui-components/Pages/Contact",
      });
    } catch (notifyErr) {
      console.error("Failed to create contact notification:", notifyErr);
    }

    const rows = await query("SELECT * FROM messages WHERE id = ?", [id]);
    return res.status(201).json({ message: mapMessage(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to send message" });
  }
});

router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const existing = await query("SELECT * FROM messages WHERE id = ?", [
      req.params.id,
    ]);
    if (!existing.length) {
      return res.status(404).json({ error: "Message not found" });
    }
    await query("UPDATE messages SET status = ? WHERE id = ?", [
      body.status || existing[0].status,
      req.params.id,
    ]);
    const rows = await query("SELECT * FROM messages WHERE id = ?", [
      req.params.id,
    ]);
    return res.json({ message: mapMessage(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update message" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const result = await query("DELETE FROM messages WHERE id = ?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Message not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete message" });
  }
});

module.exports = router;
