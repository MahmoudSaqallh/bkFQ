const express = require("express");
const { query } = require("../config/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/stats", requireAdmin, async (_req, res) => {
  try {
    const products = await query("SELECT COUNT(*) AS c FROM items");
    const orders = await query("SELECT COUNT(*) AS c FROM orders");
    const customers = await query("SELECT COUNT(*) AS c FROM customers");
    const messages = await query(
      "SELECT COUNT(*) AS c FROM messages WHERE status = 'new'"
    );
    const revenue = await query(
      "SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE status != 'cancelled'"
    );
    const recentOrders = await query(
      `SELECT id, customer_name AS customerName, total_amount AS totalAmount,
              status, created_at AS createdAt
       FROM orders ORDER BY created_at DESC LIMIT 8`
    );
    const lowStock = await query(
      "SELECT id, name, stock FROM items WHERE stock <= 5 ORDER BY stock ASC LIMIT 8"
    );
    const monthly = await query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
              COALESCE(SUM(total_amount), 0) AS total,
              COUNT(*) AS orders
       FROM orders
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY month ASC`
    );

    return res.json({
      stats: {
        products: products[0].c,
        orders: orders[0].c,
        customers: customers[0].c,
        newMessages: messages[0].c,
        revenue: Number(revenue[0].total),
        recentOrders,
        lowStock,
        monthlySales: monthly.map((m) => ({
          month: m.month,
          total: Number(m.total),
          orders: Number(m.orders),
        })),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

module.exports = router;
