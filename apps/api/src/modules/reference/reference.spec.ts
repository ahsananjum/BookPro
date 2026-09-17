import { ReferenceService } from './reference.service';

describe('ReferenceService', () => {
    let service: ReferenceService;
    let mockPrisma: any;

    beforeEach(() => {
        mockPrisma = {
            industryTemplate: {
                findMany: jest.fn().mockResolvedValue([
                    { id: '1', slug: 'beauty-hair-salon', name: 'Beauty & Hair Salon', description: 'Salon services', sortOrder: 1 },
                    { id: '2', slug: 'wellness-spa', name: 'Wellness & Spa', description: 'Spa services', sortOrder: 2 },
                ]),
            },
        };
        service = new ReferenceService(mockPrisma);
    });

    it('should return authoritative IANA timezones', () => {
        const timezones = service.getTimezones();
        expect(Array.isArray(timezones)).toBe(true);
        expect(timezones.length).toBeGreaterThan(10);
        expect(timezones.some((t) => t.id === 'Asia/Karachi')).toBe(true);
        expect(timezones.some((t) => t.id === 'America/New_York')).toBe(true);
        expect(timezones.some((t) => t.id === 'Europe/London')).toBe(true);
    });

    it('should return supported ISO currencies', () => {
        const currencies = service.getCurrencies();
        expect(Array.isArray(currencies)).toBe(true);
        expect(currencies.some((c) => c.code === 'USD' && c.symbol === '$')).toBe(true);
        expect(currencies.some((c) => c.code === 'PKR' && c.symbol === '₨')).toBe(true);
        expect(currencies.some((c) => c.code === 'EUR' && c.symbol === '€')).toBe(true);
    });

    it('should return ISO country list with dial codes', () => {
        const countries = service.getCountries();
        expect(Array.isArray(countries)).toBe(true);
        expect(countries.some((c) => c.code === 'US' && c.dialCode === '+1')).toBe(true);
        expect(countries.some((c) => c.code === 'PK' && c.dialCode === '+92')).toBe(true);
    });

    it('should query active industry templates from database ordered by sortOrder', async () => {
        const industries = await service.getIndustries();
        expect(mockPrisma.industryTemplate.findMany).toHaveBeenCalledWith({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: {
                id: true,
                slug: true,
                name: true,
                description: true,
                icon: true,
                sortOrder: true,
            },
        });
        expect(industries.length).toBe(2);
        expect(industries[0].name).toBe('Beauty & Hair Salon');
    });
});
