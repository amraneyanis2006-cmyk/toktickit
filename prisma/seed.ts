import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── Categories (idempotent upsert by unique name) ──────────────────────
  const categories = ["Account and Access", "Hardware", "Software", "Network"];

  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
  }

  // ── Related Systems (idempotent upsert by unique name) ─────────────────
  const relatedSystems = [
    "Email",
    "Campus Wi-Fi",
    "VPN",
    "LEB2 App",
    "Grade Submission App",
    "Printer",
    "Corporate Laptop",
  ];

  for (const name of relatedSystems) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
  }

  // ── Development Requesters (idempotent upsert by unique email) ─────────
  // At least 4 active + 1 inactive, per labsheet §5.3.
  const requesters = [
    { name: "Jennifer Anderson", email: "jennifer.anderson@toktickit.test", isActive: true },
    { name: "Michael Brown", email: "michael.brown@toktickit.test", isActive: true },
    { name: "Sarah Johnson", email: "sarah.johnson@toktickit.test", isActive: true },
    { name: "David Lee", email: "david.lee@toktickit.test", isActive: true },
    { name: "Robert Wilson", email: "robert.wilson@toktickit.test", isActive: false },
  ];

  for (const requester of requesters) {
    await prisma.requesterUser.upsert({
      where: { email: requester.email },
      update: { name: requester.name, isActive: requester.isActive },
      create: requester,
    });
  }

  console.log("✅ Lab 2 seed complete:");
  console.log(`   - ${categories.length} categories`);
  console.log(`   - ${relatedSystems.length} related systems`);
  console.log(
    `   - ${requesters.length} requesters (${requesters.filter((r) => r.isActive).length} active, ${
      requesters.filter((r) => !r.isActive).length
    } inactive)`
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
