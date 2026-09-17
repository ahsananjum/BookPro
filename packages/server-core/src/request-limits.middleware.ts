import { BadRequestException, Injectable, NestMiddleware, PayloadTooLargeException } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { ErrorCodes } from "@bookpro/contracts";
import { BoundaryLimits } from "./boundary-validation.pipe";

const MAX_HEADER_LENGTH = 2_048;

@Injectable()
export class RequestLimitsMiddleware implements NestMiddleware {
    use(req: Request, _res: Response, next: NextFunction): void {
        const contentLength = req.header("content-length");
        if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > BoundaryLimits.maxBodyBytes)) {
            throw new PayloadTooLargeException({
                code: ErrorCodes.PAYLOAD_TOO_LARGE,
                message: "The request body is too large.",
            });
        }

        for (const [name, rawValue] of Object.entries(req.headers)) {
            const values = Array.isArray(rawValue) ? rawValue : [rawValue];
            if (values.some((value) => typeof value === "string" && value.length > MAX_HEADER_LENGTH)) {
                throw new BadRequestException({
                    code: ErrorCodes.INVALID_HEADER,
                    message: "A request header is invalid.",
                    details: [{ field: name, message: `Header exceeds ${MAX_HEADER_LENGTH} characters`, code: "MAX_LENGTH" }],
                });
            }
        }
        next();
    }
}
