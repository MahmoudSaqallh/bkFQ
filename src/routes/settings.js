const express = require("express");
const { query } = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { parseJsonField } = require("../utils/mappers");

const router = express.Router();

async function loadSettings() {
  const rows = await query("SELECT setting_key, setting_value FROM settings");
  const settings = {};
  for (const row of rows) {
    let value = row.setting_value;
    if (row.setting_key === "paymentMethods") {
      value = parseJsonField(value, []);
    } else if (
      row.setting_key === "taxPercent" ||
      row.setting_key === "shippingFlat"
    ) {
      value = Number(value);
    }
    settings[row.setting_key] = value;
  }
  return settings;
}

router.get("/", async (_req, res) => {
  try {
    const settings = await loadSettings();
    return res.json({ settings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.put("/", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    for (const [key, value] of Object.entries(body)) {
      const stored =
        typeof value === "object" ? JSON.stringify(value) : String(value);
      await query(
        `INSERT INTO settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, stored]
      );
    }
    const settings = await loadSettings();
    return res.json({ settings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update settings" });
  }
});

module.exports = router;
