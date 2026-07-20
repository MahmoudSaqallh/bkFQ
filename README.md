# FashiQue Backend

Node.js + MySQL/MariaDB API for the FashiQue website and admin dashboard.

## Setup

1. Start MySQL/MariaDB on port `3306` (root with empty password by default, or edit `.env`).
2. Copy `.env.example` to `.env` and adjust if needed.
3. Install and initialize:

```bash
npm install
npm run db:init
npm start
```

API runs at **http://localhost:3001**

## Default admin

- Username: `admin`
- Password: `admin123`

## Main endpoints

- `POST /api/auth/login` — admin
- `POST /api/auth/register` — customer
- `POST /api/auth/customer-login` — customer
- `GET/POST /api/items` — products
- `GET/POST /api/categories`
- `GET/POST /api/orders`
- `GET/PATCH /api/customers`
- `GET/POST /api/messages`
- `GET/PUT /api/settings`
