import { Test, TestingModule } from "@nestjs/testing";
import { Reflector, ModulesContainer } from "@nestjs/core";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { AppModule } from "./app.module";
import { IS_PUBLIC_KEY, IS_AUTHENTICATED_KEY, PERMISSIONS_KEY } from "@bookpro/server-core";
import { PermissionKey } from "@bookpro/contracts";

interface RouteInfo {
    controller: string;
    handler: string;
    httpMethod: string;
    path: string;
    classification: "PUBLIC" | "AUTHENTICATED" | "PERMISSIONS" | "UNCLASSIFIED";
    permissions?: PermissionKey[];
    tenantScoped: boolean;
}

const HTTP_METHOD_NAMES: Record<number, string> = {
    [RequestMethod.GET]: "GET",
    [RequestMethod.POST]: "POST",
    [RequestMethod.PUT]: "PUT",
    [RequestMethod.DELETE]: "DELETE",
    [RequestMethod.PATCH]: "PATCH",
    [RequestMethod.ALL]: "ALL",
    [RequestMethod.OPTIONS]: "OPTIONS",
    [RequestMethod.HEAD]: "HEAD",
};

describe("Route Authorization Matrix & Security Classification Verification", () => {
    let moduleRef: TestingModule;
    let reflector: Reflector;
    let modulesContainer: ModulesContainer;
    let discoveredRoutes: RouteInfo[] = [];

    beforeAll(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        reflector = moduleRef.get<Reflector>(Reflector);
        modulesContainer = moduleRef.get<ModulesContainer>(ModulesContainer);

        discoveredRoutes = [];

        for (const [_, moduleInstance] of modulesContainer.entries()) {
            for (const [_, controllerWrapper] of moduleInstance.controllers.entries()) {
                const { metatype: controllerClass, instance } = controllerWrapper;
                if (!controllerClass || !instance) continue;

                const controllerName = controllerClass.name;
                const controllerPath: string = Reflect.getMetadata(PATH_METADATA, controllerClass) || "";

                const prototype = Object.getPrototypeOf(instance);
                const methodNames = Object.getOwnPropertyNames(prototype).filter(
                    (prop) => prop !== "constructor" && typeof prototype[prop] === "function"
                );

                for (const methodName of methodNames) {
                    const handler = prototype[methodName];
                    const routePath: string | undefined = Reflect.getMetadata(PATH_METADATA, handler);
                    const requestMethodNum: number | undefined = Reflect.getMetadata(METHOD_METADATA, handler);

                    // Check if this method is an HTTP handler or SSE
                    const isSse = Reflect.getMetadata("__isSse__", handler);
                    if (routePath === undefined && requestMethodNum === undefined && !isSse) {
                        continue;
                    }

                    const httpMethod = isSse
                        ? "SSE"
                        : requestMethodNum !== undefined
                        ? HTTP_METHOD_NAMES[requestMethodNum] || "UNKNOWN"
                        : "GET";

                    const cleanControllerPath = controllerPath.replace(/^\/+|\/+$/g, "");
                    const resolvedRoutePath = Array.isArray(routePath) ? (routePath[0] || "") : (routePath || "");
                    const cleanRoutePath = typeof resolvedRoutePath === "string" ? resolvedRoutePath.replace(/^\/+|\/+$/g, "") : "";
                    const fullPath = "/" + [cleanControllerPath, cleanRoutePath].filter(Boolean).join("/");

                    // Check route metadata
                    const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
                        handler,
                        controllerClass,
                    ]);
                    const isAuthenticated = reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED_KEY, [
                        handler,
                        controllerClass,
                    ]);
                    const permissions = reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
                        handler,
                        controllerClass,
                    ]);

                    let classification: RouteInfo["classification"] = "UNCLASSIFIED";
                    if (isPublic) {
                        classification = "PUBLIC";
                    } else if (permissions && permissions.length > 0) {
                        classification = "PERMISSIONS";
                    } else if (isAuthenticated) {
                        classification = "AUTHENTICATED";
                    }

                    const tenantScoped =
                        fullPath.includes(":orgId") ||
                        fullPath.includes(":organizationId") ||
                        fullPath.includes("organizations/");

                    discoveredRoutes.push({
                        controller: controllerName,
                        handler: methodName,
                        httpMethod,
                        path: fullPath,
                        classification,
                        permissions: permissions && permissions.length > 0 ? permissions : undefined,
                        tenantScoped,
                    });
                }
            }
        }
    });

    afterAll(async () => {
        if (moduleRef) {
            await moduleRef.close();
        }
    });

    it("should discover all registered controller endpoints across the entire API", () => {
        expect(discoveredRoutes.length).toBeGreaterThan(50);
        console.log(`\n Total Discovered API Routes: ${discoveredRoutes.length}`);
    });

    it("should ensure 100% of routes have explicit security classification (NO UNCLASSIFIED ROUTES)", () => {
        const unclassified = discoveredRoutes.filter((r) => r.classification === "UNCLASSIFIED");

        if (unclassified.length > 0) {
            const errorReport = unclassified
                .map((r) => `  ❌ [${r.httpMethod}] ${r.path} -> ${r.controller}.${r.handler}()`)
                .join("\n");

            fail(
                `Found ${unclassified.length} UNCLASSIFIED route(s) in API. Every route must be annotated with @Public(), @Authenticated(), or @RequirePermissions(...):\n${errorReport}`
            );
        }

        expect(unclassified.length).toBe(0);
    });

    it("should generate and print the Route Authorization Matrix", () => {
        console.log("\n========================== ROUTE AUTHORIZATION MATRIX ==========================");
        console.log(
            "| Method | Path                                                     | Classification | Required Permissions / Metadata |"
        );
        console.log(
            "| :---   | :------------------------------------------------------- | :------------- | :------------------------------ |"
        );

        for (const route of discoveredRoutes) {
            const perms = route.permissions ? route.permissions.join(", ") : route.classification === "PUBLIC" ? "Public Access" : "Authenticated Session";
            const paddedMethod = route.httpMethod.padEnd(6, " ");
            const paddedPath = route.path.padEnd(56, " ");
            const paddedClass = route.classification.padEnd(14, " ");
            console.log(`| ${paddedMethod} | ${paddedPath} | ${paddedClass} | ${perms} |`);
        }
        console.log("================================================================================\n");

        expect(discoveredRoutes.every((r) => r.classification !== "UNCLASSIFIED")).toBe(true);
    });
});
