require("dotenv").config();
const mysql = require("mysql2/promise");

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "fashique",
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(200) NOT NULL,
      customer_id VARCHAR(64) DEFAULT NULL,
      type VARCHAR(40) NOT NULL DEFAULT 'general',
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      link VARCHAR(255) DEFAULT '',
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notifications_email (email),
      INDEX idx_notifications_read (is_read)
    )
  `);

  console.log("notifications table ready");
  await conn.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
