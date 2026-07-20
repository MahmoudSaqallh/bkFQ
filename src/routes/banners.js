const express = require("express");
const { query } = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { newId } = require("../utils/mappers");

const router = express.Router();

function mapBanner(row) {
  return {
    id: row.id,
    imageUrl: row.image_url,
    title: row.title || "",
    description: row.description || "",
    buttonText: row.button_text || "",
    link: row.link || "/",
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order || 0),
  };
}

router.get("/", async (req, res) => {
  try {
    const activeOnly = req.query.active !== "0";
    const sql = activeOnly
      ? "SELECT * FROM banners WHERE active = 1 ORDER BY sort_order ASC, created_at DESC"
      : "SELECT * FROM banners ORDER BY sort_order ASC, created_at DESC";
    const rows = await query(sql);
    return res.json({ banners: rows.map(mapBanner) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch banners" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const id = body.id || newId("ban");
    await query(
      `INSERT INTO banners (id, image_url, title, description, button_text, link, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.imageUrl || body.image_url || "",
        body.title || "",
        body.description || "",
        body.buttonText || body.button_text || "",
        body.link || "/",
        body.active === false ? 0 : 1,
        Number(body.sortOrder ?? body.sort_order ?? 0),
      ]
    );
    const rows = await query("SELECT * FROM banners WHERE id = ?", [id]);
    return res.status(201).json({ banner: mapBanner(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create banner" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const existing = await query("SELECT * FROM banners WHERE id = ?", [
      req.params.id,
    ]);
    if (!existing.length) {
      return res.status(404).json({ error: "Banner not found" });
    }
    const cur = existing[0];
    await query(
      `UPDATE banners SET image_url = ?, title = ?, description = ?, button_text = ?, link = ?, active = ?, sort_order = ? WHERE id = ?`,
      [
        body.imageUrl ?? body.image_url ?? cur.image_url,
        body.title ?? cur.title,
        body.description ?? cur.description,
        body.buttonText ?? body.button_text ?? cur.button_text,
        body.link ?? cur.link,
        body.active === undefined ? cur.active : body.active ? 1 : 0,
        body.sortOrder ?? body.sort_order ?? cur.sort_order,
        req.params.id,
      ]
    );
    const rows = await query("SELECT * FROM banners WHERE id = ?", [req.params.id]);
    return res.json({ banner: mapBanner(rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update banner" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const result = await query("DELETE FROM banners WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Banner not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete banner" });
  }
});

module.exports = router;
