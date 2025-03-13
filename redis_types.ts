// deno-lint-ignore-file no-explicit-any
import type { Buffer } from "node:buffer";

export type RedisCommandArgument = string | Buffer;


export interface StreamMessageReply {
    id: RedisCommandArgument;
    message: Record<string, RedisCommandArgument>;
}

// alert to notify if a stream is not being read 
export interface Alert {
    type: string;
    source: string;
    message: string;
    timestamp: Date;
    value?: string | number;
    severity: "warning" | "critical" | "info";
}

class GroupInfo {
    name?: string;
    lastDeliveredId?: string; 
    entriesRead?: string
    lag?: number; 
    pelCount?: number;
    pending?: unknown[]; 
    consumers?: unknown[]

    // parse 
    constructor(arr: any) {
        this.name = arr[0];
        this.lastDeliveredId = arr[1];
        this.entriesRead = arr[2];
        this.lag = arr[3];
        this.pelCount = arr[4];
        this.pending = arr[5];
        this.consumers = arr[6];
    }  

}

export class XInfoStreamReply {
    name?: string = "?";
    length?: number;
    memoryUsage?: number;
    radixTreeKeys?: number;
    radixTreeNodes?: number;
    groups?: number;
    lastGeneratedId?: string | Buffer;
    maxDeletedEntryId?: string | Buffer;
    entriesAdded?: number;
    firstEntry?: any | null;
    lastEntry?: any | null;

    // parse array into properties assume nested
    constructor(arr: any) {
        this.length = arr[0];
        this.radixTreeKeys = arr[1];
        this.radixTreeNodes = arr[2];
        this.groups = arr[3];
        this.lastGeneratedId = arr[4];
        this.maxDeletedEntryId = arr[5];
        this.entriesAdded = arr[6];
        this.firstEntry = arr[7];
        this.lastEntry = arr[8];
    }
}

export interface XInfoGroupsReply {
    stream: string;
    name?: RedisCommandArgument;
    consumers?: number;
    pending?: number;
    lastDeliveredId?: RedisCommandArgument;
    entriesRead?: string;
    lag?: number;


    // // parse param array into properties assume nested 
    // constructor(arr: any) {
    //     this.name = arr[0];
    //     this.consumers = arr[1];
    //     this.pending = arr[2];
    //     this.lastDeliveredId = arr[3];
    // }

};

export class RedisStats {
    // latest snapshot of redis stats
    streamStats: XInfoStreamReply[] = [];
    groupStats: XInfoGroupsReply[] = [];
    server_info: any[] = [];

    // average counts per stream
    historicalAverages: { [key: string]: { total: number, count: number } } = {};
    alerts: Alert[] = [];
    resolvedAlerts: Alert[] = []; // new property to keep track of resolved alerts
    
}
// parse array of [key, value, key, value, ...] into object properties, both array and object  are dynamic
export function parseReply<T>(arr: any): T {
    const obj: any = {};
    for (let i = 0; i < arr.length; i += 2) {
        let key = arr[i];
        const value = arr[i + 1];
        // convert kebab-case to camelcase, assuming multiple words
        if (typeof key === 'string') {
            key = key.replace(/(-[a-z])/g, (match: string) => match.substring(1).toUpperCase());
        }

        if (Array.isArray(value)) {
            obj[key] = parseReply(value);
        }
        else {
            obj[key] = value;
        }

    }
    return obj as T;
}


