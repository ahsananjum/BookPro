import { EligibleStaffResolver } from "./eligible-staff-resolver";

describe("EligibleStaffResolver", () => {
    it("does not advertise unassigned staff as a fallback", async () => {
        const findMany = jest.fn().mockResolvedValue([]);
        const resolver = new EligibleStaffResolver({ staffProfile: { findMany } } as any);

        await expect(resolver.resolveEligibleStaff("org-1", "location-1", "service-1")).resolves.toEqual([]);
        expect(findMany).toHaveBeenCalledTimes(1);
        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                staffLocations: { some: { locationId: "location-1" } },
                staffServices: { some: { serviceId: "service-1" } },
            }),
        }));
    });
});
