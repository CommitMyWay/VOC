import { initDb, upsertAppRegistry } from "./index.ts";

const now = Math.floor(Date.now() / 1000);
const seedApps = [
  { name: "MoMo", play_id: "com.mservice.momotransfer", app_store_id: "918751511", category: "e-wallet" },
  { name: "ZaloPay", play_id: "vn.com.vng.zalopay", app_store_id: "1104616807", category: "e-wallet" },
  { name: "ShopeePay", play_id: "com.shopeepay.wallet", app_store_id: "6451046172", category: "e-wallet" },
  { name: "VNPay", play_id: "com.vnpay.vnpayqr", app_store_id: "1438243567", category: "e-wallet" },
  { name: "Viettel Money", play_id: "com.viettel.wallet", app_store_id: "1492676280", category: "e-wallet" },
];

await initDb();

for (const app of seedApps) {
  await upsertAppRegistry({
    ...app,
    icon_url: null,
    resolved_at: now,
    source: "seed",
  });
}

console.log(`Seeded ${seedApps.length} apps into app_registry`);
