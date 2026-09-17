import { publicFinalizeBookingSchema } from '@bookpro/validation';
import { PrismaClient } from '@prisma/client';
import { AppointmentService } from '../src/modules/appointments/appointment.service';
import { ScheduleGuardService } from '../src/modules/concurrency/schedule-guard.service';
import { IdempotencyService } from '../src/modules/common/idempotency.service';
import { OutboxService } from '../src/modules/outbox/outbox.service';
import { CommissionsService } from '../src/modules/commissions/commissions.service';
import { PolicyService } from '../src/modules/policy/policy.service';
import { RefundsService } from '../src/modules/refunds/refunds.service';
import { AuthoritativeAvailabilityValidatorService } from '../src/modules/availability/authoritative-availability-validator.service';

const prisma = new PrismaClient();

async function main() {
    const body = {
        bookingHoldId: "5cbf9281-7cc7-4888-87e2-d5ec20310569",
        guestToken: "gst_test_dummy_token_1234567890",
        idempotencyKey: "final_test_12345678",
    };

    console.log("SafeParse result:");
    const parseResult = publicFinalizeBookingSchema.safeParse(body);
    console.log(parseResult);

    const hold = await prisma.bookingHold.findUnique({
        where: { id: body.bookingHoldId },
    });
    console.log("Hold from DB:", hold);
}

main().finally(() => prisma.$disconnect());
