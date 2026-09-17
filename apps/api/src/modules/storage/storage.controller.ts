import { Controller, Post, Get, Body, Param, Res, UseInterceptors, UploadedFile, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Public, ReqContext, RequirePermissions } from '@bookpro/server-core';
import { RequestContext, PermissionKey } from '@bookpro/contracts';
import { StorageService } from './storage.service';

@Controller('storage')
export class StorageController {
    constructor(
        private readonly storageService: StorageService,
    ) { }

    @Post('upload')
    @RequirePermissions(PermissionKey.ORG_UPDATE)
    @HttpCode(HttpStatus.CREATED)
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(
        @ReqContext() ctx: RequestContext,
        @UploadedFile() file?: any,
        @Body() body?: { base64?: string; fileName?: string; mimeType?: string },
    ) {
        if (!ctx.organizationId) {
            throw new BadRequestException('Organization context is required for file upload');
        }
        const organizationId = ctx.organizationId;

        let buffer: Buffer;
        let fileName: string;
        let mimeType: string;

        if (file) {
            buffer = file.buffer;
            fileName = file.originalname;
            mimeType = file.mimetype;
        } else if (body?.base64 && body?.fileName && body?.mimeType) {
            buffer = Buffer.from(body.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
            fileName = body.fileName;
            mimeType = body.mimeType;
        } else {
            throw new BadRequestException('No file binary or base64 image payload provided');
        }

        const result = await this.storageService.uploadFile(
            organizationId,
            buffer,
            fileName,
            mimeType,
            ctx.subjectId,
            true,
        );

        return {
            success: true,
            data: result,
        };
    }

    @Public()
    @Get('files/:orgId/:fileKey')
    async getFile(
        @Param('orgId') orgId: string,
        @Param('fileKey') fileKey: string,
        @Res() res: Response,
    ) {
        const storageKey = `${orgId}/${fileKey}`;
        const result = await this.storageService.getFilePath(storageKey);
        res.setHeader('Content-Type', result.mimeType);
        return res.sendFile(result.filePath);
    }
}
