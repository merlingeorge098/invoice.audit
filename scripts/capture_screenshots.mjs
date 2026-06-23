import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const SHOT_DIR = "c:/Users/Asus/Downloads/invoiceAUDIT/invoice-auditor-pro/submission_screenshots";

const rand = Math.random().toString(36).slice(2, 7);
const org = {
  organizationName: `Innovate Demo ${rand}`,
  domain: `innovatedemo${rand}.com`,
  adminName: "Priya Sharma",
  adminEmail: `priya@innovatedemo${rand}.com`,
};

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // ---------- 1. Signup ----------
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Acme Corp").fill(org.organizationName);
  await page.getByPlaceholder("acme.com", { exact: true }).fill(org.domain);
  await page.getByPlaceholder("Jane Smith").fill(org.adminName);
  await page.getByPlaceholder("jane@acme.com").fill(org.adminEmail);

  await page.getByRole("button", { name: /Create workspace/i }).click();
  await page.waitForURL(/\/app\/.+\/dashboard/, { timeout: 20000 });
  await page.waitForTimeout(1500);

  console.log("Signed up and landed on:", page.url());

  // ---------- 2. Seed sample data from the empty-state dashboard ----------
  // Seeding runs 18 invoices sequentially against a remote Supabase instance —
  // ~130+ round trips (vendor/PO creation + 6-rule validation per invoice) can take 30-60s.
  const seedBtn = page.getByRole("button", { name: /Load sample data/i });
  try {
    await seedBtn.waitFor({ state: "visible", timeout: 10000 });
    console.log("Seed button found, clicking...");

    const responsePromise = page
      .waitForResponse((r) => r.url().includes("/api/invoices/seed-sample"), { timeout: 90000 })
      .catch((e) => {
        console.log("waitForResponse did not resolve (request may still complete server-side):", e.message);
        return null;
      });

    await seedBtn.click();
    const response = await responsePromise;
    if (response) {
      console.log("Seed response status:", response.status());
    }
  } catch (err) {
    console.log("Seed step error:", err.message);
  }

  // Force a fresh reload regardless — page's own window.location.reload() may have
  // been skipped if the client navigated/disconnected before the server replied.
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Screenshot 1: Dashboard with populated metrics
  await page.screenshot({ path: `${SHOT_DIR}/01_dashboard.png`, fullPage: true });
  console.log("Captured: 01_dashboard.png");

  // ---------- 3. Exceptions queue with inline actions ----------
  const tenantSlugMatch = page.url().match(/\/app\/([^/]+)\//);
  const tenantSlug = tenantSlugMatch ? tenantSlugMatch[1] : null;
  await page.goto(`${BASE}/app/${tenantSlug}/exceptions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOT_DIR}/02_exceptions_queue.png`, fullPage: true });
  console.log("Captured: 02_exceptions_queue.png");

  // ---------- 4. Open a blocked/duplicate invoice detail ----------
  // Pick the row whose heading contains "INV-2024-001" — a known duplicate-flagged sample invoice.
  try {
    await page.waitForSelector("text=INV-2024-001", { timeout: 8000 });
    const targetCard = page.locator("text=INV-2024-001").first().locator("xpath=ancestor::div[contains(@class,'rounded-3xl')][1]");
    const reviewLink = targetCard.locator("a", { hasText: "Full review" }).first();
    const href = await reviewLink.getAttribute("href");
    console.log("Opening invoice detail href:", href);
    await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SHOT_DIR}/03_invoice_detail_blocked.png`, fullPage: true });
    console.log("Captured: 03_invoice_detail_blocked.png");
  } catch (err) {
    console.log("No exception row found to open — skipping invoice detail screenshot.", err.message);
  }

  // ---------- 5. GST Reconciliation page ----------
  await page.goto(`${BASE}/app/${tenantSlug}/reconciliation`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT_DIR}/04_gst_reconciliation.png`, fullPage: true });
  console.log("Captured: 04_gst_reconciliation.png");

  await browser.close();
  console.log("\nAll screenshots captured successfully.");
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
