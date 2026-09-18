import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { PaymentsService } from "../src/modules/payments/payments.service";
import { StripePaymentAdapter } from "../src/modules/payments/stripe-payment.adapter";
import { TestPaymentAdapter } from "../src/modules/payments/test-payment.adapter";
import { PAYMENT_PROVIDER } from "../src/modules/payments/payment-provider.interface";
import { PrismaService } from "../src/modules/database/prisma.service";
import { OutboxService } from "../src/modules/outbox/outbox.service";
import { ScheduleGuardService } from "../concurrency/schedule-guard.service";
import { AuthoritativeAvailabilityValidatorService } from "../src/modules/availability/authoritative-availability-validator.service";
import { validateEnv } from "@bookpro/validation";
import { PaymentRecordStatus, WebhookStatus, IncidentType } from "@prisma/client";
import * as crypto from "crypto";

const StripeSDK = require("stripe");

describe("Stripe Fail-Closed Configuration & Strict Webhook Verification", () => {
    const testSecretKey = "sk_test_mock_dummy_secret_key_for_testing_purposes_only_12345";
    const testWebhookSecret = "whsec_test_secret_for_cryptographic_verification_key_12345";
    const realStripe = new StripeSDK(testSecretKey);

    const testOrgId = "00000000-0000-0000-0000-000000000001";
    const testHoldId = "00000000-0000-0000-0000-000000000002";
    const testPaymentRecordId = "00000000-0000-0000-0000-000000000003";
    const testAppointmentId = "00000000-0000-0000-0000-000000000004";
    const testCustomerId = "00000000-0000-0000-0000-000000000005";

    // -------------------------------------------------------------------------
    // Scenario 1: Strict Environment Configuration & Startup Refusal
    // -------------------------------------------------------------------------
    describe("Scenario 1: Strict Configuration Validation & Startup Rejection", () => {
        const baseEnv = {
            NODE_ENV: "test",
            PORT: "4000",
            WORKER_PORT: "4001",
            WEB_PORT: "3000",
            DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
            REDIS_URL: "redis://localhost:6379",
            JWT_SECRET: "12345678901234567890123456789012",
            COOKIE_SECRET: "12345678901234567890123456789012",
        };

        it("should refuse startup when STRIPE_MODE=test but STRIPE_WEBHOOK_SECRET is missing", () => {
            expect(() => {
                validateEnv({
                    ...baseEnv,
                    STRIPE_MODE: "test",
                    STRIPE_SECRET_KEY: testSecretKey,
                });
            }).toThrow(/STRIPE_WEBHOOK_SECRET is required/);
        });

        it("should refuse startup when STRIPE_MODE=test but STRIPE_SECRET_KEY is missing", () => {
            expect(() => {
                validateEnv({
                    ...baseEnv,
                    STRIPE_MODE: "test",
                    STRIPE_WEBHOOK_SECRET: testWebhookSecret,
                });
            }).toThrow(/STRIPE_SECRET_KEY is required/);
        });

        it("should refuse startup when STRIPE_MODE=live but test keys are provided", () => {
            expect(() => {
                validateEnv({
                    ...baseEnv,
                    STRIPE_MODE: "live",
                    STRIPE_SECRET_KEY: "sk_test_invalid_for_live_mode",
                    STRIPE_WEBHOOK_SECRET: testWebhookSecret,
                });
            }).toThrow(/must start with 'sk_live_'/);
        });

        it("should succeed when STRIPE_MODE=disabled without requiring any secret keys", () => {
            const config = validateEnv({
                ...baseEnv,
                STRIPE_MODE: "disabled",
            });
            expect(config.STRIPE_MODE).toBe("disabled");
        });

        it("should succeed when STRIPE_MODE=test with valid sk_test_ and whsec_ secrets", () => {
            const config = validateEnv({
                ...baseEnv,
                STRIPE_MODE: "test",
                STRIPE_SECRET_KEY: testSecretKey,
                STRIPE_WEBHOOK_SECRET: testWebhookSecret,
            });
            expect(config.STRIPE_MODE).toBe("test");
            expect(config.STRIPE_SECRET_KEY).toBe(testSecretKey);
            expect(config.STRIPE_WEBHOOK_SECRET).toBe(testWebhookSecret);
        });
    });

    // -------------------------------------------------------------------------
    // Scenario 2, 3, 4, 8: Cryptographic Signature Verification via Real Stripe SDK
    // -------------------------------------------------------------------------
    describe("Scenarios 2, 3, 4, 8: Cryptographic Webhook Verification with StripePaymentAdapter", () => {
        let adapter: StripePaymentAdapter;

        beforeAll(() => {
            process.env.STRIPE_MODE = "test";
            process.env.STRIPE_SECRET_KEY = testSecretKey;
            process.env.STRIPE_WEBHOOK_SECRET = testWebhookSecret;
            adapter = new StripePaymentAdapter();
        });

        afterAll(() => {
            delete process.env.STRIPE_MODE;
            delete process.env.STRIPE_SECRET_KEY;
            delete process.env.STRIPE_WEBHOOK_SECRET;
        });

        it("Scenario 2: should reject webhook when stripe-signature header is missing", async () => {
            const rawBody = JSON.stringify({ id: "evt_123", type: "payment_intent.succeeded" });
            await expect(adapter.verifyWebhook(rawBody, "")).rejects.toThrow(BadRequestException);
        });

        it("Scenario 3: should reject forged / tampered webhook signature with 401 Unauthorized", async () => {
            const rawBody = JSON.stringify({ id: "evt_forged_1", type: "payment_intent.succeeded" });
            const fakeSig = "t=1700000000,v1=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb";
            await expect(adapter.verifyWebhook(rawBody, fakeSig)).rejects.toThrow(UnauthorizedException);
        });

        it("Scenario 4: should verify genuine Stripe HMAC-SHA256 signature and return structured event", async () => {
            const eventPayload = {
                id: "evt_genuine_1",
                object: "event",
                type: "payment_intent.succeeded",
                livemode: false,
                data: {
                    object: {
                        id: "pi_real_12345",
                        amount: 5000,
                        currency: "usd",
                        status: "succeeded",
                        metadata: { organizationId: testOrgId },
                    },
                },
            };
            const rawBody = JSON.stringify(eventPayload);
            const signature = realStripe.webhooks.generateTestHeaderString({
                payload: rawBody,
                secret: testWebhookSecret,
            });

            const verified = await adapter.verifyWebhook(rawBody, signature);
            expect(verified.eventId).toBe("evt_genuine_1");
            expect(verified.eventType).toBe("payment_intent.succeeded");
            expect(verified.providerPaymentId).toBe("pi_real_12345");
            expect(verified.amountCents).toBe(5000);
            expect(verified.currency).toBe("USD");
            expect(verified.livemode).toBe(false);
            expect(verified.metadata?.organizationId).toBe(testOrgId);
        });

        it("Scenario 8: should reject replayed / expired webhook timestamp (> 300s old)", async () => {
            const eventPayload = {
                id: "evt_replayed_1",
                type: "payment_intent.succeeded",
                data: { object: { id: "pi_replay" } },
            };
            const rawBody = JSON.stringify(eventPayload);
            // Timestamp 10 minutes ago
            const expiredTimestamp = Math.floor(Date.now() / 1000) - 600;
            const expiredSignature = realStripe.webhooks.generateTestHeaderString({
                payload: rawBody,
                secret: testWebhookSecret,
                timestamp: expiredTimestamp,
            });

            await expect(adapter.verifyWebhook(rawBody, expiredSignature)).rejects.toThrow(UnauthorizedException);
        });
    });

    // -------------------------------------------------------------------------
    // Scenarios 5, 6, 7, 9, 10, 11, 12: Business & Security Processing Matrix
    // -------------------------------------------------------------------------
    describe("Scenarios 5, 6, 7, 9, 10, 11, 12: PaymentsService Ingestion & State Machine Matrix", () => {
        let paymentsService: PaymentsService;
        let testAdapter: TestPaymentAdapter;
        let inMemoryInbox: Map<string, any>;
        let inMemoryPayments: Map<string, any>;
        let inMemoryHolds: Map<string, any>;
        let inMemoryAppointments: Map<string, any>;
        let inMemoryIncidents: any[];
        let outboxEvents: any[];

        beforeEach(() => {
            process.env.STRIPE_MODE = "test";
            process.env.STRIPE_SECRET_KEY = testSecretKey;
            process.env.STRIPE_WEBHOOK_SECRET = testWebhookSecret;

            testAdapter = new TestPaymentAdapter();
            inMemoryInbox = new Map();
            inMemoryPayments = new Map();
            inMemoryHolds = new Map();
            inMemoryAppointments = new Map();
            inMemoryIncidents = [];
            outboxEvents = [];

            // Seed default active payment record
            inMemoryPayments.set("pi_target_123", {
                id: testPaymentRecordId,
                organizationId: testOrgId,
                providerPaymentId: "pi_target_123",
                amountCents: 5000,
                currency: "USD",
                status: PaymentRecordStatus.PENDING,
                bookingHoldId: testHoldId,
                appointmentId: null,
                organization: { id: testOrgId, stripeAccountId: "acct_valid_123" },
                bookingHold: {
                    id: testHoldId,
                    organizationId: testOrgId,
                    status: "ACTIVE",
                    expiresAt: new Date(Date.now() + 600000), // Active 10 mins
                    customerId: testCustomerId,
                    serviceId: "svc_1",
                    locationId: "loc_1",
                    staffId: "stf_1",
                    startAt: new Date(),
                    endAt: new Date(Date.now() + 3600000),
                    partySize: 1,
                },
            });

            const mockPrisma: any = {
                webhookInbox: {
                    findUnique: async ({ where }: any) => inMemoryInbox.get(where.eventId) || null,
                    create: async ({ data }: any) => {
                        const rec = { id: `inbox_${Date.now()}`, ...data };
                        inMemoryInbox.set(data.eventId, rec);
                        return rec;
                    },
                    update: async ({ where, data }: any) => {
                        for (const [k, v] of inMemoryInbox.entries()) {
                            if (v.id === where.id) {
                                const updated = { ...v, ...data };
                                inMemoryInbox.set(k, updated);
                                return updated;
                            }
                        }
                    },
                },
                paymentRecord: {
                    findFirst: async ({ where }: any) => {
                        if (where.providerPaymentId) return inMemoryPayments.get(where.providerPaymentId) || null;
                        if (where.id) {
                            for (const p of inMemoryPayments.values()) {
                                if (p.id === where.id) return p;
                            }
                        }
                        return null;
                    },
                    update: async ({ where, data }: any) => {
                        for (const [k, v] of inMemoryPayments.entries()) {
                            if (v.id === where.id) {
                                const updated = { ...v, ...data };
                                inMemoryPayments.set(k, updated);
                                return updated;
                            }
                        }
                    },
                    updateMany: async ({ where, data }: any) => {
                        if (where.providerPaymentId && inMemoryPayments.has(where.providerPaymentId)) {
                            const p = inMemoryPayments.get(where.providerPaymentId);
                            inMemoryPayments.set(where.providerPaymentId, { ...p, ...data });
                        }
                    },
                },
                bookingHold: {
                    findFirst: async ({ where }: any) => inMemoryHolds.get(where.id) || null,
                    updateMany: async ({ where, data }: any) => {
                        const p = inMemoryPayments.get("pi_target_123");
                        if (p && p.bookingHold) {
                            p.bookingHold.status = data.status;
                            return { count: 1 };
                        }
                        return { count: 0 };
                    },
                    update: async ({ where, data }: any) => {
                        const p = inMemoryPayments.get("pi_target_123");
                        if (p && p.bookingHold) {
                            p.bookingHold.status = data.status;
                            return p.bookingHold;
                        }
                    },
                },
                customer: {
                    findFirst: async () => ({ id: testCustomerId }),
                },
                appointment: {
                    create: async ({ data }: any) => {
                        const appt = { id: testAppointmentId, ...data };
                        inMemoryAppointments.set(appt.id, appt);
                        return appt;
                    },
                    update: async ({ where, data }: any) => {
                        const appt = inMemoryAppointments.get(where.id);
                        if (appt) Object.assign(appt, data);
                        return appt;
                    },
                },
                reconciliationIncident: {
                    create: async ({ data }: any) => {
                        const inc = { id: `inc_${Date.now()}`, ...data };
                        inMemoryIncidents.push(inc);
                        return inc;
                    },
                },
                $transaction: async (fn: any) => fn(mockPrisma),
            };

            const mockOutbox: any = {
                emitInTx: async (_tx: any, event: any) => {
                    outboxEvents.push(event);
                },
            };

            const mockScheduleGuard: any = {
                buildGuardKeys: () => ["GUARD_KEY"],
                acquireGuardsInTx: async () => { },
            };

            const mockAuthoritativeValidator: any = {
                validateAndReserveSlot: async (input: any) => ({
                    appointment: {
                        id: `appt_recovered_${Date.now()}`,
                        organizationId: input.organizationId,
                        status: "CONFIRMED",
                        paymentStatus: "PAID",
                    },
                }),
            };

            const mockIdempotencyService: any = {
                executeIdempotent: jest.fn(async (_opts: any, fn: any) => ({ statusCode: 200, data: await fn(), fromCache: false })),
                checkIdempotency: jest.fn().mockResolvedValue({ isDuplicate: false }),
                saveIdempotencyRecord: jest.fn().mockResolvedValue(undefined),
            };

            paymentsService = new PaymentsService(
                mockPrisma,
                mockOutbox,
                mockScheduleGuard,
                mockAuthoritativeValidator,
                mockIdempotencyService,
                testAdapter
            );
        });

        afterEach(() => {
            delete process.env.STRIPE_MODE;
            delete process.env.STRIPE_SECRET_KEY;
            delete process.env.STRIPE_WEBHOOK_SECRET;
        });

        it("Scenario 5: should reject webhook when Stripe Connect account mismatches organization", async () => {
            const rawPayload = {
                id: "evt_wrong_acct_1",
                type: "payment_intent.succeeded",
                livemode: false,
                account: "acct_attacker_999", // Mismatch with acct_valid_123
                data: {
                    object: {
                        id: "pi_target_123",
                        amount: 5000,
                        currency: "usd",
                        status: "succeeded",
                        metadata: { organizationId: testOrgId },
                    },
                },
            };

            await expect(
                paymentsService.processWebhook({
                    eventId: rawPayload.id,
                    eventType: rawPayload.type,
                    signature: "valid_sig",
                    rawBody: JSON.stringify(rawPayload),
                    payload: rawPayload,
                })
            ).rejects.toThrow(BadRequestException);

            expect(inMemoryIncidents.length).toBe(1);
            expect(inMemoryIncidents[0].payload.issue).toContain("Stripe Connect account mismatch");
        });

        it("Scenario 6: should reject webhook when livemode does not match STRIPE_MODE", async () => {
            // STRIPE_MODE is 'test', but event says livemode: true
            const rawPayload = {
                id: "evt_wrong_livemode_1",
                type: "payment_intent.succeeded",
                livemode: true, // Live event in test mode
                data: {
                    object: {
                        id: "pi_target_123",
                        amount: 5000,
                        currency: "usd",
                        status: "succeeded",
                    },
                },
            };

            await expect(
                paymentsService.processWebhook({
                    eventId: rawPayload.id,
                    eventType: rawPayload.type,
                    signature: "valid_sig",
                    rawBody: JSON.stringify(rawPayload),
                    payload: rawPayload,
                })
            ).rejects.toThrow(/Webhook livemode mismatch/);
        });

        it("Scenario 7: should flag reconciliation incident on amount mismatch without confirming booking", async () => {
            const rawPayload = {
                id: "evt_amount_mismatch_1",
                type: "payment_intent.succeeded",
                livemode: false,
                data: {
                    object: {
                        id: "pi_target_123",
                        amount: 1000, // $10.00 instead of expected $50.00
                        currency: "usd",
                        status: "succeeded",
                        metadata: { organizationId: testOrgId },
                    },
                },
            };

            await expect(
                paymentsService.processWebhook({
                    eventId: rawPayload.id,
                    eventType: rawPayload.type,
                    signature: "valid_sig",
                    rawBody: JSON.stringify(rawPayload),
                    payload: rawPayload,
                })
            ).rejects.toThrow(/Amount mismatch/);

            const payment = inMemoryPayments.get("pi_target_123");
            expect(payment.status).toBe(PaymentRecordStatus.REQUIRES_RECONCILIATION);
            expect(inMemoryIncidents.length).toBe(1);
            expect(inMemoryIncidents[0].incidentType).toBe(IncidentType.UNFINALIZED_PAYMENT);
            expect(inMemoryAppointments.size).toBe(0); // No appointment created!
        });

        it("Scenario 9: should process duplicate webhook deliveries idempotently with 0 repeat effects", async () => {
            const rawPayload = {
                id: "evt_dup_12345",
                type: "payment_intent.succeeded",
                livemode: false,
                data: {
                    object: {
                        id: "pi_target_123",
                        amount: 5000,
                        currency: "usd",
                        status: "succeeded",
                        metadata: { organizationId: testOrgId },
                    },
                },
            };

            const firstPass = await paymentsService.processWebhook({
                eventId: rawPayload.id,
                eventType: rawPayload.type,
                signature: "valid_sig",
                rawBody: JSON.stringify(rawPayload),
                payload: rawPayload,
            });
            expect(firstPass.received).toBe(true);
            expect(firstPass.duplicate).toBe(false);
            expect(outboxEvents.length).toBe(1);

            const secondPass = await paymentsService.processWebhook({
                eventId: rawPayload.id,
                eventType: rawPayload.type,
                signature: "valid_sig",
                rawBody: JSON.stringify(rawPayload),
                payload: rawPayload,
            });
            expect(secondPass.received).toBe(true);
            expect(secondPass.duplicate).toBe(true);
            expect(outboxEvents.length).toBe(1); // No second outbox event!
        });

        it("Scenario 10: should handle out-of-order events monotonically without corrupting confirmed booking", async () => {
            // Step 1: Payment succeeded
            const successPayload = {
                id: "evt_success_first",
                type: "payment_intent.succeeded",
                livemode: false,
                data: {
                    object: {
                        id: "pi_target_123",
                        amount: 5000,
                        currency: "usd",
                        status: "succeeded",
                        metadata: { organizationId: testOrgId },
                    },
                },
            };
            await paymentsService.processWebhook({
                eventId: successPayload.id,
                eventType: successPayload.type,
                signature: "valid_sig",
                rawBody: JSON.stringify(successPayload),
                payload: successPayload,
            });

            const payment = inMemoryPayments.get("pi_target_123");
            expect(payment.status).toBe(PaymentRecordStatus.SUCCEEDED);

            // Step 2: Late payment_failed arrives after success
            const lateFailPayload = {
                id: "evt_late_failure",
                type: "payment_intent.payment_failed",
                livemode: false,
                data: {
                    object: {
                        id: "pi_target_123",
                        status: "failed",
                    },
                },
            };
            await paymentsService.processWebhook({
                eventId: lateFailPayload.id,
                eventType: lateFailPayload.type,
                signature: "valid_sig",
                rawBody: JSON.stringify(lateFailPayload),
                payload: lateFailPayload,
            });

            // Payment record must remain SUCCEEDED
            expect(payment.status).toBe(PaymentRecordStatus.SUCCEEDED);
            expect(inMemoryIncidents.length).toBe(1); // Flagged for anomaly investigation
        });

        it("Scenario 11: should reconcile remote Stripe state before recovering ambiguous expired-hold failure", async () => {
            // Set hold as expired
            const payment = inMemoryPayments.get("pi_target_123");
            payment.bookingHold.expiresAt = new Date(Date.now() - 10000); // Expired

            // Set remote Stripe state as succeeded
            testAdapter.setPaymentState("pi_target_123", {
                providerPaymentId: "pi_target_123",
                amountCents: 5000,
                currency: "USD",
                status: "succeeded",
                metadata: { organizationId: testOrgId },
            });

            const rawPayload = {
                id: "evt_expired_hold_recovery",
                type: "payment_intent.succeeded",
                livemode: false,
                data: {
                    object: {
                        id: "pi_target_123",
                        amount: 5000,
                        currency: "usd",
                        status: "succeeded",
                        metadata: { organizationId: testOrgId },
                    },
                },
            };

            const res = await paymentsService.processWebhook({
                eventId: rawPayload.id,
                eventType: rawPayload.type,
                signature: "valid_sig",
                rawBody: JSON.stringify(rawPayload),
                payload: rawPayload,
            });

            expect(res.received).toBe(true);
            expect(payment.status).toBe(PaymentRecordStatus.SUCCEEDED);
        });

        it("Scenario 12: should mark webhook inbox FAILED when database transaction fails", async () => {
            // Force error during transaction
            const rawPayload = {
                id: "evt_tx_failure",
                type: "payment_intent.succeeded",
                livemode: false,
                data: {
                    object: {
                        id: "pi_target_123",
                        amount: 5000,
                        currency: "usd",
                        status: "succeeded",
                        metadata: { organizationId: "WRONG_TENANT_ID" },
                    },
                },
            };

            await expect(
                paymentsService.processWebhook({
                    eventId: rawPayload.id,
                    eventType: rawPayload.type,
                    signature: "valid_sig",
                    rawBody: JSON.stringify(rawPayload),
                    payload: rawPayload,
                })
            ).rejects.toThrow();

            const inbox = inMemoryInbox.get("evt_tx_failure");
            expect(inbox).toBeDefined();
            expect(inbox.status).toBe(WebhookStatus.FAILED);
        });
    });
});
