// scripts/migrate-lab2-passwords.ts
// Lab 3 migration step: generate one system-issued initial password per User
// row still missing a passwordHash (i.e. every migrated Lab 2 RequesterUser).
// Must run AFTER migration 20260915000001_lab3_auth_roles (passwordHash
// nullable) and BEFORE migration 20260915000002_lab3_password_not_null.
//
// Uses $queryRaw/$executeRaw throughout, never
// prisma.user.findMany({ where: { passwordHash: null } }): the generated
// Prisma Client is typed against schema.prisma, where passwordHash is
// String (non-nullable). The client rejects a `passwordHash = NULL` filter
// against a non-nullable typed field, even though the real database column
// is still nullable at this point in the two-step migration. Raw SQL
// bypasses the client's type layer and talks to the actual column.

import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const BCRYPT_COST = 12;
const CSV_PATH = path.join(__dirname, "..", "prisma", ".migrated-lab2-credentials.local.csv");

function generateInitialPassword(): string {
  // 14-char random string, mixed case + digits + symbols, per BR-23 /
  // UNIT-03 ("random >=12-char string, never deterministic across calls").
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let pwd = "";
  for (let i = 0; i < 14; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

type UserNeedingBackfill = { id: number; email: string; name: string };

async function main() {
  const rows = await prisma.$queryRaw<UserNeedingBackfill[]>`
    SELECT "id", "email", "name" FROM "User" WHERE "passwordHash" IS NULL
  `;

  if (rows.length === 0) {
    console.log("No users need a backfilled password. Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  const csvLines = ["email,initialPassword"];

  for (const user of rows) {
    const initialPassword = generateInitialPassword();
    const passwordHash = await bcrypt.hash(initialPassword, BCRYPT_COST);

    await prisma.$executeRaw`
      UPDATE "User" SET "passwordHash" = ${passwordHash} WHERE "id" = ${user.id}
    `;

    csvLines.push(`${user.email},${initialPassword}`);
    console.log(`Backfilled password for ${user.email} (id ${user.id}).`);
  }

  fs.writeFileSync(CSV_PATH, csvLines.join("\n") + "\n", { encoding: "utf-8" });
  console.log(`\n${rows.length} password(s) backfilled.`);
  console.log(`Plaintext initial passwords written to ${CSV_PATH} (local only, git-ignored).`);
  console.log("These are NOT real credentials and must never be committed or shared.");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("migrate-lab2-passwords failed:", err);
  process.exit(1);
});
