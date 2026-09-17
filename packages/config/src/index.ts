import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { validateEnv, EnvConfig } from "@bookpro/validation";

function findAndLoadDotenv(): void {
    let dir = process.cwd();
    while (dir) {
        const envPath = path.join(dir, ".env");
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath });
            return;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    dotenv.config();
}

findAndLoadDotenv();

export function loadConfig(): EnvConfig {
    findAndLoadDotenv();
    return validateEnv(process.env);
}

export type { EnvConfig };
