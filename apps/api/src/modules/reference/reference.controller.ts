import { Controller, Get } from "@nestjs/common";
import { Public } from "@bookpro/server-core";
import { ReferenceService } from "./reference.service";

@Public()
@Controller("reference")
export class ReferenceController {
    constructor(private readonly referenceService: ReferenceService) {}

    @Get("timezones")
    getTimezones() {
        return { success: true, data: this.referenceService.getTimezones() };
    }

    @Get("currencies")
    getCurrencies() {
        return { success: true, data: this.referenceService.getCurrencies() };
    }

    @Get("countries")
    getCountries() {
        return { success: true, data: this.referenceService.getCountries() };
    }

    @Get("industries")
    async getIndustries() {
        const data = await this.referenceService.getIndustries();
        return { success: true, data };
    }
}
