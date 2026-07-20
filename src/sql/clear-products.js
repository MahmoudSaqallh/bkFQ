require("dotenv").config();
const { query } = require("../config/db");

async function main() {
  const before = await query("SELECT id, name FROM items");
  console.log(`Found ${before.length} products`);
  await query("DELETE FROM items");
  const after = await query("SELECT COUNT(*) AS c FROM items");
  console.log(`Deleted. Remaining: ${after[0].c}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
