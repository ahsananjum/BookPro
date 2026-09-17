import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";

// Load .env manually if needed
const envPath = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
            const idx = trimmed.indexOf("=");
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
            process.env[key] = val;
        }
    }
}

import { EncryptionService } from "@bookpro/server-core";
import { GoogleCalendarAdapter } from "@bookpro/server-core";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testGoogleConfiguration() {
    console.log("\n================================================================================");
    console.log("🔐 TESTING LIVE GOOGLE CALENDAR & ENCRYPTION CONFIGURATION");
    console.log("================================================================================\n");

    let passCount = 0;
    const totalCount = 6;

    function assert(cond: boolean, name: string, detail?: string) {
        if (cond) {
            passCount++;
            console.log(` ✅ PASS [${passCount}/${totalCount}]: ${name}`);
        } else {
            console.error(` ❌ FAIL: ${name}`);
            if (detail) console.error(`    Detail: ${detail}`);
            process.exit(1);
        }
    }

    // 1. Check required environment variables presence
    console.log("--- 1. Environment Variable Presence ---");
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const encKey = process.env.ENCRYPTION_KEY;
    const apiBase = process.env.API_BASE_URL || "http://localhost:4000";

    assert(
        !!(clientId && clientId.includes(".apps.googleusercontent.com") && clientSecret && !clientSecret.includes("mock")),
        "1. Google OAuth2 Credentials present and structured as real Google Client credentials"
    );

    // 2. Encryption Key validation (32 bytes AES-256)
    console.log("\n--- 2. AES-256-GCM Encryption Key Validation ---");
    assert(
        !!(encKey && encKey.length === 64),
        "2. ENCRYPTION_KEY is valid 32-byte (64 hex character) key for AES-256-GCM"
    );

    // 3. Cryptographic roundtrip test
    console.log("\n--- 3. AES-256-GCM Authenticated Encryption Roundtrip ---");
    const testSecret = "1//04_real_google_refresh_token_example_abc123xyz";
    const encrypted = EncryptionService.encrypt(testSecret);
    const decrypted = EncryptionService.decrypt(encrypted);

    assert(
        !!(encrypted.includes(":") && decrypted === testSecret),
        "3. AES-256-GCM encryption & authenticated decryption roundtrip successful"
    );

    // 4. HMAC-SHA256 OAuth State Generation & Verification
    console.log("\n--- 4. HMAC-SHA256 OAuth State Signing & Validation ---");
    const testOrgId = "00000000-0000-0000-0000-000000000001";
    const testStaffId = "00000000-0000-0000-0000-000000000005";
    const state = EncryptionService.generateOAuthState({
        organizationId: testOrgId,
        staffId: testStaffId,
    });
    const verified = EncryptionService.verifyOAuthState(state);

    assert(
        !!(verified.organizationId === testOrgId && verified.staffId === testStaffId),
        "4. Tamper-proof OAuth state generated and cryptographically verified"
    );

    // 5. Google Auth URL Generation with Real Client ID
    console.log("\n--- 5. Google OAuth Authorization URL Construction ---");
    const adapter = new GoogleCalendarAdapter();
    const redirectUri = `${apiBase}/api/v1/integrations/google/callback`;
    const authUrl = adapter.getAuthUrl(state, redirectUri);

    console.log(`    Generated Google OAuth URL:\n    ${authUrl}\n`);

    const hasClientId = authUrl.includes(`client_id=${clientId}`);
    const hasRedirect = authUrl.includes(encodeURIComponent(redirectUri));
    const hasScope = authUrl.includes("calendar.events") && authUrl.includes("calendar.readonly");
    const hasOffline = authUrl.includes("access_type=offline") && authUrl.includes("prompt=consent");

    assert(
        !!(hasClientId && hasRedirect && hasScope && hasOffline),
        "5. Google OAuth URL properly configured with scopes, offline access, and consent prompt"
    );

    // 6. Database Schema & Connection Compatibility
    console.log("\n--- 6. PostgreSQL Database Connection & Phase P8 Models ---");
    const connectionCount = await prisma.googleCalendarConnection.count();
    const eventCount = await prisma.externalCalendarEvent.count();
    const conflictCount = await prisma.calendarSyncConflict.count();

    assert(
        typeof connectionCount === "number" && typeof eventCount === "number" && typeof conflictCount === "number",
        "6. PostgreSQL database connected and all Phase P8 models queryable"
    );

    console.log("\n================================================================================");
    console.log(`🎉 ALL ${passCount}/${totalCount} CONFIGURATION & CREDENTIAL TESTS PASSED!`);
    console.log("================================================================================\n");

    await prisma.$disconnect();
}

testGoogleConfiguration().catch(async (err) => {
    console.error("FATAL ERROR TESTING GOOGLE CONFIGURATION:", err);
    await prisma.$disconnect();
    process.exit(1);
});
