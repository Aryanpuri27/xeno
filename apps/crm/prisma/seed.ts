/**
 * Seed file for Xeno CRM — Nike brand identity
 * 10,000 customers | 20,000–30,000 orders | Nike product catalog
 *
 * Run: pnpm db:seed
 */

import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";
import { createId } from "@paralleldrive/cuid2";

const db = new PrismaClient();

// ── Nike product catalog ──────────────────────────────────────────────────────

const PRODUCTS = [
  // Running
  { name: "Air Zoom Pegasus 41", category: "running", price: 13995, sku: "NK-PEG-41", description: "Nike's most popular running shoe engineered for daily training with responsive cushioning and breathable mesh upper." },
  { name: "React Infinity Run Flyknit 4", category: "running", price: 15995, sku: "NK-RIF-4", description: "Designed to help reduce injury with a rocker shape and plush React foam cushioning for long runs." },
  { name: "Vomero 17", category: "running", price: 14995, sku: "NK-VOM-17", description: "Maximum cushioning for easy miles with plush ZoomX foam and a wide, stable base." },
  { name: "Invincible 3", category: "running", price: 18995, sku: "NK-INV-3", description: "The softest, most cushioned Nike running shoe ever made. ZoomX foam stacked high." },
  { name: "Structure 25", category: "running", price: 12995, sku: "NK-STR-25", description: "Stable cushioning for mild over-pronators. Dual-density foam for support and comfort." },
  // Basketball
  { name: "LeBron 21", category: "basketball", price: 19995, sku: "NK-LBJ-21", description: "LeBron's 21st signature shoe with Air Max cushioning for explosive play." },
  { name: "Kobe 6 Protro", category: "basketball", price: 16995, sku: "NK-KB6-PRO", description: "Kobe's iconic low-top reborn with modern Zoom Air cushioning and the original colorways." },
  { name: "KD 17", category: "basketball", price: 17995, sku: "NK-KD-17", description: "Kevin Durant's latest signature shoe engineered for speed and responsiveness." },
  { name: "GT Cut 3", category: "basketball", price: 14995, sku: "NK-GTC-3", description: "Low-to-ground lateral cutter with React X foam and aggressive traction pattern." },
  { name: "Air Zoom G.T. Jump 2", category: "basketball", price: 16995, sku: "NK-GTJ-2", description: "Built for forwards who need lift and court feel on every play." },
  // Lifestyle & Sneakers
  { name: "Air Force 1 '07", category: "lifestyle", price: 8995, sku: "NK-AF1-07", description: "The Nike Air Force 1 is the first basketball shoe to use Nike Air cushioning. A timeless icon." },
  { name: "Air Max 90", category: "lifestyle", price: 9995, sku: "NK-AM90", description: "Classic running turned street with visible Air heel unit and waffle outsole." },
  { name: "Dunk Low Retro", category: "lifestyle", price: 9495, sku: "NK-DLR-23", description: "Originally a basketball shoe, the Dunk has become a streetwear staple in bold colorways." },
  { name: "Air Max 270", category: "lifestyle", price: 11995, sku: "NK-AM270", description: "Nike's biggest Air unit ever. Lifestyle shoe with an ultra-comfortable ride." },
  { name: "Blazer Mid '77", category: "lifestyle", price: 8495, sku: "NK-BLZ-77", description: "The Blazer brings vintage hoops heritage to the streets with a high ankle silhouette." },
  // Training & Fitness
  { name: "Metcon 9", category: "training", price: 12495, sku: "NK-MTC-9", description: "Built for heavy lifting and high-intensity training with a flat, stable heel and durable sole." },
  { name: "Free Metcon 6", category: "training", price: 11995, sku: "NK-FMT-6", description: "Flexible enough for cardio, stable enough for lifting. The best of both training worlds." },
  { name: "Flex Experience Run 12", category: "training", price: 5995, sku: "NK-FER-12", description: "Lightweight and flexible everyday trainer with natural barefoot feel." },
  // Apparel
  { name: "Dri-FIT Running Jacket", category: "apparel", price: 7995, sku: "NK-DRF-JKT", description: "Lightweight, packable running jacket with Dri-FIT technology to wick sweat away fast." },
  { name: "Tech Fleece Jogger", category: "apparel", price: 6995, sku: "NK-TF-JOG", description: "Super-soft Tech Fleece fabric that's warm but lightweight. Tapered fit for clean look." },
  { name: "Pro Compression Tights", category: "apparel", price: 4995, sku: "NK-PRO-TGT", description: "Tight fit to support muscles during intense training. Dri-FIT keeps you cool." },
  { name: "Sportswear Club Hoodie", category: "apparel", price: 5495, sku: "NK-NSW-HDY", description: "Classic pullover hoodie in French terry fabric. Relaxed fit with kangaroo pocket." },
  // Accessories
  { name: "Running Hydration Vest", category: "accessories", price: 3995, sku: "NK-HYD-VST", description: "Lightweight hydration vest for long runs. Holds two soft flasks and phone." },
  { name: "Sport Band Watch", category: "accessories", price: 14995, sku: "NK-SBW-01", description: "GPS running watch with heart rate monitoring and Nike Run Club integration." },
  { name: "Elite Running Socks", category: "accessories", price: 1295, sku: "NK-ERS-PKG", description: "Arch support, Dri-FIT cushioning, and anatomical fit. Pack of 3." },
  { name: "Air Max Bag", category: "accessories", price: 4495, sku: "NK-AMB-01", description: "Drawstring gym bag with Air Max bubble graphic. Lightweight and packable." },
];

