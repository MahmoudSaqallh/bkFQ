const express = require("express");
const { query } = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { newId } = require("../utils/mappers");

const router = express.Router();

function mapSubcategory(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    nameAr: row.name_ar || "",
    active: Boolean(row.active),
  };
}

router.get("/", async (_req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM subcategories ORDER BY name_ar ASC, name ASC"
    );
    return res.json({ subcategories: rows.map(mapSubcategory) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch subcategories" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const id = body.id || newId("sub");
    let categoryId = body.categoryId || body.category_id;
    if (!categoryId) {
      const cats = await query(
        "SELECT id FROM categories WHERE active = 1 ORDER BY created_at ASC LIMIT 1"
      );
      categoryId = cats[0]?.id || "cat-001";
    }
    if (!categoryId) {
      return res.status(400).json({ error: "No active category found" });
    }
    if (!body.name && !body.nameAr && !body.name_ar) {
      return res.status(400).json({ error: "Name is required" });
    }
    await query(
      `INSERT INTO subcategories (id, category_id, name, name_ar, active)
       VALUES (?, ?, ?, ?, ?)`,
      [
        id,
        categoryId,
        body.name || body.nameAr,
        body.nameAr || body.name_ar || "",
        body.active === false ? 0 : 1,
      ]
    );
    const rows = await query("SELECT * FROM subcategories WHERE id = ?", [id]);
    return res.status(201).json({ subcategory: mapSubcategory(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create subcategory" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const existing = await query("SELECT * FROM subcategories WHERE id = ?", [
      req.params.id,
    ]);
    if (!existing.length) {
      return res.status(404).json({ error: "Subcategory not found" });
    }
    const cur = existing[0];
    await query(
      `UPDATE subcategories SET category_id = ?, name = ?, name_ar = ?, active = ? WHERE id = ?`,
      [
        body.categoryId ?? body.category_id ?? cur.category_id,
        body.name ?? cur.name,
        body.nameAr ?? body.name_ar ?? cur.name_ar,
        body.active === undefined ? cur.active : body.active ? 1 : 0,
        req.params.id,
      ]
    );
    const rows = await query("SELECT * FROM subcategories WHERE id = ?", [
      req.params.id,
    ]);
    return res.json({ subcategory: mapSubcategory(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update subcategory" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const result = await query("DELETE FROM subcategories WHERE id = ?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Subcategory not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete subcategory" });
  }
});

module.exports = router;
