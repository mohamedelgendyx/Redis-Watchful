import { Buffer } from "node:buffer";

const envNamespaces: string[] = ['local', 'alpha', 'qa'];

export const roundDecimals = (num: number, fractionDigits = 2): number => {
    const multiplier = 10 ** fractionDigits;
    return Math.round(num * multiplier) / multiplier;
};

export const toMegabytes = (btyes: number, fractionDigits = 2): number => roundDecimals(btyes / 1000 / 1000, fractionDigits);

export const getTimestampFromId = (id: string | Buffer): number => parseInt(id.toString().split('-')[0]);

export const getEnvNamespace = (): string => {
    const appUrl = Deno.env.get("APP_URL");
    const envName = envNamespaces.find(env => appUrl?.includes(env));
    return envName?.toUpperCase() || 'PROD';
};