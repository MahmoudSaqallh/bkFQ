const { v4: uuidv4 } = require("uuid");

function parseJsonField(value, fallback = []) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapItem(row) {
  if (!row) return null;
  const price = Number(row.price);
  const compareAt = Number(row.compare_at_price || price);
  let discount = Number(row.discount_percent || 0);
  if (!discount && compareAt > price) {
    discount = Math.round(((compareAt - price) / compareAt) * 100);
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    price,
    compareAtPrice: compareAt,
    discountPercent: discount,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id || "",
    sizes: parseJsonField(row.sizes, []),
    colors: parseJsonField(row.colors, []),
    stock: Number(row.stock || 0),
    lowStockThreshold: Number(row.low_stock_threshold || 5),
    imageUrl: row.image_url || "",
    sku: row.sku || "",
    status: row.status || "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar || "",
    slug: row.slug,
    active: Boolean(row.active),
  };
}

function mapOrder(row) {
  if (!row) return null;
  const shipping = parseJsonField(row.shipping_address, {});
  const address =
    typeof shipping === "string"
      ? shipping
      : [shipping.line1, shipping.city, shipping.country, shipping.zip]
          .filter(Boolean)
          .join(", ");

  return {
    id: row.id,
    customerId: row.customer_id || "",
    customerName: row.customer_name,
    email: row.email,
    phone: row.phone || "",
    address,
    shippingAddress: shipping,
    items: parseJsonField(row.items, []),
    totalAmount: Number(row.total_amount),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    status: row.status,
    sessionId: row.session_id,
    createdAt: row.created_at,
  };
}

function mapCustomer(row, stats = {}) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    status: row.status || "active",
    ordersCount: Number(stats.ordersCount || 0),
    totalSpent: Number(stats.totalSpent || 0),
    lastOrderAt: stats.lastOrderAt || "",
    createdAt: row.created_at,
  };
}

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    subject: row.subject || "",
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapComplaint(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    orderId: row.order_id || "",
    type: row.type || "other",
    subject: row.subject || "",
    message: row.message,
    status: row.status || "new",
    adminReply: row.admin_reply || "",
    createdAt: row.created_at,
  };
}

function newId(prefix = "id") {
  return `${prefix}-${uuidv4().slice(0, 8)}`;
}

const STATUS_ALIASES = {
  pending: "new",
  processing: "preparing",
  ready: "ready_to_ship",
};

function normalizeOrderStatus(status) {
  if (!status) return "new";
  const key = String(status).toLowerCase().trim();
  return STATUS_ALIASES[key] || key;
}

module.exports = {
  parseJsonField,
  mapItem,
  mapCategory,
  mapOrder,
  mapCustomer,
  mapMessage,
  mapComplaint,
  newId,
  normalizeOrderStatus,
};
