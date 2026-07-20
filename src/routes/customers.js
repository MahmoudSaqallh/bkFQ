const express = require("express");
const { query } = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { mapCustomer } = require("../utils/mappers");

const router = express.Router();

router.get("/", requireAdmin, async (_req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM customers ORDER BY created_at DESC"
    );
    const customers = [];
    for (const row of rows) {
      const stats = await query(
        `SELECT COUNT(*) AS ordersCount,
                COALESCE(SUM(total_amount), 0) AS totalSpent,
                MAX(created_at) AS lastOrderAt
         FROM orders WHERE email = ? OR customer_id = ?`,
        [row.email, row.id]
      );
      customers.push(
        mapCustomer(row, {
          ordersCount: stats[0].ordersCount,
          totalSpent: stats[0].totalSpent,
          lastOrderAt: stats[0].lastOrderAt || "",
        })
      );
    }
    return res.json({ customers });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch customers" });
  }
});

router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const existing = await query("SELECT * FROM customers WHERE id = ?", [
      req.params.id,
    ]);
    if (!existing.length) {
      return res.status(404).json({ error: "Customer not found" });
    }
    const cur = existing[0];
    await query(
      `UPDATE customers SET name = ?, phone = ?, status = ? WHERE id = ?`,
      [
        body.name ?? cur.name,
        body.phone ?? cur.phone,
        body.status ?? cur.status,
        req.params.id,
      ]
    );
    const rows = await query("SELECT * FROM customers WHERE id = ?", [
      req.params.id,
    ]);
    return res.json({ customer: mapCustomer(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update customer" });
  }
});

module.exports = router;