// ── Cities distribution (India + Global for Nike's international presence) ───

const CITIES = [
  { city: "Mumbai", weight: 18 },
  { city: "Delhi", weight: 16 },
  { city: "Bangalore", weight: 15 },
  { city: "Hyderabad", weight: 8 },
  { city: "Chennai", weight: 7 },
  { city: "Kolkata", weight: 6 },
  { city: "Pune", weight: 6 },
  { city: "Ahmedabad", weight: 5 },
  { city: "Jaipur", weight: 4 },
  { city: "Surat", weight: 3 },
  { city: "New York", weight: 3 },
  { city: "London", weight: 2 },
  { city: "Dubai", weight: 2 },
  { city: "Singapore", weight: 2 },
  { city: "Sydney", weight: 1 },
  { city: "Toronto", weight: 1 },
  { city: "Paris", weight: 1 },
];

// ── Nike brand memory ─────────────────────────────────────────────────────────

const NIKE_BRAND_MEMORY = {
  brandName: "Nike",
  brandTone: "Motivational",
  preferredChannels: ["email", "whatsapp"],
  bestPerformingCategories: ["running", "basketball", "lifestyle"],
  avoidTopics: ["competitor comparisons", "heavy discounting", "price-first messaging"],
  ctaStyle: "urgency-first",
  targetDemographic: "athletes and fitness enthusiasts aged 18-45, performance-driven",
  brandVoice: "Bold, empowering, just do it mindset. Speak to the athlete in everyone.",
  priceRange: "mid-to-premium",
  currentCampaignTheme: "Every rep counts. Every mile matters.",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function weightedRandom<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let rand = Math.random() * total;
  for (const item of items) {
    rand -= item.weight;
    if (rand <= 0) return item;
  }
  return items[items.length - 1]!;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Starting Xeno CRM seed (Nike brand)...");

  // Clear existing data
  console.log("🗑️  Clearing existing data...");
  await db.$transaction([
    db.communicationEvent.deleteMany(),
    db.communication.deleteMany(),
    db.campaignMemory.deleteMany(),
    db.orchestratorRun.deleteMany(),
    db.campaign.deleteMany(),
    db.order.deleteMany(),
    db.product.deleteMany(),
    db.customer.deleteMany(),
    db.settings.deleteMany(),
  ]);

  // ── 1. Nike brand memory ────────────────────────────────────────────────────
  console.log("👟 Seeding Nike brand memory...");
  await db.settings.create({
    data: {
      key: "brand_memory",
      value: NIKE_BRAND_MEMORY,
    },
  });

  // ── 2. Products ─────────────────────────────────────────────────────────────
  console.log("📦 Seeding product catalog...");
  const productData = PRODUCTS.map((p) => ({
    id: createId(),
    name: p.name,
    category: p.category,
    price: p.price,
    description: p.description,
    sku: p.sku,
    inStock: Math.random() > 0.05, // 95% in stock
  }));
  // Use createManyAndReturn to insert all products in one query and get IDs back
  const createdProducts = await db.product.createManyAndReturn({ data: productData });
  console.log(`  ✅ ${createdProducts.length} products created`);

  // ── 3. Customers (10,000) ───────────────────────────────────────────────────
  console.log("👤 Seeding 10,000 customers...");
  const CUSTOMER_COUNT = 10_000;
  const BATCH_SIZE = 500;

  const tiers = [
    { tier: "standard", weight: 55 },
    { tier: "silver", weight: 25 },
    { tier: "gold", weight: 15 },
    { tier: "elite", weight: 5 },
  ];

  for (let batch = 0; batch < CUSTOMER_COUNT / BATCH_SIZE; batch++) {
    const customers = Array.from({ length: BATCH_SIZE }, () => {
      const id = createId();
      const city = weightedRandom(CITIES).city;
      const gender = Math.random() > 0.42 ? "male" : Math.random() > 0.1 ? "female" : "non-binary";
      const tier = weightedRandom(tiers).tier;
      const joinedAt = randomDate(new Date("2020-01-01"), new Date("2025-06-01"));

      return {
        id,
        name: faker.person.fullName(),
        email: `${id}@niketest.com`, // Use cuid-based email to guarantee uniqueness
        phone: faker.phone.number(),
        city,
        gender,
        age: faker.number.int({ min: 16, max: 55 }),
        tier,
        createdAt: joinedAt,
        updatedAt: joinedAt,
      };
    });

    await db.customer.createMany({ data: customers });

    if ((batch + 1) % 4 === 0) {
      process.stdout.write(`  ✅ ${(batch + 1) * BATCH_SIZE} customers...\r`);
    }
  }
  console.log(`  ✅ ${CUSTOMER_COUNT} customers created`);

  // Fetch actual IDs from DB — reliable even if any were skipped
  const allCustomers = await db.customer.findMany({ select: { id: true } });
  const customerIds = allCustomers.map((c) => c.id);

  // ── 4. Orders (25,000) ─────────────────────────────────────────────────────

  console.log("🛒 Seeding ~25,000 orders...");
  const ORDER_COUNT = 25_000;
  const ORDER_BATCH = 500;

  // Category weights — Nike's bestsellers
  const categoryWeights = [
    { category: "running", weight: 35 },
    { category: "lifestyle", weight: 30 },
    { category: "basketball", weight: 15 },
    { category: "training", weight: 12 },
    { category: "apparel", weight: 5 },
    { category: "accessories", weight: 3 },
  ];

  const productsByCategory = createdProducts.reduce(
    (acc, p) => {
      if (!acc[p.category]) acc[p.category] = [];
      acc[p.category]!.push(p);
      return acc;
    },
    {} as Record<string, typeof createdProducts>
  );

  for (let batch = 0; batch < ORDER_COUNT / ORDER_BATCH; batch++) {
    const orders = Array.from({ length: ORDER_BATCH }, () => {
      const customerId = customerIds[Math.floor(Math.random() * customerIds.length)]!;
      const category = weightedRandom(categoryWeights).category;
      const productsInCat = productsByCategory[category] ?? createdProducts;
      const product = productsInCat[Math.floor(Math.random() * productsInCat.length)]!;

      // Skew orders: some customers have many orders, most have few
      // Orders range from 6 months ago to 2 years ago (dormant segment possibility)
      const daysAgo = Math.random() < 0.3
        ? faker.number.int({ min: 7, max: 90 })   // 30% recent orders (0-90 days)
        : faker.number.int({ min: 60, max: 730 }); // 70% older orders

      const orderedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

      return {
        id: createId(),
        customerId,
        productId: product.id,
        amount: product.price * (Math.random() < 0.15 ? 0.85 : 1), // 15% get a discount
        quantity: Math.random() < 0.85 ? 1 : faker.number.int({ min: 2, max: 3 }),
        orderedAt,
        createdAt: orderedAt,
      };
    });

    await db.order.createMany({ data: orders });

    if ((batch + 1) % 10 === 0) {
      process.stdout.write(`  ✅ ${(batch + 1) * ORDER_BATCH} orders...\r`);
    }
  }
  console.log(`  ✅ ${ORDER_COUNT} orders created`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  const customerCount = await db.customer.count();
  const orderCount = await db.order.count();
  const productCount = await db.product.count();

  console.log("\n✅ Seed complete!");
  console.log(`   Customers: ${customerCount.toLocaleString()}`);
  console.log(`   Orders:    ${orderCount.toLocaleString()}`);
  console.log(`   Products:  ${productCount}`);
  console.log(`   Brand:     Nike`);
  console.log(`\n   Segment ideas to try:`);
  console.log(`   • "Running shoe buyers inactive for 60+ days"`);
  console.log(`   • "Elite tier customers who bought basketball shoes"`);
  console.log(`   • "Customers in Mumbai who bought lifestyle shoes in the last 90 days"`);
  console.log(`   • "Customers who spent over ₹20,000 total but haven't ordered in 30 days"`);
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
