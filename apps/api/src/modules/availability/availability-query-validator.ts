import { Injectable, BadRequestException } from "@nestjs/common";
import { SearchAvailabilityInput } from "@bookpro/contracts";
import { LocalDate, isValidIanaTimezone } from "@bookpro/server-core";

@Injectable()
export class AvailabilityQueryValidator {
    validateSearchInput(input: SearchAvailabilityInput): {
        startLocalDate: LocalDate;
        endLocalDate: LocalDate;
        presentationTimezone: string;
    } {
        const { startDate, endDate, partySize = 1, presentationTimezone: inputTz } = input;

        if (partySize < 1) {
            throw new BadRequestException("partySize must be at least 1");
        }

        const startLocalDate = LocalDate.parse(startDate);
        const endLocalDate = LocalDate.parse(endDate);

        const dayDiff =
            (new Date(endLocalDate.toString()).getTime() - new Date(startLocalDate.toString()).getTime()) /
            (1000 * 60 * 60 * 24);

        if (dayDiff < 0) {
            throw new BadRequestException("startDate must be <= endDate");
        }

        if (dayDiff > 31) {
            throw new BadRequestException("Search date range cannot exceed 31 days");
        }

        const presentationTimezone = inputTz || "UTC";
        if (!isValidIanaTimezone(presentationTimezone)) {
            throw new BadRequestException(`Invalid presentation timezone: ${presentationTimezone}`);
        }

        return {
            startLocalDate,
            endLocalDate,
            presentationTimezone,
        };
    }
}
