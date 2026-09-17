import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateIntakeFormDto, UpdateIntakeFormDto } from '@bookpro/contracts';

@Injectable()
export class IntakeFormService {
    constructor(private readonly prisma: PrismaService) { }

    async getIntakeForms(organizationId: string, serviceId?: string) {
        const whereClause: any = {
            organizationId,
            archivedAt: null,
            isActive: true,
        };

        if (serviceId) {
            whereClause.OR = [
                { isGlobal: true },
                { serviceIntakeForms: { some: { serviceId } } },
            ];
        }

        const forms = await this.prisma.intakeForm.findMany({
            where: whereClause,
            include: {
                serviceIntakeForms: {
                    include: {
                        service: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        if (serviceId) {
            return forms.map((form) => {
                const link = form.serviceIntakeForms.find((s) => s.serviceId === serviceId);
                return {
                    ...form,
                    isRequired: form.isGlobal ? true : (link?.isRequired ?? false),
                };
            });
        }

        return forms;
    }

    async getIntakeFormById(organizationId: string, formId: string) {
        const form = await this.prisma.intakeForm.findFirst({
            where: {
                id: formId,
                organizationId,
                archivedAt: null,
            },
            include: {
                serviceIntakeForms: {
                    include: { service: true },
                },
            },
        });

        if (!form) {
            throw new NotFoundException('Intake form not found');
        }

        return form;
    }

    async createIntakeForm(organizationId: string, dto: CreateIntakeFormDto) {
        const form = await this.prisma.intakeForm.create({
            data: {
                organizationId,
                name: dto.name,
                description: dto.description,
                isGlobal: dto.isGlobal ?? false,
                fields: dto.fields as any,
            },
        });

        if (dto.serviceIds && dto.serviceIds.length > 0) {
            await this.prisma.serviceIntakeForm.createMany({
                data: dto.serviceIds.map((serviceId: string) => ({
                    intakeFormId: form.id,
                    serviceId,
                })),
            });
        }

        return this.getIntakeFormById(organizationId, form.id);
    }

    async updateIntakeForm(organizationId: string, formId: string, dto: UpdateIntakeFormDto) {
        await this.getIntakeFormById(organizationId, formId);

        await this.prisma.intakeForm.update({
            where: { id: formId },
            data: {
                ...(dto.name && { name: dto.name }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.isGlobal !== undefined && { isGlobal: dto.isGlobal }),
                ...(dto.fields && { fields: dto.fields as any }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
        });

        if (dto.serviceIds) {
            await this.prisma.serviceIntakeForm.deleteMany({ where: { intakeFormId: formId } });
            await this.prisma.serviceIntakeForm.createMany({
                data: dto.serviceIds.map((serviceId: string) => ({
                    intakeFormId: formId,
                    serviceId,
                })),
            });
        }

        return this.getIntakeFormById(organizationId, formId);
    }

    async archiveIntakeForm(organizationId: string, formId: string) {
        await this.getIntakeFormById(organizationId, formId);

        return this.prisma.intakeForm.update({
            where: { id: formId },
            data: { archivedAt: new Date(), isActive: false },
        });
    }
}
