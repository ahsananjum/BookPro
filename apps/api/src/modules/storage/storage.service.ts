import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
    private readonly logger = new Logger(StorageService.name);
    private readonly uploadDir = path.join(process.cwd(), 'uploads');
    private readonly supabaseUrl: string;
    private readonly supabaseKey: string;

    constructor(private readonly prisma: PrismaService) {
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
        this.supabaseUrl = process.env.SUPABASE_URL || 'https://jpwulhupxanqopncnzzt.supabase.co';
        this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
    }

    async uploadFile(
        organizationId: string,
        fileBuffer: Buffer,
        fileName: string,
        mimeType: string,
        createdById?: string,
        isPublic = true,
    ) {
        const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/pjpeg',
            'image/png',
            'image/webp',
            'image/svg+xml',
            'image/gif',
            'application/pdf',
        ];
        if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
            throw new BadRequestException(`File type ${mimeType} is not supported. Please upload a PNG, JPG, SVG, or WEBP image.`);
        }

        const maxSizeBytes = 10 * 1024 * 1024; // 10MB limit
        if (fileBuffer.length > maxSizeBytes) {
            throw new BadRequestException('File size exceeds maximum limit of 10MB');
        }

        const safeOrgFolder = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const orgFolder = path.join(this.uploadDir, safeOrgFolder);
        if (!fs.existsSync(orgFolder)) {
            fs.mkdirSync(orgFolder, { recursive: true });
        }

        const ext = path.extname(fileName) || '.png';
        const randomKey = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`;
        const filePath = path.join(orgFolder, randomKey);

        fs.writeFileSync(filePath, fileBuffer);

        const storageKey = `${safeOrgFolder}/${randomKey}`;
        let publicUrl = `/api/v1/storage/files/${storageKey}`;

        // Attempt Supabase Storage Upload if credentials are configured
        if (this.supabaseKey) {
            try {
                const supabaseEndpoint = `${this.supabaseUrl}/storage/v1/object/branding/${storageKey}`;
                const sbRes = await fetch(supabaseEndpoint, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.supabaseKey}`,
                        'Content-Type': mimeType,
                        'x-upsert': 'true',
                    },
                    body: fileBuffer as any,
                });
                if (sbRes.ok) {
                    publicUrl = `${this.supabaseUrl}/storage/v1/object/public/branding/${storageKey}`;
                }
            } catch (sbErr: any) {
                this.logger.warn(`Supabase storage upload fallback to local storage: ${sbErr.message}`);
            }
        }

        let assetId = randomKey;
        try {
            const asset = await this.prisma.storedAsset.create({
                data: {
                    organizationId,
                    storageKey,
                    fileName,
                    mimeType,
                    sizeBytes: fileBuffer.length,
                    isPublic,
                    createdById: createdById && createdById.length === 36 ? createdById : undefined,
                },
            });
            assetId = asset.id;
        } catch (dbErr: any) {
            this.logger.warn(`StoredAsset table record skipped: ${dbErr.message}`);
        }

        return {
            assetId,
            storageKey,
            fileName,
            url: publicUrl,
        };
    }

    async getFilePath(storageKey: string, organizationId?: string) {
        let mimeType = 'image/png';
        if (storageKey.endsWith('.jpg') || storageKey.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (storageKey.endsWith('.webp')) mimeType = 'image/webp';
        else if (storageKey.endsWith('.svg')) mimeType = 'image/svg+xml';
        else if (storageKey.endsWith('.gif')) mimeType = 'image/gif';
        else if (storageKey.endsWith('.pdf')) mimeType = 'application/pdf';

        const filePath = path.join(this.uploadDir, storageKey);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException('File binary missing');
        }

        return {
            filePath,
            mimeType,
            fileName: path.basename(storageKey),
        };
    }
}
