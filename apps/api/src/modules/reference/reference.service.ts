import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { IANA_TIMEZONES, CURRENCIES, COUNTRIES } from "./reference-data";

@Injectable()
export class ReferenceService {
    constructor(private readonly prisma: PrismaService) {}

    getTimezones() {
        return IANA_TIMEZONES;
    }

    getCurrencies() {
        return CURRENCIES;
    }

    getCountries() {
        return COUNTRIES;
    }

    async getIndustries() {
        const templates = await this.prisma.industryTemplate.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
            select: {
                id: true,
                slug: true,
                name: true,
                description: true,
                icon: true,
                sortOrder: true,
            },
        });

        if (templates && templates.length > 0) {
            return templates;
        }

        // Canonical fallback if database templates are not yet seeded
        return [
            { id: "beauty-hair-salon", slug: "beauty-hair-salon", name: "Beauty & Hair Salon", description: "Styling, haircutting, coloring, chair resource management & buffers", icon: "Scissors", sortOrder: 1 },
            { id: "wellness-spa", slug: "wellness-spa", name: "Wellness & Spa", description: "Massages, skin therapy, private treatment rooms & relaxation intervals", icon: "Sparkles", sortOrder: 2 },
            { id: "medical-dental-clinic", slug: "medical-dental-clinic", name: "Medical & Dental Clinic", description: "Doctor consultations, treatment bays, specialized intake & follow-ups", icon: "Activity", sortOrder: 3 },
            { id: "barbershop", slug: "barbershop", name: "Barbershop", description: "Men grooming, beard sculpting, chair scheduling & appointment queue", icon: "UserCheck", sortOrder: 4 },
            { id: "professional-consulting", slug: "professional-consulting", name: "Professional Consulting", description: "Hourly legal, tax, financial advisory & strategy client appointments", icon: "Briefcase", sortOrder: 5 },
            { id: "fitness-personal-training", slug: "fitness-personal-training", name: "Fitness & Personal Training", description: "1-on-1 coaching, studio bays, group classes & equipment pool locks", icon: "Flame", sortOrder: 6 },
            { id: "creative-photo-video", slug: "creative-photo-video", name: "Creative Photo / Video Studio", description: "Camera gear, sound stages, lighting rigs & studio session buffers", icon: "Camera", sortOrder: 7 },
            { id: "automotive-equipment-repair", slug: "automotive-equipment-repair", name: "Automotive & Equipment Repair", description: "Diagnostic bays, certified mechanics, parts buffer & service intake", icon: "Wrench", sortOrder: 8 },
            { id: "general-services", slug: "general-services", name: "General / Other Services", description: "Flexible custom scheduling rules, customizable staff & room assignments", icon: "Layers", sortOrder: 9 },
        ];
    }
}
