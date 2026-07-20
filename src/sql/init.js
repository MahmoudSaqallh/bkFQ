require("dotenv").config();
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const { v4: uuidv4 } = require("uuid");

async function main() {
  const host = process.env.DB_HOST || "localhost";
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const dbName = process.env.DB_NAME || "fashique";

  const conn = await mysql.createConnection({ host, port, user, password, multipleStatements: true });

  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await conn.query(schema);
  await conn.changeUser({ database: dbName });

  const [admins] = await conn.query("SELECT COUNT(*) AS c FROM admins");
  if (admins[0].c === 0) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const plain = process.env.ADMIN_PASSWORD || "admin123";
    const hash = await bcrypt.hash(plain, 10);
    await conn.query(
      "INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)",
      [`admin-${uuidv4().slice(0, 8)}`, username, hash]
    );
    console.log(`Seeded admin: ${username} / ${plain}`);
  }

  const [cats] = await conn.query("SELECT COUNT(*) AS c FROM categories");
  if (cats[0].c === 0) {
    const categories = [
      { id: "cat-001", name: "Shirt", nameAr: "قمصان", slug: "shirt" },
      { id: "cat-002", name: "Pants", nameAr: "بناطيل", slug: "pants" },
      { id: "cat-003", name: "Jacket", nameAr: "جاكيتات", slug: "jacket" },
      { id: "cat-004", name: "Jeans", nameAr: "جينز", slug: "jeans" },
      { id: "cat-005", name: "Accessories", nameAr: "إكسسوارات", slug: "accessories" },
    ];
    for (const c of categories) {
      await conn.query(
        "INSERT INTO categories (id, name, name_ar, slug, active) VALUES (?, ?, ?, ?, 1)",
        [c.id, c.name, c.nameAr, c.slug]
      );
    }
    console.log("Seeded categories");
  }

  const [settings] = await conn.query("SELECT COUNT(*) AS c FROM settings");
  if (settings[0].c === 0) {
    const defaults = {
      storeName: "Fashi Que",
      logoUrl: "/brand/fashique-logo.png",
      email: "hello@fashique.com",
      phone: "",
      whatsapp: "",
      instagram: "",
      facebook: "",
      tiktok: "",
      currency: "USD",
      taxPercent: "0",
      shippingFlat: "0",
      paymentMethods: JSON.stringify(["card", "paypal", "cod"]),
    };
    for (const [key, value] of Object.entries(defaults)) {
      await conn.query(
        "INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)",
        [key, value]
      );
    }
    console.log("Seeded settings");
  }

  const [items] = await conn.query("SELECT COUNT(*) AS c FROM items");
  if (items[0].c === 0) {
    const sample = [
      {
        id: "item-001",
        name: "Classic White Shirt",
        description: "Soft cotton shirt for everyday wear",
        price: 49.99,
        category_id: "cat-001",
        sizes: ["S", "M", "L", "XL"],
        colors: ["White", "Ivory"],
        stock: 25,
        image_url: "/images/products/shirt-1.jpg",
        sku: "SHIRT-001",
      },
      {
        id: "item-002",
        name: "Slim Fit Pants",
        description: "Comfortable slim pants",
        price: 69.99,
        category_id: "cat-002",
        sizes: ["S", "M", "L"],
        colors: ["Black", "Beige"],
        stock: 18,
        image_url: "/images/products/pants-1.jpg",
        sku: "PANTS-001",
      },
      {
        id: "item-003",
        name: "Denim Jacket",
        description: "Vintage-inspired denim jacket",
        price: 89.99,
        category_id: "cat-003",
        sizes: ["M", "L", "XL"],
        colors: ["Blue"],
        stock: 12,
        image_url: "/images/products/jacket-1.jpg",
        sku: "JACKET-001",
      },
    ];
    for (const item of sample) {
      await conn.query(
        `INSERT INTO items
        (id, name, description, price, category_id, sizes, colors, stock, image_url, sku, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          item.id,
          item.name,
          item.description,
          item.price,
          item.category_id,
          JSON.stringify(item.sizes),
          JSON.stringify(item.colors),
          item.stock,
          item.image_url,
          item.sku,
        ]
      );
    }
    console.log("Seeded sample items");
  }

  await conn.end();
  console.log("Database ready.");
}

main().catch((err) => {
  console.error("DB init failed:", err.message);
  process.exit(1);
});
