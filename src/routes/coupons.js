const express = require("express");
const { query } = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { newId } = require("../utils/mappers");

const router = express.Router();

function mapCoupon(row) {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: Number(row.value),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    minPurchase: Number(row.min_purchase || 0),
    maxUses: Number(row.max_uses || 0),
    usedCount: Number(row.used_count || 0),
    active: Boolean(row.active),
  };
}

function toDateKey(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return raw.slice(0, 10);
}

function validateCouponRow(row, subtotal) {
  if (!row) return { valid: false, error: "Invalid coupon code" };
  if (!row.active) return { valid: false, error: "Coupon is inactive" };
  if (row.used_count >= row.max_uses) {
    return { valid: false, error: "Coupon usage limit reached" };
  }
  const today = toDateKey(new Date());
  const startsAt = toDateKey(row.starts_at);
  const endsAt = toDateKey(row.ends_at);
  if (startsAt && startsAt > today) {
    return { valid: false, error: "Coupon not started yet" };
  }
  if (endsAt && endsAt < today) {
    return { valid: false, error: "Coupon expired" };
  }
  if (Number(subtotal) < Number(row.min_purchase || 0)) {
    return {
      valid: false,
      error: `Minimum purchase is $${Number(row.min_purchase).toFixed(2)}`,
    };
  }
  let discount =
    row.type === "percent"
      ? (Number(subtotal) * Number(row.value)) / 100
      : Number(row.value);
  discount = Math.min(discount, Number(subtotal));
  return { valid: true, discount: Math.round(discount * 100) / 100, coupon: mapCoupon(row) };
}

router.get("/", requireAdmin, async (_req, res) => {
  try {
    const rows = await query("SELECT * FROM coupons ORDER BY created_at DESC");
    return res.json({ coupons: rows.map(mapCoupon) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

router.post("/validate", async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim().toUpperCase();
    const subtotal = Number(req.body?.subtotal || 0);
    if (!code) return res.status(400).json({ error: "Code is required" });
    const rows = await query("SELECT * FROM coupons WHERE UPPER(code) = ?", [code]);
    const result = validateCouponRow(rows[0], subtotal);
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to validate coupon" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const id = body.id || newId("cpn");
    const code = String(body.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "Code is required" });
    await query(
      `INSERT INTO coupons (id, code, type, value, starts_at, ends_at, min_purchase, max_uses, used_count, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        id,
        code,
        body.type || "percent",
        Number(body.value || 0),
        body.startsAt || body.starts_at || null,
        body.endsAt || body.ends_at || null,
        Number(body.minPurchase ?? body.min_purchase ?? 0),
        Number(body.maxUses ?? body.max_uses ?? 100),
        body.active === false ? 0 : 1,
      ]
    );
    const rows = await query("SELECT * FROM coupons WHERE id = ?", [id]);
    return res.status(201).json({ coupon: mapCoupon(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create coupon" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const existing = await query("SELECT * FROM coupons WHERE id = ?", [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ error: "Coupon not found" });
    }
    const cur = existing[0];
    await query(
      `UPDATE coupons SET code = ?, type = ?, value = ?, starts_at = ?, ends_at = ?, min_purchase = ?, max_uses = ?, active = ? WHERE id = ?`,
      [
        String(body.code ?? cur.code).toUpperCase(),
        body.type ?? cur.type,
        body.value != null ? Number(body.value) : cur.value,
        body.startsAt ?? body.starts_at ?? cur.starts_at,
        body.endsAt ?? body.ends_at ?? cur.ends_at,
        body.minPurchase ?? body.min_purchase ?? cur.min_purchase,
        body.maxUses ?? body.max_uses ?? cur.max_uses,
        body.active === undefined ? cur.active : body.active ? 1 : 0,
        req.params.id,
      ]
    );
    const rows = await query("SELECT * FROM coupons WHERE id = ?", [req.params.id]);
    return res.json({ coupon: mapCoupon(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update coupon" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const result = await query("DELETE FROM coupons WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Coupon not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete coupon" });
  }
});

module.exports = router;
module.exports.validateCouponRow = validateCouponRow;
module.exports.mapCoupon = mapCoupon;
