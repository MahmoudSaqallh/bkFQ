const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../config/db");
const { newId } = require("../utils/mappers");
const { createNotification } = require("../utils/notifications");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const rows = await query("SELECT * FROM admins WHERE username = ?", [
      username,
    ]);
    const admin = rows[0];
    if (!admin) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: "admin" },
      process.env.JWT_SECRET || "fashique-dev-secret",
      { expiresIn: "7d" }
    );

    return res.json({ token, accessToken: token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { username, name, email, password, phone } = req.body || {};
    const displayName = name || username;
    if (!displayName || !email || !password) {
      return res
        .status(400)
        .json({ error: "Name, email and password are required" });
    }

    const existing = await query("SELECT id FROM customers WHERE email = ?", [
      email,
    ]);
    if (existing.length) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const id = newId("cust");
    const hash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO customers (id, name, email, password_hash, phone, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [id, displayName, email, hash, phone || ""]
    );

    const token = jwt.sign(
      { id, email, role: "customer" },
      process.env.JWT_SECRET || "fashique-dev-secret",
      { expiresIn: "7d" }
    );

    await createNotification({
      email,
      customerId: id,
      type: "account",
      title: "Welcome to FashiQue",
      message: `Hi ${displayName}! Your account was created successfully. Track orders, payments, and complaints from Notifications.`,
      link: "/Ui-components/Pages/Notifications",
    });

    return res.status(201).json({
      token,
      customer: { id, name: displayName, email, phone: phone || "" },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/customer-login", async (req, res) => {
  try {
    const { email, username, password } = req.body || {};
    const login = email || username;
    if (!login || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const rows = await query(
      "SELECT * FROM customers WHERE email = ? OR name = ?",
      [login, login]
    );
    const customer = rows[0];
    if (!customer) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (customer.status === "blocked") {
      return res.status(403).json({ error: "Account is blocked" });
    }

    const ok = await bcrypt.compare(password, customer.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: customer.id, email: customer.email, role: "customer" },
      process.env.JWT_SECRET || "fashique-dev-secret",
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone || "",
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
