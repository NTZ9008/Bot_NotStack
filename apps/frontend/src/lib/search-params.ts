// Small URL parsers keep form-validation libraries out of the eager route tree.
export function stringSearch<K extends string>(search: Record<string, unknown>, keys: readonly K[]): Partial<Record<K, string>> {
    const result: Partial<Record<K, string>> = {};
    for (const key of keys) {
        const value = search[key];
        if (value === undefined) continue;
        if (typeof value !== 'string') throw new TypeError(`Invalid search parameter: ${key}`);
        result[key] = value;
    }
    return result;
}

export function positiveSearchId(value: unknown): number | undefined {
    try {
        const number = Number(value);
        return Number.isSafeInteger(number) && number > 0 ? number : undefined;
    } catch {
        return undefined;
    }
}
