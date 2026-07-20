const express = require("express");
const { query } = require("../config/db");
const { requireAdmin, optionalAuth } = require("../middleware/auth");
const { mapComplaint, newId } = require("../utils/mappers");
const { createNotification } = require("../utils/notifications");

const router = express.Router();

const VALID_TYPES = [
  "product",
  "order",
  "delivery",
  "payment",
  "service",
  "other",
];
const VALID_STATUSES = ["new", "in_progress", "resolved", "rejected"];

const STATUS_META = {
  resolved: {
    title: "تم حل شكواك",
    message: (subject, id) =>
      `تم حل شكواك "${subject || id}" بنجاح. شكراً لصبرك.`,
  },
  rejected: {
    title: "تم رفض شكواك",
    message: (subject, id) =>
      `تم رفض شكواك "${subject || id}". راجع تفاصيل الرد أدناه إن وُجد.`,
  },
  in_progress: {
    title: "جاري معالجة شكواك",
    message: (subject, id) =>
      `شكواك "${subject || id}" قيد المعالجة الآن. سنُبلّغك بأي تحديث.`,
  },
  new: {
    title: "تحديث على شكواك",
    message: (subject, id) =>
      `تم تحديث حالة شكواك "${subject || id}" إلى: جديدة.`,
  },
};

function normalizeEmail(email) {
  return String(email || "")
    .toLowerCase()
    .trim();
}

/** Prefer the registered customer email so site notifications always match login. */
async function resolveNotifyTarget(complaintEmail, customerId) {
  if (customerId) {
    const byId = await query(
      "SELECT id, email FROM customers WHERE id = ? LIMIT 1",
      [customerId]
    );
    if (byId.length && byId[0].email) {
      return {
        email: normalizeEmail(byId[0].email),
        customerId: byId[0].id,
      };
    }
  }

  const email = normalizeEmail(complaintEmail);
  if (!email) return { email: "", customerId: null };

  const byEmail = await query(
    "SELECT id, email FROM customers WHERE LOWER(TRIM(email)) = ? LIMIT 1",
    [email]
  );
  if (byEmail.length) {
    return {
      email: normalizeEmail(byEmail[0].email),
      customerId: byEmail[0].id,
    };
  }

  return { email, customerId: null };
}

router.get("/", requireAdmin, async (_req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM complaints ORDER BY created_at DESC"
    );
    return res.json({ complaints: rows.map(mapComplaint) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch complaints" });
  }
});

router.post("/", optionalAuth, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.message) {
      return res
        .status(400)
        .json({ error: "name and message are required" });
    }

    // Logged-in customer: always use account email so notifications reach them
    let email = normalizeEmail(body.email);
    let customerId = null;
    if (req.user?.role === "customer" && req.user.email) {
      email = normalizeEmail(req.user.email);
      customerId = req.user.id || null;
    }

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    if (!customerId) {
      const found = await query(
        "SELECT id FROM customers WHERE LOWER(TRIM(email)) = ? LIMIT 1",
        [email]
      );
      if (found.length) customerId = found[0].id;
    }

    const type = VALID_TYPES.includes(body.type) ? body.type : "other";
    const id = newId("cmp");
    const subject = body.subject || "";

    await query(
      `INSERT INTO complaints
      (id, name, email, phone, order_id, type, subject, message, status, admin_reply)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', '')`,
      [
        id,
        body.name,
        email,
        body.phone || "",
        body.orderId || body.order_id || "",
        type,
        subject,
        body.message,
      ]
    );

    const rows = await query("SELECT * FROM complaints WHERE id = ?", [id]);
    const complaint = mapComplaint(rows[0]);

    try {
      await createNotification({
        email,
        customerId,
        type: "complaint",
        title: "تم استلام شكواك",
        message: `استلمنا شكواك "${subject || type}". رقم المرجع: ${id}. راح نبلّغك بأي تحديث هنا في الإشعارات.`,
        link: "/Ui-components/Pages/Notifications",
      });
    } catch (notifyErr) {
      console.error("Failed to create complaint notification:", notifyErr);
    }

    return res.status(201).json({ complaint });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to submit complaint" });
  }
});

router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const existing = await query("SELECT * FROM complaints WHERE id = ?", [
      req.params.id,
    ]);
    if (!existing.length) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    const cur = existing[0];
    const status =
      body.status && VALID_STATUSES.includes(body.status)
        ? body.status
        : cur.status;
    const adminReply =
      body.adminReply !== undefined
        ? body.adminReply
        : body.admin_reply !== undefined
          ? body.admin_reply
          : cur.admin_reply;

    await query(
      "UPDATE complaints SET status = ?, admin_reply = ? WHERE id = ?",
      [status, adminReply || "", req.params.id]
    );

    const rows = await query("SELECT * FROM complaints WHERE id = ?", [
      req.params.id,
    ]);
    const complaint = mapComplaint(rows[0]);

    const statusChanged = status !== cur.status;
    const replyChanged =
      String(adminReply || "") !== String(cur.admin_reply || "");

    if (statusChanged || replyChanged) {
      const meta = STATUS_META[status] || STATUS_META.new;
      let title = meta.title;
      let message = meta.message(cur.subject, cur.id);

      const note = String(adminReply || "").trim();
      if (note) {
        message += `\n\nملاحظة الإدارة:\n${note}`;
      }

      const target = await resolveNotifyTarget(cur.email, null);

      try {
        if (target.email) {
          await createNotification({
            email: target.email,
            customerId: target.customerId,
            type: "complaint",
            title,
            message,
            link: "/Ui-components/Pages/Notifications",
          });
        }
      } catch (notifyErr) {
        console.error("Failed to notify customer about complaint:", notifyErr);
      }
    }

    return res.json({ complaint, notified: statusChanged || replyChanged });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update complaint" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const result = await query("DELETE FROM complaints WHERE id = ?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Complaint not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete complaint" });
  }
});

module.exports = router;
