const express = require("express");
const { query } = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { mapCategory, newId } = require("../utils/mappers");

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM categories ORDER BY name ASC"
    );
    return res.json({ categories: rows.map(mapCategory) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || body.nameAr || body.name_ar || "").trim();
    if (!name) return res.status(400).json({ error: "Name is required" });

    const id = body.id || newId("cat");
    let slug =
      body.slug ||
      String(body.name || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
    if (!slug) slug = `cat-${Date.now().toString(36)}`;

    await query(
      `INSERT INTO categories (id, name, name_ar, slug, active)
       VALUES (?, ?, ?, ?, ?)`,
      [
        id,
        body.name?.trim() || name,
        body.nameAr || body.name_ar || name,
        slug,
        body.active === false ? 0 : 1,
      ]
    );

    const rows = await query("SELECT * FROM categories WHERE id = ?", [id]);
    return res.status(201).json({ category: mapCategory(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create category" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const existing = await query("SELECT * FROM categories WHERE id = ?", [
      req.params.id,
    ]);
    if (!existing.length) {
      return res.status(404).json({ error: "Category not found" });
    }
    const cur = existing[0];

    await query(
      `UPDATE categories SET name = ?, name_ar = ?, slug = ?, active = ?
       WHERE id = ?`,
      [
        body.name ?? cur.name,
        body.nameAr ?? body.name_ar ?? cur.name_ar,
        body.slug ?? cur.slug,
        body.active === undefined ? cur.active : body.active ? 1 : 0,
        req.params.id,
      ]
    );

    const rows = await query("SELECT * FROM categories WHERE id = ?", [
      req.params.id,
    ]);
    return res.json({ category: mapCategory(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update category" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const linked = await query(
      "SELECT COUNT(*) AS c FROM items WHERE category_id = ?",
      [req.params.id]
    );
    if (linked[0]?.c > 0) {
      return res.status(400).json({
        error: "Cannot delete category with linked products",
      });
    }

    const result = await query("DELETE FROM categories WHERE id = ?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete category" });
  }
});

module.exports = router;
