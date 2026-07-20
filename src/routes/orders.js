const express = require("express");
const { pool, query } = require("../config/db");
const {
  requireAdmin,
  requireCustomer,
  optionalAuth,
} = require("../middleware/auth");
const { mapOrder, newId, normalizeOrderStatus } = require("../utils/mappers");
const { createNotification } = require("../utils/notifications");
const { sendOrderEmail } = require("../utils/email");

const router = express.Router();

router.get("/track", async (req, res) => {
  try {
    const orderId = String(req.query.orderId || req.query.id || "").trim();
    const email = String(req.query.email || "").toLowerCase().trim();
    const phone = String(req.query.phone || "").trim();

    if (!orderId || (!email && !phone)) {
      return res.status(400).json({
        error: "orderId and email or phone are required",
      });
    }

    let sql = `SELECT * FROM orders WHERE id = ? AND (`;
    const params = [orderId];
    if (email) {
      sql += `LOWER(TRIM(email)) = ?`;
      params.push(email);
    }
    if (email && phone) sql += ` OR `;
    if (phone) {
      sql += `phone = ?`;
      params.push(phone);
    }
    sql += `) LIMIT 1`;

    const rows = await query(sql, params);
    if (!rows.length) {
      return res.status(404).json({ error: "Order not found" });
    }
    return res.json({ order: mapOrder(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to track order" });
  }
});

router.get("/mine", requireCustomer, async (req, res) => {
  try {
    const email = String(req.user.email || "")
      .toLowerCase()
      .trim();
    const customerId = req.user.id || null;

    const rows = await query(
      `SELECT * FROM orders
       WHERE LOWER(TRIM(email)) = ?
          OR (customer_id IS NOT NULL AND customer_id = ?)
       ORDER BY created_at DESC`,
      [email, customerId || ""]
    );

    return res.json({ orders: rows.map(mapOrder) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch your orders" });
  }
});

router.get("/mine/:id", requireCustomer, async (req, res) => {
  try {
    const email = String(req.user.email || "")
      .toLowerCase()
      .trim();
    const customerId = req.user.id || null;

    const rows = await query(
      `SELECT * FROM orders
       WHERE id = ?
         AND (
           LOWER(TRIM(email)) = ?
           OR (customer_id IS NOT NULL AND customer_id = ?)
         )
       LIMIT 1`,
      [req.params.id, email, customerId || ""]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json({ order: mapOrder(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch order" });
  }
});

router.get("/", requireAdmin, async (_req, res) => {
  try {
    const rows = await query("SELECT * FROM orders ORDER BY created_at DESC");
    return res.json({ orders: rows.map(mapOrder) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch orders" });
  }
});

router.post("/", optionalAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const body = req.body || {};
    const customerName = body.customerName;
    let email = String(body.email || "")
      .toLowerCase()
      .trim();

    if (req.user?.role === "customer" && req.user.email) {
      email = String(req.user.email).toLowerCase().trim();
    }

    if (!customerName || !email) {
      return res
        .status(400)
        .json({ error: "customerName and email are required" });
    }

    const shippingAddress = body.shippingAddress || {
      line1: body.line1 || "",
      city: body.city || "",
      country: body.country || "",
      zip: body.zip || "",
    };

    const cartItems = Array.isArray(body.cartItems)
      ? body.cartItems
      : Array.isArray(body.items)
        ? body.items
        : [];

    if (!cartItems.length) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const paymentMethod = body.paymentMethod || "cod";
    // Never trust client "paid" — only COD unpaid or pending for card/paypal
    const paymentStatus = paymentMethod === "cod" ? "unpaid" : "pending";
    const status = normalizeOrderStatus(body.status || "new");
    const sessionId = req.headers["x-session-id"] || body.sessionId || null;

    await connection.beginTransaction();

    const pricedItems = [];
    let totalAmount = 0;

    for (const raw of cartItems) {
      const productId = raw.id || raw.productId || "";
      const quantity = Math.max(1, Number(raw.qty || raw.quantity || 1));

      if (!productId) {
        throw Object.assign(new Error("Each cart item needs a product id"), {
          status: 400,
        });
      }

      const [rows] = await connection.execute(
        `SELECT id, name, price, stock, status FROM items WHERE id = ? FOR UPDATE`,
        [productId]
      );

      if (!rows.length || rows[0].status !== "active") {
        throw Object.assign(
          new Error(`Product unavailable: ${productId}`),
          { status: 400 }
        );
      }

      const product = rows[0];
      const stock = Number(product.stock || 0);
      if (stock < quantity) {
        throw Object.assign(
          new Error(
            `Insufficient stock for "${product.name}" (available: ${stock})`
          ),
          { status: 400 }
        );
      }

      const unitPrice = Number(product.price);
      pricedItems.push({
        productId: product.id,
        name: product.name,
        quantity,
        price: unitPrice,
        size: raw.size || "",
        color: raw.color || "",
      });
      totalAmount += unitPrice * quantity;

      const [upd] = await connection.execute(
        `UPDATE items SET stock = stock - ? WHERE id = ? AND stock >= ?`,
        [quantity, product.id, quantity]
      );
      if (upd.affectedRows === 0) {
        throw Object.assign(
          new Error(`Stock changed for "${product.name}". Try again.`),
          { status: 409 }
        );
      }
    }

    let discount = 0;
    const couponCode = String(body.couponCode || "").trim().toUpperCase();
    if (couponCode) {
      const [couponRows] = await connection.execute(
        "SELECT * FROM coupons WHERE UPPER(code) = ? FOR UPDATE",
        [couponCode]
      );
      const row = couponRows[0];
      if (!row) {
        throw Object.assign(new Error("Invalid coupon code"), { status: 400 });
      }
      if (!row.active) {
        throw Object.assign(new Error("Coupon is inactive"), { status: 400 });
      }
      if (Number(row.used_count || 0) >= Number(row.max_uses || 0)) {
        throw Object.assign(new Error("Coupon usage limit reached"), {
          status: 400,
        });
      }
      const today = new Date().toISOString().slice(0, 10);
      if (row.starts_at && String(row.starts_at).slice(0, 10) > today) {
        throw Object.assign(new Error("Coupon not started yet"), { status: 400 });
      }
      if (row.ends_at && String(row.ends_at).slice(0, 10) < today) {
        throw Object.assign(new Error("Coupon expired"), { status: 400 });
      }
      if (Number(totalAmount) < Number(row.min_purchase || 0)) {
        throw Object.assign(
          new Error(
            `Minimum purchase is $${Number(row.min_purchase).toFixed(2)}`
          ),
          { status: 400 }
        );
      }
      discount =
        row.type === "percent"
          ? (Number(totalAmount) * Number(row.value)) / 100
          : Number(row.value);
      discount = Math.min(discount, Number(totalAmount));
      discount = Math.round(discount * 100) / 100;
      totalAmount = Math.max(0, totalAmount - discount);
      await connection.execute(
        "UPDATE coupons SET used_count = used_count + 1 WHERE id = ?",
        [row.id]
      );
    }

    let customerId =
      (req.user?.role === "customer" && req.user.id) || body.customerId || null;
    if (!customerId && email) {
      const [customers] = await connection.execute(
        "SELECT id FROM customers WHERE LOWER(TRIM(email)) = ? LIMIT 1",
        [email]
      );
      if (customers.length) customerId = customers[0].id;
    }

    const id = newId("ord");
    await connection.execute(
      `INSERT INTO orders
      (id, customer_id, customer_name, email, phone, shipping_address, items,
       total_amount, payment_method, payment_status, status, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        customerId,
        customerName,
        email,
        body.phone || "",
        JSON.stringify(shippingAddress),
        JSON.stringify(pricedItems),
        totalAmount,
        paymentMethod,
        paymentStatus,
        status,
        sessionId,
      ]
    );

    await connection.commit();

    const rows = await query("SELECT * FROM orders WHERE id = ?", [id]);
    const order = mapOrder(rows[0]);

    await createNotification({
      email,
      customerId,
      type: "payment",
      title: "تم تأكيد طلبك",
      message: `${
        paymentMethod === "cod"
          ? "تم اختيار الدفع عند الاستلام"
          : "بانتظار تأكيد الدفع"
      } للطلب ${id}. الإجمالي: $${Number(totalAmount).toFixed(2)}.`,
      link: "/Ui-components/Pages/Account",
    });

    sendOrderEmail({
      to: email,
      subject: `FashiQue order ${id}`,
      text: `Hi ${customerName},\n\nYour order ${id} was received.\nTotal: $${Number(
        totalAmount
      ).toFixed(2)}\nPayment: ${paymentMethod} (${paymentStatus})\n\nThank you for shopping at FashiQue.`,
    }).catch((e) => console.error("order email failed", e.message));

    return res.status(201).json({ order });
  } catch (err) {
    try {
      await connection.rollback();
    } catch {
      // ignore
    }
    console.error(err);
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || "Failed to create order",
    });
  } finally {
    connection.release();
  }
});

async function updateOrder(req, res) {
  try {
    const existing = await query("SELECT * FROM orders WHERE id = ?", [
      req.params.id,
    ]);
    if (!existing.length) {
      return res.status(404).json({ error: "Order not found" });
    }

    const body = req.body || {};
    const cur = existing[0];
    const status = body.status
      ? normalizeOrderStatus(body.status)
      : cur.status;

    await query(
      `UPDATE orders SET
        status = ?,
        payment_status = ?,
        customer_name = ?,
        phone = ?
       WHERE id = ?`,
      [
        status,
        body.paymentStatus ?? cur.payment_status,
        body.customerName ?? cur.customer_name,
        body.phone ?? cur.phone,
        req.params.id,
      ]
    );

    const rows = await query("SELECT * FROM orders WHERE id = ?", [
      req.params.id,
    ]);
    const order = mapOrder(rows[0]);

    if (
      status !== cur.status ||
      (body.paymentStatus && body.paymentStatus !== cur.payment_status)
    ) {
      const paymentStatus = body.paymentStatus ?? cur.payment_status;
      const orderStatusLabels = {
        new: "جديد",
        preparing: "قيد التجهيز",
        ready_to_ship: "جاهز للشحن",
        shipped: "تم الشحن",
        delivered: "تم التوصيل",
        cancelled: "ملغي",
        returned: "مرتجع",
      };
      const statusLabel = orderStatusLabels[status] || status;
      const isPaid = paymentStatus === "paid";

      await createNotification({
        email: cur.email,
        customerId: cur.customer_id,
        type: isPaid || body.paymentStatus ? "payment" : "order",
        title: isPaid ? "تحديث الدفع" : "تحديث الطلب",
        message: `طلبك ${cur.id} أصبح: ${statusLabel}${
          body.paymentStatus
            ? ` · حالة الدفع: ${
                paymentStatus === "paid"
                  ? "مدفوع"
                  : paymentStatus === "unpaid"
                    ? "غير مدفوع"
                    : paymentStatus
              }`
            : ""
        }.`,
        link: "/Ui-components/Pages/Account",
      });
    }

    return res.json({ order });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update order" });
  }
}

router.patch("/:id", requireAdmin, updateOrder);
router.put("/:id", requireAdmin, updateOrder);

module.exports = router;
