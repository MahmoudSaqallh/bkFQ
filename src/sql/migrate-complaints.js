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
    CREATE TABLE IF NOT EXISTS complaints (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(200) NOT NULL,
      phone VARCHAR(50) DEFAULT '',
      order_id VARCHAR(64) DEFAULT '',
      type VARCHAR(40) NOT NULL DEFAULT 'other',
      subject VARCHAR(255) DEFAULT '',
      message TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'new',
      admin_reply TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_complaints_status (status)
    )
  `);

  console.log("complaints table ready");
  await conn.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
