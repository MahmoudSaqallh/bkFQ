require("dotenv").config();
const mysql = require("mysql2/promise");

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].c > 0;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "fashique",
    multipleStatements: true,
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS subcategories (
      id VARCHAR(64) PRIMARY KEY,
      category_id VARCHAR(64) NOT NULL,
      name VARCHAR(150) NOT NULL,
      name_ar VARCHAR(150) NOT NULL DEFAULT '',
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_subcategories_category (category_id)
    );

    CREATE TABLE IF NOT EXISTS banners (
      id VARCHAR(64) PRIMARY KEY,
      image_url TEXT NOT NULL,
      title VARCHAR(255) NOT NULL DEFAULT '',
      description TEXT,
      button_text VARCHAR(100) DEFAULT '',
      link VARCHAR(255) DEFAULT '/',
      active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id VARCHAR(64) PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      type VARCHAR(20) NOT NULL DEFAULT 'percent',
      value DECIMAL(12,2) NOT NULL DEFAULT 0,
      starts_at DATE DEFAULT NULL,
      ends_at DATE DEFAULT NULL,
      min_purchase DECIMAL(12,2) NOT NULL DEFAULT 0,
      max_uses INT NOT NULL DEFAULT 100,
      used_count INT NOT NULL DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const itemCols = [
    ["compare_at_price", "DECIMAL(12,2) NOT NULL DEFAULT 0"],
    ["discount_percent", "INT NOT NULL DEFAULT 0"],
    ["subcategory_id", "VARCHAR(64) DEFAULT NULL"],
    ["low_stock_threshold", "INT NOT NULL DEFAULT 5"],
  ];
  for (const [col, def] of itemCols) {
    if (!(await columnExists(conn, "items", col))) {
      await conn.query(`ALTER TABLE items ADD COLUMN ${col} ${def}`);
    }
  }

  await conn.query(`
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

  if (!(await columnExists(conn, "reviews", "status"))) {
    await conn.query(
      `ALTER TABLE reviews ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'approved'`
    );
  }
  if (!(await columnExists(conn, "reviews", "admin_reply"))) {
    await conn.query(`ALTER TABLE reviews ADD COLUMN admin_reply TEXT`);
  }

  const [coupons] = await conn.query("SELECT COUNT(*) AS c FROM coupons");
  if (coupons[0].c === 0) {
    await conn.query(
      `INSERT INTO coupons (id, code, type, value, starts_at, ends_at, min_purchase, max_uses, used_count, active)
       VALUES
       ('cpn-001', 'SUMMER20', 'percent', 20, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 90 DAY), 50, 200, 0, 1),
       ('cpn-002', 'WELCOME15', 'fixed', 15, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 365 DAY), 30, 500, 0, 1)`
    );
  }

  const [banners] = await conn.query("SELECT COUNT(*) AS c FROM banners");
  if (banners[0].c === 0) {
    await conn.query(
      `INSERT INTO banners (id, image_url, title, description, button_text, link, active, sort_order)
       VALUES
       ('ban-001', '/Hero.webp', 'Your Ultimate Online Store', 'Free shipping on $99+ orders', 'Our Shop', '/Ui-components/shop', 1, 1),
       ('ban-002', '/hero-small-1.webp', 'Summer Collection', 'Fresh styles for the season', 'View Details', '/Ui-components/shop', 1, 2)`
    );
  }

  const [subs] = await conn.query("SELECT COUNT(*) AS c FROM subcategories");
  if (subs[0].c === 0) {
    const rows = [
      ["sub-eve", "cat-001", "Evening", "سهرة"],
      ["sub-cas", "cat-001", "Casual", "كاجوال"],
      ["sub-form", "cat-001", "Formal", "رسمية"],
      ["sub-party", "cat-001", "Party", "حفلات"],
    ];
    for (const [id, catId, name, nameAr] of rows) {
      await conn.query(
        `INSERT INTO subcategories (id, category_id, name, name_ar, active) VALUES (?, ?, ?, ?, 1)`,
        [id, catId, name, nameAr]
      );
    }
  }

  await conn.end();
  console.log("Feature migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
