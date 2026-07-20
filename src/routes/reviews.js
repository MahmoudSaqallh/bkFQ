const express = require("express");
const { query } = require("../config/db");
const { requireCustomer, requireAdmin, optionalAuth } = require("../middleware/auth");
const { newId } = require("../utils/mappers");

const router = express.Router();

function mapReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    itemId: row.item_id,
    productId: row.item_id,
    productName: row.product_name || "",
    customerId: row.customer_id || "",
    customerName: row.customer_name || "Customer",
    email: row.email || "",
    rating: Number(row.rating || 0),
    comment: row.comment || "",
    status: row.status || "approved",
    reply: row.admin_reply || "",
    adminReply: row.admin_reply || "",
    createdAt: row.created_at,
  };
}

async function ensureReviewsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id VARCHAR(64) PRIMARY KEY,
      item_id VARCHAR(64) NOT NULL,
      customer_id VARCHAR(64) DEFAULT NULL,
      customer_name VARCHAR(150) DEFAULT '',
      email VARCHAR(200) NOT NULL,
      rating TINYINT NOT NULL,
      comment TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'approved',
      admin_reply TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_reviews_item (item_id),
      INDEX idx_reviews_email (email)
    )
  `);
}

let tableReady = false;
async function ready() {
  if (!tableReady) {
    await ensureReviewsTable();
    tableReady = true;
  }
}

router.get("/admin/all", requireAdmin, async (req, res) => {
  try {
    await ready();
    const status = String(req.query.status || "").trim();
    let sql = `SELECT r.*, i.name AS product_name FROM reviews r
               LEFT JOIN items i ON i.id = r.item_id
               ORDER BY r.created_at DESC LIMIT 200`;
    const params = [];
    if (status) {
      sql = `SELECT r.*, i.name AS product_name FROM reviews r
             LEFT JOIN items i ON i.id = r.item_id
             WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 200`;
      params.push(status);
    }
    const rows = await query(sql, params);
    return res.json({ reviews: rows.map(mapReview) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    await ready();
    const body = req.body || {};
    const existing = await query("SELECT * FROM reviews WHERE id = ?", [
      req.params.id,
    ]);
    if (!existing.length) {
      return res.status(404).json({ error: "Review not found" });
    }
    const cur = existing[0];
    await query(
      `UPDATE reviews SET status = ?, admin_reply = ? WHERE id = ?`,
      [
        body.status ?? cur.status ?? "approved",
        body.adminReply ?? body.admin_reply ?? cur.admin_reply ?? "",
        req.params.id,
      ]
    );
    const rows = await query(
      `SELECT r.*, i.name AS product_name FROM reviews r
       LEFT JOIN items i ON i.id = r.item_id WHERE r.id = ?`,
      [req.params.id]
    );
    return res.json({ review: mapReview(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update review" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await ready();
    const result = await query("DELETE FROM reviews WHERE id = ?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Review not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete review" });
  }
});

router.get("/", optionalAuth, async (req, res) => {
  try {
    await ready();
    const itemId = String(req.query.itemId || "").trim();
    if (!itemId) {
      return res.status(400).json({ error: "itemId is required" });
    }

    const rows = await query(
      `SELECT * FROM reviews WHERE item_id = ? ORDER BY created_at DESC LIMIT 100`,
      [itemId]
    );
    const reviews = rows.map(mapReview);
    const count = reviews.length;
    const average =
      count > 0
        ? reviews.reduce((s, r) => s + r.rating, 0) / count
        : 0;

    return res.json({
      reviews,
      count,
      average: Math.round(average * 10) / 10,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

router.post("/", requireCustomer, async (req, res) => {
  try {
    await ready();
    const body = req.body || {};
    const itemId = String(body.itemId || body.item_id || "").trim();
    const rating = Number(body.rating || 0);
    const comment = String(body.comment || "").trim();

    if (!itemId) {
      return res.status(400).json({ error: "itemId is required" });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "rating must be 1-5" });
    }

    const items = await query("SELECT id FROM items WHERE id = ?", [itemId]);
    if (!items.length) {
      return res.status(404).json({ error: "Product not found" });
    }

    const email = String(req.user.email || "")
      .toLowerCase()
      .trim();
    const existing = await query(
      "SELECT id FROM reviews WHERE item_id = ? AND email = ? LIMIT 1",
      [itemId, email]
    );
    if (existing.length) {
      return res
        .status(400)
        .json({ error: "You already reviewed this product" });
    }

    const customers = await query(
      "SELECT name FROM customers WHERE id = ? OR LOWER(TRIM(email)) = ? LIMIT 1",
      [req.user.id || "", email]
    );
    const customerName = customers[0]?.name || "Customer";
    const id = newId("rev");

    await query(
      `INSERT INTO reviews
      (id, item_id, customer_id, customer_name, email, rating, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, itemId, req.user.id || null, customerName, email, rating, comment]
    );

    const rows = await query("SELECT * FROM reviews WHERE id = ?", [id]);
    return res.status(201).json({ review: mapReview(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to submit review" });
  }
});

module.exports = router;
