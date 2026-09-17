import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import {
    CreateReviewInput,
    ReviewDto,
    ReviewListQueryInput,
    ReviewStatus,
    UpdateReviewInput,
} from "@bookpro/contracts";

@Injectable()
export class ReviewService {
    private readonly logger = new Logger(ReviewService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Creates a verified review for a completed owned appointment.
     */
    async createReview(
        organizationId: string,
        customerId: string,
        input: CreateReviewInput
    ): Promise<ReviewDto> {
        // 1. Fetch authoritative appointment
        const appointment = await this.prisma.appointment.findFirst({
            where: { id: input.appointmentId, organizationId },
            include: { customer: true, service: true, staff: true, location: true },
        });

        if (!appointment) {
            throw new NotFoundException(`Appointment ${input.appointmentId} not found.`);
        }

        // 2. Invariant: Customer ownership
        if (appointment.customerId !== customerId) {
            throw new ForbiddenException("You can only review your own appointments.");
        }

        // 3. Invariant: Only COMPLETED appointments can be reviewed
        if (appointment.status !== "COMPLETED") {
            throw new BadRequestException(`Cannot review an appointment with status '${appointment.status}'. Only COMPLETED appointments can be reviewed.`);
        }

        // 4. Invariant: One review per booking
        const existing = await this.prisma.review.findUnique({
            where: { appointmentId: input.appointmentId },
        });
        if (existing) {
            throw new ConflictException("A review has already been submitted for this appointment.");
        }

        // 5. Rating validation
        if (input.rating < 1 || input.rating > 5) {
            throw new BadRequestException("Rating must be an integer between 1 and 5.");
        }

        const review = await this.prisma.review.create({
            data: {
                organizationId,
                appointmentId: appointment.id,
                customerId: appointment.customerId,
                serviceId: appointment.serviceId,
                staffId: appointment.staffId,
                locationId: appointment.locationId,
                rating: input.rating,
                comment: input.comment || null,
                status: "PUBLISHED",
            },
            include: {
                customer: true,
                service: true,
                staff: { include: { membership: { include: { user: true } } } },
                location: true,
            },
        });

        this.logger.log(`[ReviewService] Created verified review ${review.id} for appointment ${appointment.id} (rating: ${input.rating})`);

        return this.toDto(review);
    }

    /**
     * Updates an existing review (customer edit or manager moderation).
     */
    async updateReview(
        organizationId: string,
        reviewId: string,
        input: UpdateReviewInput,
        actorCustomerId?: string
    ): Promise<ReviewDto> {
        const review = await this.prisma.review.findFirst({
            where: { id: reviewId, organizationId },
        });

        if (!review) {
            throw new NotFoundException(`Review ${reviewId} not found.`);
        }

        if (actorCustomerId && review.customerId !== actorCustomerId) {
            throw new ForbiddenException("You cannot edit another customer's review.");
        }

        if (input.rating !== undefined && (input.rating < 1 || input.rating > 5)) {
            throw new BadRequestException("Rating must be an integer between 1 and 5.");
        }

        const updated = await this.prisma.review.update({
            where: { id: reviewId },
            data: {
                ...(input.rating !== undefined ? { rating: input.rating } : {}),
                ...(input.comment !== undefined ? { comment: input.comment } : {}),
                ...(input.status !== undefined ? { status: input.status as any } : {}),
            },
            include: {
                customer: true,
                service: true,
                staff: { include: { membership: { include: { user: true } } } },
                location: true,
            },
        });

        return this.toDto(updated);
    }

    /**
     * Lists reviews with multi-dimensional filtering.
     */
    async listReviews(
        organizationId: string,
        query: ReviewListQueryInput = {}
    ): Promise<{ reviews: ReviewDto[]; total: number }> {
        const where = {
            organizationId,
            ...(query.status ? { status: query.status as any } : { status: "PUBLISHED" as any }),
            ...(query.serviceId ? { serviceId: query.serviceId } : {}),
            ...(query.staffId ? { staffId: query.staffId } : {}),
            ...(query.locationId ? { locationId: query.locationId } : {}),
        };

        const [records, total] = await Promise.all([
            this.prisma.review.findMany({
                where,
                include: {
                    customer: true,
                    service: true,
                    staff: { include: { membership: { include: { user: true } } } },
                    location: true,
                },
                orderBy: { createdAt: "desc" },
                take: query.limit || 20,
                skip: query.offset || 0,
            }),
            this.prisma.review.count({ where }),
        ]);

        return {
            reviews: records.map((r) => this.toDto(r)),
            total,
        };
    }

    private toDto(record: any): ReviewDto {
        return {
            id: record.id,
            organizationId: record.organizationId,
            appointmentId: record.appointmentId,
            customerId: record.customerId,
            customerName: record.customer?.fullName || "Verified Customer",
            serviceId: record.serviceId,
            serviceName: record.service?.name || null,
            staffId: record.staffId,
            staffName: record.staff?.displayName || record.staff?.membership?.user?.fullName || null,
            locationId: record.locationId,
            locationName: record.location?.name || null,
            rating: record.rating,
            comment: record.comment,
            status: record.status,
            createdAt: record.createdAt.toISOString(),
            updatedAt: record.updatedAt.toISOString(),
        };
    }
}
