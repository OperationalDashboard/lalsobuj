// Run with: npm run seed
// Creates the first admin login and a few sample rows so the dashboard
// isn't empty on first run. Safe to run once; skips work that already exists.

const bcrypt = require("bcryptjs");
const db = require("./db");
const { ROLES } = require("./roles");

function upsertAdmin() {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get("admin");
  if (existing) {
    console.log("Super Admin user already exists — skipping.");
    return;
  }
  const password_hash = bcrypt.hashSync("admin123", 10);
  db.prepare(
    "INSERT INTO users (username, password_hash, full_name, role) VALUES (?,?,?,?)"
  ).run("admin", password_hash, "System Super Admin", ROLES.SUPER_ADMIN);
  console.log("Created Super Admin -> username: admin / password: admin123 (change this immediately)");
}

function seedBuses() {
  const count = db.prepare("SELECT COUNT(*) as c FROM buses").get().c;
  if (count > 0) return;
  const insert = db.prepare(
    "INSERT INTO buses (reg_number, model, capacity, route, status) VALUES (?,?,?,?,?)"
  );
  insert.run("DHK-METRO-GA-11-1234", "Hino AK1J", 40, "Dhaka - Chittagong", "active");
  insert.run("DHK-METRO-GA-11-5678", "Ashok Leyland Viking", 36, "Dhaka - Sylhet", "active");
  insert.run("DHK-METRO-GA-11-9012", "Hino RK", 40, "Dhaka - Cox's Bazar", "maintenance");
  console.log("Seeded sample buses.");
}

function seedPartsCatalog() {
  const count = db.prepare("SELECT COUNT(*) as c FROM parts_catalog").get().c;
  if (count > 0) return;
  const insert = db.prepare("INSERT INTO parts_catalog (part_name) VALUES (?)");
  ["Wheel / Tyre", "Engine Oil (Mobil)", "Oil Filter", "Air Filter", "Fuel Filter", "Brake Pads", "Battery", "Clutch Plate"]
    .forEach((name) => insert.run(name));
  console.log("Seeded parts catalog.");
}

function seedHotels() {
  const count = db.prepare("SELECT COUNT(*) as c FROM hotels").get().c;
  if (count > 0) return;
  const insert = db.prepare("INSERT INTO hotels (name) VALUES (?)");
  ["Hotel Rajdhani (Cumilla)", "Highway Inn (Feni)", "Green Valley Rest House (Sirajganj)"]
    .forEach((name) => insert.run(name));
  console.log("Seeded favourite hotels list.");
}

function seedRoutes() {
  const count = db.prepare("SELECT COUNT(*) as c FROM routes").get().c;
  if (count > 0) return;
  const insert = db.prepare("INSERT INTO routes (name) VALUES (?)");
  ["Dhaka - Chittagong", "Dhaka - Sylhet", "Dhaka - Cox's Bazar"].forEach((name) => insert.run(name));
  console.log("Seeded routes list.");
}

function seedCounters() {
  const count = db.prepare("SELECT COUNT(*) as c FROM counters").get().c;
  if (count > 0) return;
  const insert = db.prepare("INSERT INTO counters (name, location) VALUES (?,?)");
  insert.run("Gabtoli Counter", "Dhaka");
  insert.run("Cumilla Counter", "Cumilla");
  console.log("Seeded counters list.");
}

function seedDiscountTypes() {
  const count = db.prepare("SELECT COUNT(*) as c FROM discount_types").get().c;
  if (count > 0) return;
  const insert = db.prepare("INSERT INTO discount_types (name) VALUES (?)");
  ["Online", "VIP"].forEach((name) => insert.run(name));
  console.log("Seeded discount types.");
}

upsertAdmin();
seedBuses();
seedPartsCatalog();
seedHotels();
seedRoutes();
seedCounters();
seedDiscountTypes();
console.log("Seed complete.");
