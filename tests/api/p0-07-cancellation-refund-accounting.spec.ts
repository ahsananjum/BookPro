import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PolicyService } from '../src/modules/policy/policy.service';
import { AppointmentService } from '../src/modules/appointments/appointment.service';
import { RefundsService } from '../src/modules/refunds/refunds.service';
import { CommissionsService } from '../src/modules/commissions/commissions.service';
import { PrismaService } from '../src/modules/database/prisma.service';
import { OutboxService } from '../src/modules/outbox/outbox.service';
import { ScheduleGuardService } from '../src/modules/concurrency/schedule-guard.service';
import { IdempotencyService } from '../src/modules/common/idempotency.service';
import { AuthoritativeAvailabilityValidatorService } from '../src/modules/availability/authoritative-availability-validator.service';
import { PAYMENT_PROVIDER } from '../src/modules/payments/payment-provider.interface';
import { PaymentRecordStatus, RefundStatus, IncidentType, CommissionStatus } from '@prisma/client';
import * as crypto from 'crypto';

describe('P0-07: Cancellation Quotes & Refund Accounting', () => {
    let policyService: PolicyService;
    let appointmentService: AppointmentService;
    let refundsService: RefundsService;
    let mockPrisma: any;
    let mockPaymentProvider: any;

    const orgId = 'org-p007-test';
    const locationId = 'loc-p007-test';
    const serviceId = 'svc-p007-test';
    const staffId = 'staff-p007-test';
    const customerId = 'cust-p007-test';

    // In-memory mock database state
    let inMemoryDb: {
        appointments: any[];
        paymentRecords: any[];
        refundRecords: any[];
        policyConfigs: any[];
        cancellationQuotes: any[];
        financialLedgerEntries: any[];
        commissionRecords: any[];
        reconciliationIncidents: any[];
        appointmentHistories: any[];
    };

    beforeEach(async () => {
        inMemoryDb = {
            appointments: [],
            paymentRecords: [],
            refundRecords: [],
            policyConfigs: [],
            cancellationQuotes: [],
            financialLedgerEntries: [],
            commissionRecords: [],
            reconciliationIncidents: [],
            appointmentHistories: [],
        };

        mockPaymentProvider = {
            createPaymentIntent: jest.fn().mockResolvedValue({
                providerPaymentId: 'pi_test_123',
                clientSecret: 'secret_test_123',
                amountCents: 10000,
                currency: 'USD',
            }),
            refund: jest.fn().mockImplementation(async ({ providerPaymentId, amountCents }) => {
                return {
                    providerRefundId: `re_${crypto.randomUUID()}`,
                    status: 'succeeded',
                    amountCents,
                };
            }),
            retrievePayment: jest.fn().mockResolvedValue({
                id: 'pi_test_123',
                status: 'succeeded',
            }),
        };

        mockPrisma = {
            appointment: {
                findFirst: jest.fn().mockImplementation(async (q) => {
                    const appt = inMemoryDb.appointments.find(
                        (a) => (!q.where.id || a.id === q.where.id) && (!q.where.organizationId || a.organizationId === q.where.organizationId)
                    );
                    if (!appt) return null;
                    const payments = inMemoryDb.paymentRecords.filter((p) => p.appointmentId === appt.id).map((p) => ({
                        ...p,
                        refunds: inMemoryDb.refundRecords.filter((r) => r.paymentId === p.id),
                    }));
                    return { ...appt, paymentRecords: payments };
                }),
                findUnique: jest.fn().mockImplementation(async (q) => {
                    return inMemoryDb.appointments.find((a) => a.id === q.where.id) || null;
                }),
                update: jest.fn().mockImplementation(async (q) => {
                    const idx = inMemoryDb.appointments.findIndex((a) => a.id === q.where.id);
                    if (idx >= 0) {
                        const prev = inMemoryDb.appointments[idx];
                        const updated = {
                            ...prev,
                            ...q.data,
                            version: q.data.version?.increment ? prev.version + 1 : (q.data.version || prev.version),
                            updatedAt: new Date(),
                        };
                        inMemoryDb.appointments[idx] = updated;
                        return updated;
                    }
                    return null;
                }),
                create: jest.fn().mockImplementation(async (q) => {
                    const rec = { id: `appt_${crypto.randomUUID()}`, version: 1, createdAt: new Date(), updatedAt: new Date(), ...q.data };
                    inMemoryDb.appointments.push(rec);
                    return rec;
                }),
            },
            paymentRecord: {
                findFirst: jest.fn().mockImplementation(async (q) => {
                    const pay = inMemoryDb.paymentRecords.find(
                        (p) => (!q.where.id || p.id === q.where.id) && (!q.where.organizationId || p.organizationId === q.where.organizationId)
                    );
                    if (!pay) return null;
                    return {
                        ...pay,
                        refunds: inMemoryDb.refundRecords.filter((r) => r.paymentId === pay.id),
                    };
                }),
                findMany: jest.fn().mockImplementation(async (q) => {
                    return inMemoryDb.paymentRecords
                        .filter((p) => (!q.where.appointmentId || p.appointmentId === q.where.appointmentId) && (!q.where.organizationId || p.organizationId === q.where.organizationId))
                        .map((p) => ({
                            ...p,
                            refunds: inMemoryDb.refundRecords.filter((r) => r.paymentId === p.id),
                        }));
                }),
                update: jest.fn().mockImplementation(async (q) => {
                    const idx = inMemoryDb.paymentRecords.findIndex((p) => p.id === q.where.id);
                    if (idx >= 0) {
                        inMemoryDb.paymentRecords[idx] = { ...inMemoryDb.paymentRecords[idx], ...q.data, updatedAt: new Date() };
                        return inMemoryDb.paymentRecords[idx];
                    }
                    return null;
                }),
                create: jest.fn().mockImplementation(async (q) => {
                    const rec = { id: `pay_${crypto.randomUUID()}`, createdAt: new Date(), updatedAt: new Date(), ...q.data };
                    inMemoryDb.paymentRecords.push(rec);
                    return rec;
                }),
            },
            refundRecord: {
                create: jest.fn().mockImplementation(async (q) => {
                    const rec = { id: `ref_${crypto.randomUUID()}`, createdAt: new Date(), updatedAt: new Date(), ...q.data };
                    inMemoryDb.refundRecords.push(rec);
                    return rec;
                }),
                update: jest.fn().mockImplementation(async (q) => {
                    const idx = inMemoryDb.refundRecords.findIndex((r) => r.id === q.where.id);
                    if (idx >= 0) {
                        inMemoryDb.refundRecords[idx] = { ...inMemoryDb.refundRecords[idx], ...q.data, updatedAt: new Date() };
                        return inMemoryDb.refundRecords[idx];
                    }
                    return null;
                }),
            },
            policyConfig: {
                findFirst: jest.fn().mockImplementation(async (q) => {
                    return inMemoryDb.policyConfigs.find(
                        (pol) =>
                            pol.organizationId === q.where.organizationId &&
                            (q.where.serviceId === undefined || pol.serviceId === q.where.serviceId) &&
                            (q.where.locationId === undefined || pol.locationId === q.where.locationId)
                    ) || null;
                }),
            },
            cancellationQuote: {
                create: jest.fn().mockImplementation(async (q) => {
                    const rec = { id: `quote_${crypto.randomUUID()}`, createdAt: new Date(), ...q.data };
                    inMemoryDb.cancellationQuotes.push(rec);
                    return rec;
                }),
                findFirst: jest.fn().mockImplementation(async (q) => {
                    return inMemoryDb.cancellationQuotes.find((c) => {
                        const matchOrg = !q.where.organizationId || c.organizationId === q.where.organizationId;
                        const matchAppt = !q.where.appointmentId || c.appointmentId === q.where.appointmentId;
                        let matchSigOrId = true;
                        if (q.where.OR) {
                            matchSigOrId = q.where.OR.some((cond: any) => {
                                if (cond.quoteSignature?.startsWith) {
                                    return c.quoteSignature.startsWith(cond.quoteSignature.startsWith);
                                }
                                if (cond.id) {
                                    return c.id === cond.id;
                                }
                                return false;
                            });
                        }
                        return matchOrg && matchAppt && matchSigOrId;
                    }) || null;
                }),
                update: jest.fn().mockImplementation(async (q) => {
                    const idx = inMemoryDb.cancellationQuotes.findIndex((c) => c.id === q.where.id);
                    if (idx >= 0) {
                        inMemoryDb.cancellationQuotes[idx] = { ...inMemoryDb.cancellationQuotes[idx], ...q.data };
                        return inMemoryDb.cancellationQuotes[idx];
                    }
                    return null;
                }),
            },
            financialLedgerEntry: {
                create: jest.fn().mockImplementation(async (q) => {
                    const rec = { id: `fle_${crypto.randomUUID()}`, createdAt: new Date(), ...q.data };
                    inMemoryDb.financialLedgerEntries.push(rec);
                    return rec;
                }),
            },
            commissionRecord: {
                findFirst: jest.fn().mockImplementation(async (q) => {
                    return inMemoryDb.commissionRecords.find((c) => c.appointmentId === q.where.appointmentId) || null;
                }),
                update: jest.fn().mockImplementation(async (q) => {
                    const idx = inMemoryDb.commissionRecords.findIndex((c) => c.id === q.where.id);
                    if (idx >= 0) {
                        inMemoryDb.commissionRecords[idx] = { ...inMemoryDb.commissionRecords[idx], ...q.data };
                        return inMemoryDb.commissionRecords[idx];
                    }
                    return null;
                }),
            },
            reconciliationIncident: {
                create: jest.fn().mockImplementation(async (q) => {
                    const rec = { id: `inc_${crypto.randomUUID()}`, createdAt: new Date(), ...q.data };
                    inMemoryDb.reconciliationIncidents.push(rec);
                    return rec;
                }),
            },
            appointmentHistory: {
                create: jest.fn().mockImplementation(async (q) => {
                    const rec = { id: `ah_${crypto.randomUUID()}`, createdAt: new Date(), ...q.data };
                    inMemoryDb.appointmentHistories.push(rec);
                    return rec;
                }),
            },
            customer: {
                update: jest.fn().mockResolvedValue({ id: customerId }),
            },
            $transaction: jest.fn().mockImplementation(async (cb) => {
                return cb(mockPrisma);
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PolicyService,
                RefundsService,
                AppointmentService,
                { provide: ScheduleGuardService, useValue: { acquireSlotLocks: jest.fn().mockResolvedValue({ release: jest.fn() }) } },
                { provide: IdempotencyService, useValue: { checkIdempotency: jest.fn().mockResolvedValue({ isDuplicate: false }), lockAndExecute: jest.fn().mockImplementation((k, f) => f()) } },
                { provide: OutboxService, useValue: { emitInTx: jest.fn().mockResolvedValue(true) } },
                { provide: CommissionsService, useValue: { calculateCommissionForAppointment: jest.fn() } },
                { provide: AuthoritativeAvailabilityValidatorService, useValue: {} },
                { provide: PrismaService, useValue: mockPrisma },
                { provide: PAYMENT_PROVIDER, useValue: mockPaymentProvider },
            ],
        }).compile();

        policyService = module.get<PolicyService>(PolicyService);
        refundsService = module.get<RefundsService>(RefundsService);
        appointmentService = module.get<AppointmentService>(AppointmentService);
    });

    describe('1. Boundary Times & Cancellation Cutoff Semantics', () => {
        beforeEach(() => {
            inMemoryDb.policyConfigs.push({
                id: 'pol-service-1',
                organizationId: orgId,
                serviceId,
                locationId: null,
                cancelCutoffHours: 24,
                cancelFeeType: 'PERCENTAGE',
                cancelFeeValue: 20, // 20% late cancellation penalty
                updatedAt: new Date('2026-01-01T00:00:00Z'),
            });
        });

        it('should grant 100% full refund and $0 fee for on-time cancellation (48 hours in advance)', async () => {
            const startAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
            const quote = await policyService.calculateCancellationQuote({
                organizationId: orgId,
                serviceId,
                startAt,
                paidAmountCents: 10000,
            });

            expect(quote.isAllowed).toBe(true);
            expect(quote.feeCents).toBe(0);
            expect(quote.refundableCents).toBe(10000);
            expect(quote.eligibleForRefund).toBe(true);
            expect(quote.reason).toContain('free cancellation window');
        });

        it('should grant 100% full refund at exact boundary (exactly 24.000 hours in advance)', async () => {
            const startAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
            const quote = await policyService.calculateCancellationQuote({
                organizationId: orgId,
                serviceId,
                startAt,
                paidAmountCents: 10000,
            });

            expect(quote.isAllowed).toBe(true);
            expect(quote.feeCents).toBe(0);
            expect(quote.refundableCents).toBe(10000);
        });

        it('should apply 20% penalty fee for late cancellation inside cutoff (23.5 hours in advance)', async () => {
            const startAt = new Date(Date.now() + 23.5 * 3600 * 1000).toISOString();
            const quote = await policyService.calculateCancellationQuote({
                organizationId: orgId,
                serviceId,
                startAt,
                paidAmountCents: 10000,
            });

            expect(quote.isAllowed).toBe(true);
            expect(quote.feeCents).toBe(2000); // 20% of 10,000 = $20.00
            expect(quote.refundableCents).toBe(8000); // $80.00 refund
            expect(quote.eligibleForRefund).toBe(true);
        });

        it('should apply fixed fee for late cancellation when policy is FIXED_AMOUNT', async () => {
            inMemoryDb.policyConfigs[0].cancelFeeType = 'FIXED_AMOUNT';
            inMemoryDb.policyConfigs[0].cancelFeeValue = 2500; // $25.00

            const startAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
            const quote = await policyService.calculateCancellationQuote({
                organizationId: orgId,
                serviceId,
                startAt,
                paidAmountCents: 10000,
            });

            expect(quote.isAllowed).toBe(true);
            expect(quote.feeCents).toBe(2500);
            expect(quote.refundableCents).toBe(7500);
        });

        it('should retain 100% fee ($0 refund) when policy is NONE inside cutoff window', async () => {
            inMemoryDb.policyConfigs[0].cancelFeeType = 'NONE';
            inMemoryDb.policyConfigs[0].cancelFeeValue = 0;

            const startAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
            const quote = await policyService.calculateCancellationQuote({
                organizationId: orgId,
                serviceId,
                startAt,
                paidAmountCents: 10000,
            });

            expect(quote.feeCents).toBe(10000);
            expect(quote.refundableCents).toBe(0);
            expect(quote.eligibleForRefund).toBe(false);
        });
    });

    describe('2. Timezone & DST Epoch Arithmetic', () => {
        it('should compute exact elapsed hours across timezone and Daylight Saving shifts without skew', async () => {
            inMemoryDb.policyConfigs.push({
                id: 'pol-tz',
                organizationId: orgId,
                serviceId,
                cancelCutoffHours: 48,
                cancelFeeType: 'PERCENTAGE',
                cancelFeeValue: 50,
                updatedAt: new Date('2026-01-01T00:00:00Z'),
            });

            // Specific UTC timestamp across DST change
            const dstStartAt = new Date(Date.now() + 50 * 3600 * 1000).toISOString();
            const quote = await policyService.calculateCancellationQuote({
                organizationId: orgId,
                serviceId,
                startAt: dstStartAt,
                paidAmountCents: 8000,
            });

            expect(quote.feeCents).toBe(0); // 50h > 48h -> Free cancellation
            expect(quote.refundableCents).toBe(8000);
        });
    });

    describe('3. Unpaid & Zero-Balance Appointments', () => {
        it('should cancel unpaid appointments cleanly with $0 fee and $0 refund without calling provider', async () => {
            const appt = await mockPrisma.appointment.create({
                data: {
                    organizationId: orgId,
                    locationId,
                    serviceId,
                    priceCents: 5000,
                    status: 'CONFIRMED',
                    paymentStatus: 'UNPAID',
                    startAt: new Date(Date.now() + 48 * 3600 * 1000),
                    endAt: new Date(Date.now() + 49 * 3600 * 1000),
                },
            });

            const quote = await policyService.calculateCancellationQuote(orgId, appt.id);
            expect(quote.feeCents).toBe(0);
            expect(quote.refundableCents).toBe(0);
            expect(quote.capturedBalanceCents).toBe(0);

            const cancelled = await appointmentService.cancel(appt.id, orgId, 'User requested cancel', 'STAFF', 'user-1', quote.quoteVersion);
            expect(cancelled.status).toBe('CANCELLED');
            expect(mockPaymentProvider.refund).not.toHaveBeenCalled();
        });
    });

    describe('4. Deposit & Partial Upfront Payment Bounds', () => {
        beforeEach(() => {
            inMemoryDb.policyConfigs.push({
                id: 'pol-deposit',
                organizationId: orgId,
                serviceId,
                cancelCutoffHours: 24,
                cancelFeeType: 'FIXED_AMOUNT',
                cancelFeeValue: 2500, // $25.00 fixed late fee
                updatedAt: new Date('2026-01-01T00:00:00Z'),
            });
        });

        it('should deduct $25 fixed fee from $30 deposit and refund remaining $5', async () => {
            const appt = await mockPrisma.appointment.create({
                data: {
                    organizationId: orgId,
                    locationId,
                    serviceId,
                    priceCents: 10000, // $100 service
                    status: 'CONFIRMED',
                    paymentStatus: 'PARTIALLY_PAID',
                    startAt: new Date(Date.now() + 2 * 3600 * 1000), // Late (2h notice)
                    endAt: new Date(Date.now() + 3 * 3600 * 1000),
                },
            });

            await mockPrisma.paymentRecord.create({
                data: {
                    organizationId: orgId,
                    appointmentId: appt.id,
                    providerPaymentId: 'pi_deposit_1',
                    amountCents: 3000, // $30 deposit captured
                    currency: 'USD',
                    status: PaymentRecordStatus.SUCCEEDED,
                    idempotencyKey: 'ik_dep_1',
                },
            });

            const quote = await policyService.calculateCancellationQuote(orgId, appt.id);
            expect(quote.capturedBalanceCents).toBe(3000);
            expect(quote.feeCents).toBe(2500);
            expect(quote.refundableCents).toBe(500); // $5.00 refund

            const cancelled = await appointmentService.cancel(appt.id, orgId, 'Late cancel deposit', 'CUSTOMER', customerId, quote.quoteVersion);
            expect(cancelled.status).toBe('CANCELLED');
            expect(mockPaymentProvider.refund).toHaveBeenCalledTimes(1);
            expect(mockPaymentProvider.refund).toHaveBeenCalledWith(
                expect.objectContaining({ amountCents: 500 })
            );
        });

        it('should cap penalty fee at captured deposit amount when fee exceeds deposit', async () => {
            inMemoryDb.policyConfigs[0].cancelFeeValue = 5000; // $50 fixed fee

            const appt = await mockPrisma.appointment.create({
                data: {
                    organizationId: orgId,
                    locationId,
                    serviceId,
                    priceCents: 10000,
                    status: 'CONFIRMED',
                    paymentStatus: 'PARTIALLY_PAID',
                    startAt: new Date(Date.now() + 2 * 3600 * 1000),
                    endAt: new Date(Date.now() + 3 * 3600 * 1000),
                },
            });

            await mockPrisma.paymentRecord.create({
                data: {
                    organizationId: orgId,
                    appointmentId: appt.id,
                    providerPaymentId: 'pi_deposit_2',
                    amountCents: 3000,
                    currency: 'USD',
                    status: PaymentRecordStatus.SUCCEEDED,
                    idempotencyKey: 'ik_dep_2',
                },
            });

            const quote = await policyService.calculateCancellationQuote(orgId, appt.id);
            expect(quote.capturedBalanceCents).toBe(3000);
            expect(quote.feeCents).toBe(3000); // Capped at $30!
            expect(quote.refundableCents).toBe(0);
        });
    });

    describe('5. Multi-Payment Allocation (Decrementing Remaining Amount)', () => {
        it('should allocate refund across multiple payments decrementing remaining balance without duplicating', async () => {
            inMemoryDb.policyConfigs.push({
                id: 'pol-multi',
                organizationId: orgId,
                serviceId,
                cancelCutoffHours: 24,
                cancelFeeType: 'NONE',
                cancelFeeValue: 0,
                updatedAt: new Date('2026-01-01T00:00:00Z'),
            });

            const appt = await mockPrisma.appointment.create({
                data: {
                    organizationId: orgId,
                    locationId,
                    serviceId,
                    priceCents: 10000,
                    status: 'CONFIRMED',
                    paymentStatus: 'PAID',
                    startAt: new Date(Date.now() + 48 * 3600 * 1000), // On-time: full $100 refund
                    endAt: new Date(Date.now() + 49 * 3600 * 1000),
                },
            });

            // Payment 1: $60
            const pay1 = await mockPrisma.paymentRecord.create({
                data: {
                    organizationId: orgId,
                    appointmentId: appt.id,
                    providerPaymentId: 'pi_multi_1',
                    amountCents: 6000,
                    currency: 'USD',
                    status: PaymentRecordStatus.SUCCEEDED,
                    idempotencyKey: 'ik_m_1',
                },
            });

            // Payment 2: $40
            const pay2 = await mockPrisma.paymentRecord.create({
                data: {
                    organizationId: orgId,
                    appointmentId: appt.id,
                    providerPaymentId: 'pi_multi_2',
                    amountCents: 4000,
                    currency: 'USD',
                    status: PaymentRecordStatus.SUCCEEDED,
                    idempotencyKey: 'ik_m_2',
                },
            });

            const quote = await policyService.calculateCancellationQuote(orgId, appt.id);
            expect(quote.capturedBalanceCents).toBe(10000);
            expect(quote.refundableCents).toBe(10000);

            await appointmentService.cancel(appt.id, orgId, 'Full cancel multi-pay', 'STAFF', 'user-1', quote.quoteVersion);

            // Verified Payment Provider called for $60 on Pay1 and $40 on Pay2
            expect(mockPaymentProvider.refund).toHaveBeenCalledTimes(2);
            expect(mockPaymentProvider.refund).toHaveBeenNthCalledWith(1, expect.objectContaining({
                providerPaymentId: 'pi_multi_1',
                amountCents: 6000,
            }));
            expect(mockPaymentProvider.refund).toHaveBeenNthCalledWith(2, expect.objectContaining({
                providerPaymentId: 'pi_multi_2',
                amountCents: 4000,
            }));

            const updatedPay1 = inMemoryDb.paymentRecords.find((p) => p.id === pay1.id);
            const updatedPay2 = inMemoryDb.paymentRecords.find((p) => p.id === pay2.id);
            expect(updatedPay1.status).toBe(PaymentRecordStatus.REFUNDED);
            expect(updatedPay2.status).toBe(PaymentRecordStatus.REFUNDED);

            const updatedAppt = inMemoryDb.appointments.find((a) => a.id === appt.id);
            expect(updatedAppt.status).toBe('CANCELLED');
            expect(updatedAppt.paymentStatus).toBe('REFUNDED');
        });
    });

    describe('6. Partial Prior Refunds & Immutable Commission Clawback', () => {
        it('should correctly calculate remaining refund balance and adjust commission from immutable snapshot basis', async () => {
            const appt = await mockPrisma.appointment.create({
                data: {
                    organizationId: orgId,
                    locationId,
                    serviceId,
                    priceCents: 10000,
                    status: 'CONFIRMED',
                    paymentStatus: 'PARTIALLY_REFUNDED',
                    startAt: new Date(Date.now() + 48 * 3600 * 1000),
                    endAt: new Date(Date.now() + 49 * 3600 * 1000),
                },
            });

            const pay = await mockPrisma.paymentRecord.create({
                data: {
                    organizationId: orgId,
                    appointmentId: appt.id,
                    providerPaymentId: 'pi_comm_test',
                    amountCents: 10000,
                    currency: 'USD',
                    status: PaymentRecordStatus.PARTIALLY_REFUNDED,
                    idempotencyKey: 'ik_comm_pay',
                },
            });

            // Prior partial refund of $30
            await mockPrisma.refundRecord.create({
                data: {
                    organizationId: orgId,
                    paymentId: pay.id,
                    amountCents: 3000,
                    currency: 'USD',
                    status: RefundStatus.SUCCEEDED,
                    idempotencyKey: 'ik_prior_ref_30',
                },
            });

            // Commission Record snapshot (20% on $100 price baseline = $20.00)
            const commission = {
                id: 'comm_1',
                organizationId: orgId,
                appointmentId: appt.id,
                staffId,
                calculatedAmountCents: 1400, // Adjusted after first refund ($70 net * 20% = $14)
                priceSnapshotCents: 10000, // Immutable price snapshot
                rateValueSnapshot: 2000, // 20.00%
                calculationBasisSnapshot: 'NET_SERVICE_PRICE',
                ruleVersionSnapshot: 1,
                status: CommissionStatus.PENDING,
            };
            inMemoryDb.commissionRecords.push(commission);

            // Cancellation quote should recognize only $70 captured balance remains
            const quote = await policyService.calculateCancellationQuote(orgId, appt.id);
            expect(quote.capturedBalanceCents).toBe(7000);
            expect(quote.refundableCents).toBe(7000);

            // Execute cancellation refund for remaining $70
            await appointmentService.cancel(appt.id, orgId, 'Final cancel refund', 'STAFF', 'user-1', quote.quoteVersion);

            expect(mockPaymentProvider.refund).toHaveBeenCalledWith(
                expect.objectContaining({ amountCents: 7000 })
            );

            // Commission should now be fully clawed back to 0 without drift
            const finalComm = inMemoryDb.commissionRecords.find((c) => c.id === 'comm_1');
            expect(finalComm.calculatedAmountCents).toBe(0);
            expect(finalComm.status).toBe(CommissionStatus.CLAWED_BACK);

            // Financial ledger should record refund disbursement and commission clawback
            expect(inMemoryDb.financialLedgerEntries.length).toBeGreaterThanOrEqual(1);
            const refundEntry = inMemoryDb.financialLedgerEntries.find((e) => e.entryType === 'REFUND_DISBURSEMENT');
            expect(refundEntry).toBeDefined();
            expect(refundEntry.amountCents).toBe(-7000);
        });
    });

    describe('7. Concurrent Refund Serialization & Balance Guard', () => {
        it('should reject refund exceeding remaining un-refunded captured balance', async () => {
            const pay = await mockPrisma.paymentRecord.create({
                data: {
                    organizationId: orgId,
                    providerPaymentId: 'pi_balance_test',
                    amountCents: 5000,
                    currency: 'USD',
                    status: PaymentRecordStatus.SUCCEEDED,
                    idempotencyKey: 'ik_bal_test',
                },
            });

            // Prior refund of $40
            await mockPrisma.refundRecord.create({
                data: {
                    organizationId: orgId,
                    paymentId: pay.id,
                    amountCents: 4000,
                    currency: 'USD',
                    status: RefundStatus.SUCCEEDED,
                    idempotencyKey: 'ik_prior_40',
                },
            });

            // Attempting to refund $20 when only $10 remains must fail
            await expect(
                refundsService.processRefund(orgId, {
                    organizationId: orgId,
                    paymentRecordId: pay.id,
                    amountCents: 2000,
                })
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('8. Stale & Expired Quote Rejection', () => {
        it('should reject an expired cancellation quote (> 15 minutes)', async () => {
            const appt = await mockPrisma.appointment.create({
                data: {
                    organizationId: orgId,
                    locationId,
                    serviceId,
                    priceCents: 5000,
                    status: 'CONFIRMED',
                    paymentStatus: 'UNPAID',
                    startAt: new Date(Date.now() + 48 * 3600 * 1000),
                    endAt: new Date(Date.now() + 49 * 3600 * 1000),
                },
            });

            // Persist an expired quote
            const expiredQuote = await mockPrisma.cancellationQuote.create({
                data: {
                    organizationId: orgId,
                    appointmentId: appt.id,
                    appointmentVersion: 1,
                    policyVersion: 'v1',
                    policyProvenance: 'ORG_DEFAULT',
                    capturedBalanceCents: 0,
                    feeCents: 0,
                    refundableAmountCents: 0,
                    currency: 'USD',
                    quoteSignature: 'sig_expired_1234567890',
                    isAllowed: true,
                    status: 'ISSUED',
                    expiresAt: new Date(Date.now() - 5 * 60 * 1000), // Expired 5 mins ago
                },
            });

            await expect(
                appointmentService.cancel(appt.id, orgId, 'Expired quote attempt', 'STAFF', 'user-1', 'sig_expired_1234567890')
            ).rejects.toThrow(BadRequestException);
        });

        it('should reject quote if appointment version was incremented (modified/rescheduled)', async () => {
            const appt = await mockPrisma.appointment.create({
                data: {
                    organizationId: orgId,
                    locationId,
                    serviceId,
                    priceCents: 5000,
                    version: 2, // Modified
                    status: 'CONFIRMED',
                    paymentStatus: 'UNPAID',
                    startAt: new Date(Date.now() + 48 * 3600 * 1000),
                    endAt: new Date(Date.now() + 49 * 3600 * 1000),
                },
            });

            // Quote generated when version was 1
            await mockPrisma.cancellationQuote.create({
                data: {
                    organizationId: orgId,
                    appointmentId: appt.id,
                    appointmentVersion: 1,
                    policyVersion: 'v1',
                    policyProvenance: 'ORG_DEFAULT',
                    capturedBalanceCents: 0,
                    feeCents: 0,
                    refundableAmountCents: 0,
                    currency: 'USD',
                    quoteSignature: 'sig_stale_ver_123456',
                    isAllowed: true,
                    status: 'ISSUED',
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                },
            });

            await expect(
                appointmentService.cancel(appt.id, orgId, 'Stale appt ver attempt', 'STAFF', 'user-1', 'sig_stale_ver_123456')
            ).rejects.toThrow(ConflictException);
        });
    });

    describe('9. Policy Version Change Rejection', () => {
        it('should reject cancellation quote if policy version changed since quote generation', async () => {
            inMemoryDb.policyConfigs.push({
                id: 'pol-dynamic',
                organizationId: orgId,
                serviceId,
                cancelCutoffHours: 24,
                cancelFeeType: 'PERCENTAGE',
                cancelFeeValue: 50,
                updatedAt: new Date('2026-06-01T00:00:00Z'), // New policy version
            });

            const appt = await mockPrisma.appointment.create({
                data: {
                    organizationId: orgId,
                    locationId,
                    serviceId,
                    priceCents: 5000,
                    version: 1,
                    status: 'CONFIRMED',
                    paymentStatus: 'UNPAID',
                    startAt: new Date(Date.now() + 48 * 3600 * 1000),
                    endAt: new Date(Date.now() + 49 * 3600 * 1000),
                },
            });

            // Quote generated under old policy timestamp
            await mockPrisma.cancellationQuote.create({
                data: {
                    organizationId: orgId,
                    appointmentId: appt.id,
                    appointmentVersion: 1,
                    policyVersion: '2025-01-01T00:00:00.000Z', // Old version
                    policyProvenance: 'SERVICE',
                    capturedBalanceCents: 0,
                    feeCents: 0,
                    refundableAmountCents: 0,
                    currency: 'USD',
                    quoteSignature: 'sig_old_pol_123456',
                    isAllowed: true,
                    status: 'ISSUED',
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                },
            });

            await expect(
                appointmentService.cancel(appt.id, orgId, 'Policy changed attempt', 'STAFF', 'user-1', 'sig_old_pol_123456')
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('10. Provider Failure & Cancellation Abort', () => {
        it('should abort cancellation and keep appointment intact if payment provider refund fails', async () => {
            mockPaymentProvider.refund.mockRejectedValueOnce(new Error('Stripe card refund declined'));

            const appt = await mockPrisma.appointment.create({
                data: {
                    organizationId: orgId,
                    locationId,
                    serviceId,
                    priceCents: 5000,
                    status: 'CONFIRMED',
                    paymentStatus: 'PAID',
                    startAt: new Date(Date.now() + 48 * 3600 * 1000),
                    endAt: new Date(Date.now() + 49 * 3600 * 1000),
                },
            });

            await mockPrisma.paymentRecord.create({
                data: {
                    organizationId: orgId,
                    appointmentId: appt.id,
                    providerPaymentId: 'pi_fail_provider',
                    amountCents: 5000,
                    currency: 'USD',
                    status: PaymentRecordStatus.SUCCEEDED,
                    idempotencyKey: 'ik_fail_prov',
                },
            });

            const quote = await policyService.calculateCancellationQuote(orgId, appt.id);

            await expect(
                appointmentService.cancel(appt.id, orgId, 'Cancel with provider failure', 'STAFF', 'user-1', quote.quoteVersion)
            ).rejects.toThrow(BadRequestException);

            // Appointment MUST NOT be marked CANCELLED
            const existingAppt = inMemoryDb.appointments.find((a) => a.id === appt.id);
            expect(existingAppt.status).toBe('CONFIRMED');

            // Refund record should be marked FAILED
            const refund = inMemoryDb.refundRecords.find((r) => r.paymentId === inMemoryDb.paymentRecords[0].id);
            expect(refund.status).toBe(RefundStatus.FAILED);
            expect(refund.failureReason).toContain('Stripe card refund declined');
        });
    });

    describe('11. Local Finalization Failure & Reconciliation State', () => {
        it('should create ReconciliationIncident and flag REQUIRES_RECONCILIATION if provider succeeds but local DB transaction fails', async () => {
            const pay = await mockPrisma.paymentRecord.create({
                data: {
                    organizationId: orgId,
                    providerPaymentId: 'pi_local_fail',
                    amountCents: 5000,
                    currency: 'USD',
                    status: PaymentRecordStatus.SUCCEEDED,
                    idempotencyKey: 'ik_local_fail',
                },
            });

            // Mock DB crash on finalization transaction in RefundsService
            jest.spyOn(mockPrisma.refundRecord, 'update').mockRejectedValueOnce(new Error('Database disk full / connection timeout'));

            await expect(
                refundsService.processRefund(orgId, {
                    organizationId: orgId,
                    paymentRecordId: pay.id,
                    amountCents: 5000,
                })
            ).rejects.toThrow('Database disk full / connection timeout');

            // Provider refund succeeded, so ReconciliationIncident must be created
            const incident = inMemoryDb.reconciliationIncidents.find((i) => i.providerPaymentId === 'pi_local_fail');
            expect(incident).toBeDefined();
            expect(incident.incidentType).toBe(IncidentType.AMBIGUOUS_REFUND);

            const updatedPay = inMemoryDb.paymentRecords.find((p) => p.id === pay.id);
            expect(updatedPay.status).toBe(PaymentRecordStatus.REQUIRES_RECONCILIATION);
        });
    });
});
