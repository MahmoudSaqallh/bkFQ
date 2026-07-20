const express = require("express");
const { query } = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { mapItem, newId, parseJsonField } = require("../utils/mappers");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const includeHidden = req.query.all === "1";
    const q = String(req.query.q || "").trim().toLowerCase();
    const category = String(req.query.category || "").trim();
    const size = String(req.query.size || "").trim().toLowerCase();
    const color = String(req.query.color || "").trim().toLowerCase();
    const inStock = req.query.inStock === "1";
    const minPrice =
      req.query.minPrice != null && req.query.minPrice !== ""
        ? Number(req.query.minPrice)
        : null;
    const maxPrice =
      req.query.maxPrice != null && req.query.maxPrice !== ""
        ? Number(req.query.maxPrice)
        : null;
    const onSale = req.query.onSale === "1";
    const subcategory = String(req.query.subcategory || "").trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const limitRaw = Number(req.query.limit || 0);
    const limit = limitRaw > 0 ? Math.min(100, limitRaw) : 0;

    let sql = includeHidden
      ? "SELECT * FROM items WHERE 1=1"
      : "SELECT * FROM items WHERE status = 'active'";
    const params = [];

    if (category) {
      sql += " AND category_id = ?";
      params.push(category);
    }
    if (minPrice != null && !Number.isNaN(minPrice)) {
      sql += " AND price >= ?";
      params.push(minPrice);
    }
    if (maxPrice != null && !Number.isNaN(maxPrice)) {
      sql += " AND price <= ?";
      params.push(maxPrice);
    }
    if (inStock) {
      sql += " AND stock > 0";
    }
    if (q) {
      sql += " AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(sku) LIKE ?)";
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (subcategory) {
      sql += " AND subcategory_id = ?";
      params.push(subcategory);
    }
    if (onSale) {
      sql += " AND compare_at_price > price";
    }

    const sort = String(req.query.sort || "featured");
    if (sort === "price-asc") sql += " ORDER BY price ASC";
    else if (sort === "price-desc") sql += " ORDER BY price DESC";
    else if (sort === "name-asc") sql += " ORDER BY name ASC";
    else if (sort === "new") sql += " ORDER BY created_at DESC";
    else sql += " ORDER BY created_at DESC";

    let rows = await query(sql, params);
    let items = rows.map(mapItem);

    if (size) {
      items = items.filter((item) =>
        (item.sizes || []).some((s) => String(s).toLowerCase() === size)
      );
    }
    if (color) {
      items = items.filter((item) =>
        (item.colors || []).some((c) => String(c).toLowerCase() === color)
      );
    }

    const total = items.length;
    if (limit > 0) {
      const start = (page - 1) * limit;
      items = items.slice(start, start + limit);
    }

    return res.json({
      items,
      products: items,
      total,
      page,
      limit: limit || total,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch items" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM items WHERE id = ?", [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: "Item not found" });
    return res.json({ item: mapItem(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch item" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const id = body.id || newId("item");
    const name = body.name;
    if (!name) return res.status(400).json({ error: "Name is required" });

    await query(
      `INSERT INTO items
      (id, name, description, price, compare_at_price, discount_percent, category_id, subcategory_id, sizes, colors, stock, low_stock_threshold, image_url, sku, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        body.description || "",
        Number(body.price || 0),
        Number(body.compareAtPrice ?? body.compare_at_price ?? body.price ?? 0),
        Number(body.discountPercent ?? body.discount_percent ?? 0),
        body.categoryId || body.category_id || null,
        body.subcategoryId || body.subcategory_id || null,
        JSON.stringify(body.sizes || []),
        JSON.stringify(body.colors || []),
        Number(body.stock || 0),
        Number(body.lowStockThreshold ?? body.low_stock_threshold ?? 5),
        body.imageUrl || body.image_url || "",
        body.sku || "",
        body.status || "active",
      ]
    );

    const rows = await query("SELECT * FROM items WHERE id = ?", [id]);
    return res.status(201).json({ item: mapItem(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create item" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const existing = await query("SELECT * FROM items WHERE id = ?", [
      req.params.id,
    ]);
    if (!existing.length) {
      return res.status(404).json({ error: "Item not found" });
    }

    const cur = existing[0];
    await query(
      `UPDATE items SET
        name = ?, description = ?, price = ?, compare_at_price = ?, discount_percent = ?,
        category_id = ?, subcategory_id = ?,
        sizes = ?, colors = ?, stock = ?, low_stock_threshold = ?, image_url = ?, sku = ?, status = ?
       WHERE id = ?`,
      [
        body.name ?? cur.name,
        body.description ?? cur.description,
        body.price != null ? Number(body.price) : cur.price,
        body.compareAtPrice ?? body.compare_at_price ?? cur.compare_at_price ?? cur.price,
        body.discountPercent ?? body.discount_percent ?? cur.discount_percent ?? 0,
        body.categoryId ?? body.category_id ?? cur.category_id,
        body.subcategoryId ?? body.subcategory_id ?? cur.subcategory_id,
        JSON.stringify(body.sizes ?? parseJsonField(cur.sizes, [])),
        JSON.stringify(body.colors ?? parseJsonField(cur.colors, [])),
        body.stock != null ? Number(body.stock) : cur.stock,
        body.lowStockThreshold ?? body.low_stock_threshold ?? cur.low_stock_threshold ?? 5,
        body.imageUrl ?? body.image_url ?? cur.image_url,
        body.sku ?? cur.sku,
        body.status ?? cur.status,
        req.params.id,
      ]
    );

    const rows = await query("SELECT * FROM items WHERE id = ?", [
      req.params.id,
    ]);
    return res.json({ item: mapItem(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update item" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const result = await query("DELETE FROM items WHERE id = ?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete item" });
  }
});

module.exports = router;
