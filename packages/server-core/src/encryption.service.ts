import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import * as crypto from "crypto";

export interface OAuthStatePayload {
    organizationId: string;
    staffId: string;
    userId?: string;
    timestamp: number;
    nonce: string;
}

@Injectable()
export class EncryptionService {
    private static readonly ALGORITHM = "aes-256-gcm";
    private static readonly IV_LENGTH = 12; // 12 bytes standard for GCM
    private static readonly AUTH_TAG_LENGTH = 16;
    private static readonly STATE_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

    private static getMasterKey(): Buffer {
        const secret = process.env.ENCRYPTION_KEY;
        if (!secret || secret.length < 32) throw new Error("ENCRYPTION_KEY must be configured independently with at least 32 characters");
        return crypto.createHash("sha256").update(secret).digest();
    }

    private static getStateSigningSecret(): string {
        const secret = process.env.OAUTH_STATE_SECRET;
        if (!secret || secret.length < 32) throw new Error("OAUTH_STATE_SECRET must be configured independently with at least 32 characters");
        return secret;
    }

    /**
     * Encrypts plaintext string using AES-256-GCM authenticated encryption.
     * Returns "ivHex:authTagHex:encryptedHex"
     */
    static encrypt(text: string): string {
        if (!text) return "";
        const key = this.getMasterKey();
        const iv = crypto.randomBytes(this.IV_LENGTH);
        const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

        let encrypted = cipher.update(text, "utf8", "hex");
        encrypted += cipher.final("hex");
        const authTag = cipher.getAuthTag().toString("hex");

        return `${iv.toString("hex")}:${authTag}:${encrypted}`;
    }

    /**
     * Decrypts AES-256-GCM ciphertext format ("ivHex:authTagHex:encryptedHex").
     * Verifies cryptographic authentication tag before returning plaintext.
     */
    static decrypt(ciphertext: string): string {
        if (!ciphertext) return "";
        const parts = ciphertext.split(":");
        if (parts.length !== 3) {
            throw new Error("Invalid encrypted token format");
        }

        const [ivHex, authTagHex, encryptedHex] = parts;
        const key = this.getMasterKey();
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");

        const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedHex, "hex", "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
    }

    /**
     * Generates a tamper-proof HMAC-signed OAuth state string
     */
    static generateOAuthState(payload: Omit<OAuthStatePayload, "timestamp" | "nonce">): string {
        const fullPayload: OAuthStatePayload = {
            ...payload,
            timestamp: Date.now(),
            nonce: crypto.randomBytes(16).toString("hex"),
        };

        const jsonStr = JSON.stringify(fullPayload);
        const b64Data = Buffer.from(jsonStr, "utf8").toString("base64url");
        const signature = crypto
            .createHmac("sha256", this.getStateSigningSecret())
            .update(b64Data)
            .digest("base64url");

        return `${b64Data}.${signature}`;
    }

    /**
     * Cryptographically validates and decodes an OAuth state token.
     * Throws UnauthorizedException if signature is invalid or state is expired.
     */
    static verifyOAuthState(stateString: string): OAuthStatePayload {
        if (!stateString) {
            throw new UnauthorizedException("Malformed or missing OAuth state parameter");
        }

        const parts = stateString.split(".");
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            throw new UnauthorizedException("Malformed or missing OAuth state parameter");
        }
        const [b64Data, signature] = parts;
        const expectedSignature = crypto
            .createHmac("sha256", this.getStateSigningSecret())
            .update(b64Data)
            .digest("base64url");

        const supplied = Buffer.from(signature, "base64url");
        const expected = Buffer.from(expectedSignature, "base64url");
        if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
            throw new UnauthorizedException("Invalid OAuth state signature — potential CSRF/tampering attempt");
        }

        try {
            const jsonStr = Buffer.from(b64Data, "base64url").toString("utf8");
            const payload: OAuthStatePayload = JSON.parse(jsonStr);

            if (
                typeof payload.organizationId !== "string" || !payload.organizationId ||
                typeof payload.staffId !== "string" || !payload.staffId ||
                (payload.userId !== undefined && (typeof payload.userId !== "string" || !payload.userId)) ||
                typeof payload.timestamp !== "number" || !Number.isFinite(payload.timestamp) ||
                typeof payload.nonce !== "string" || !/^[a-f0-9]{32}$/.test(payload.nonce)
            ) {
                throw new UnauthorizedException("Invalid OAuth state claims");
            }

            const age = Date.now() - payload.timestamp;
            if (age > this.STATE_MAX_AGE_MS || age < -30000) {
                throw new UnauthorizedException("OAuth state has expired. Please initiate connection again.");
            }

            return payload;
        } catch (err: any) {
            if (err instanceof UnauthorizedException) throw err;
            throw new UnauthorizedException("Failed to decode OAuth state payload");
        }
    }
}
