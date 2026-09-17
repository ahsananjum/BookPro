export function buildTenantQueryKey(
    tenantId: string | undefined,
    resource: string,
    ...subKeys: (string | number | Record<string, unknown>)[]
): readonly [string, string, ...unknown[]] {
    const effectiveTenant = tenantId || "anonymous";
    return [effectiveTenant, resource, ...subKeys] as const;
}
