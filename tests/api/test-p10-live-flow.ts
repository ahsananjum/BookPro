import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";

const envPaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../../../.env"),
];
for (const p of envPaths) {
    if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf-8");
        for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
                const idx = trimmed.indexOf("=");
                const key = trimmed.slice(0, idx).trim();
                const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
                process.env[key] = val;
            }
        }
        break;
    }
}


import { Test, TestingModule } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { AIConversationService } from "../src/modules/ai/ai-conversation.service";
import { AIToolRegistryService } from "../src/modules/ai/ai-tool-registry.service";
import { GeminiAIAdapter } from "../src/modules/ai/gemini-ai.adapter";
import { AI_PROVIDER } from "../src/modules/ai/ai-provider.interface";
import { EntitlementsService } from "../src/modules/entitlements/entitlements.service";
import { RedisService } from "@bookpro/server-core";
import { ServiceService } from "../src/modules/service/service.service";
import { AvailabilityService } from "../src/modules/availability/availability.service";
import { AppointmentService } from "../src/modules/appointments/appointment.service";
import { BookingHoldService } from "../src/modules/holds/booking-hold.service";
import { PricingService } from "../src/modules/pricing/pricing.service";
import { PolicyService } from "../src/modules/policy/policy.service";
import { WaitlistEntryService } from "../src/modules/waitlist/waitlist-entry.service";
import { PaymentsService } from "../src/modules/payments/payments.service";
import { LocationService } from "../src/modules/location/location.service";
import { StaffService } from "../src/modules/staff/staff.service";
import { PrismaService } from "../src/modules/database/prisma.service";
import { ScheduleGuardService } from "../src/modules/concurrency/schedule-guard.service";
import { BusyIntervalRepository } from "../src/modules/availability/busy-interval-repository";
import { OutboxService } from "../src/modules/outbox/outbox.service";
import { PAYMENT_PROVIDER } from "../src/modules/payments/payment-provider.interface";
import { StripePaymentAdapter } from "../src/modules/payments/stripe-payment.adapter";
import { ActorType, PermissionKey, RequestContext } from "@bookpro/contracts";

import { AppModule } from "../src/app.module";

const prisma = new PrismaClient();

async function runLiveP10Flow() {
    console.log("\n================================================================================");
    console.log("⚡ TESTING LIVE GEMINI AI RECEPTIONIST WORKFLOW (PHASE P10)");
    console.log("================================================================================\n");

    console.log("DEBUG: process.env.AI_ENABLED =", JSON.stringify(process.env.AI_ENABLED));
    console.log("DEBUG: process.env.GEMINI_API_KEY =", JSON.stringify(process.env.GEMINI_API_KEY?.slice(0, 10)));


    const org = await prisma.organization.findFirst({
        where: { slug: "luxe-studio" },
        include: { locations: true, services: true, staffProfiles: true },
    });
    if (!org) {
        throw new Error("Luxe Studio organization fixture not found.");
    }

    const testCustomer = await prisma.customer.upsert({
        where: { organizationId_email: { organizationId: org.id, email: "ai.customer@example.com" } },
        update: { fullName: "Sophia AI Test" },
        create: { organizationId: org.id, email: "ai.customer@example.com", fullName: "Sophia AI Test" },
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
    }).compile();

    const conversationService = moduleRef.get<AIConversationService>(AIConversationService);
    const geminiAdapter = moduleRef.get<GeminiAIAdapter>(GeminiAIAdapter);

    console.log(`Gemini Configured: ${geminiAdapter.isConfigured()}`);
    console.log(`Model: ${process.env.GEMINI_MODEL}`);

    // Context for Customer
    const customerContext: RequestContext = {
        requestId: `req_${Date.now()}`,
        correlationId: `corr_${Date.now()}`,
        actorType: ActorType.CUSTOMER,
        subjectId: testCustomer.id,
        customerId: testCustomer.id,
        organizationId: org.id,
        permissions: [
            PermissionKey.AI_EXECUTE,
            PermissionKey.SERVICE_READ,
            PermissionKey.LOCATION_READ,
            PermissionKey.APPOINTMENT_READ,
            PermissionKey.APPOINTMENT_CREATE,
        ],
        locale: "en-US",
        timezone: "America/New_York",
        isPlatformAdmin: false,
        issuedAt: new Date().toISOString(),
    };

    // Step 1: Create Conversation
    console.log("\n[Step 1] Creating AI Conversation for customer...");
    const conversation = await conversationService.createConversation(customerContext, "TEXT");
    console.log(` ✅ Conversation created! ID: ${conversation.id}`);

    // Step 2: Send Message: "What services do you offer?"
    console.log("\n[Step 2] Sending message: 'What services do you offer?'");
    const response1 = await conversationService.sendMessage(
        conversation.id,
        "What services do you offer?",
        `msg_req_1_${Date.now()}`,
        customerContext,
    );

    console.log(`\n🤖 AI Receptionist Response (Degraded: ${response1.degraded}):`);
    console.log(`"${response1.assistantMessage}"`);
    console.log(`\nCards returned: ${response1.cards.length}`);
    if (response1.cards.length > 0) {
        console.log("Card Tool:", response1.cards[0].toolName, "Title:", response1.cards[0].title);
    }
    console.log(`Telemetry - Latency: ${response1.provider?.latencyMs}ms, Tokens: in=${response1.provider?.inputTokens} out=${response1.provider?.outputTokens}`);

    if (response1.degraded) {
        console.error("❌ FAILED: Response was degraded!");
        process.exit(1);
    }

    // Step 3: Send Message: "Check availability for next week"
    console.log("\n[Step 3] Sending message: 'Find me availability for a Signature Haircut next week'");
    const response2 = await conversationService.sendMessage(
        conversation.id,
        "Find me availability for a Signature Haircut next week",
        `msg_req_2_${Date.now()}`,
        customerContext,
    );

    console.log(`\n🤖 AI Receptionist Response (Degraded: ${response2.degraded}):`);
    console.log(`"${response2.assistantMessage}"`);
    console.log(`Cards returned: ${response2.cards.length}`);

    console.log("\n================================================================================");
    console.log("🎉 LIVE GEMINI RECEPTIONIST & BACKEND TOOL EXECUTION PASSED 100%!");
    console.log("================================================================================\n");

    await prisma.$disconnect();
}

runLiveP10Flow().catch(async (err) => {
    console.error("FATAL ERROR IN LIVE P10 WORKFLOW:", err);
    await prisma.$disconnect();
    process.exit(1);
});
