// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@redis/client";
import { XInfoGroupsReply, XInfoStreamReply, parseReply, Alert, RedisStats } from "./redis_types.ts";
import { getTimestampFromId, roundDecimals, toMegabytes } from "./utils.ts";
import { RedisChecker } from "./redis_checker.ts";
import console from "node:console";
import { TeamsAlertSender } from "./alert_sender.ts";

const redis_url = Deno.env.get("REDIS_URL") || 'redis://localhost:6379';
const interval: number = parseInt(Deno.env.get("CHECK_INTERVAL_MINS") || '5') * 1000 * 60;

const client = createClient({ name: "watchful", url: redis_url, socket: { reconnectStrategy: false } });

client.on('error', (err: any) => console.log('Redis Client Error', err));

export class RedisStatsUpdater {

    stats: RedisStats = new RedisStats();
    totalAlertCount: number = 0;
    private alertSender: TeamsAlertSender;

    constructor() {
        this.alertSender = new TeamsAlertSender();
    }

    private updateHistoricalStats() {
        this.stats.streamStats.forEach(stream => {
            if (!stream.name || !stream.length) return;
            const averageData = this.stats.historicalAverages[stream.name] || { total: 0, count: 0 };
            averageData.total += stream.length;
            averageData.count++;
            this.stats.historicalAverages[stream.name] = averageData;
        });
    }


    private async getStreamStats() {
        const groupStats: XInfoGroupsReply[] = [];
        const streamStats: XInfoStreamReply[] = [];

        const streams = client.scanIterator({
            TYPE: 'stream',
            MATCH: '*',
            COUNT: 100
        });

        for await (const stream of streams) {
            let response = await client.sendCommand(["XINFO", "STREAM", stream]);
            const streamInfo: XInfoStreamReply = parseReply(response);
            streamInfo.name = stream;
            streamInfo.firstEntry = {};
            streamInfo.lastEntry = {};

            // Fetch memory usage for each stream
            response = await client.memoryUsage(stream);
            streamInfo.memoryUsage = toMegabytes(response!);

            // const streamGroups = await client.xInfoGroups(stream);
            response = await client.sendCommand(['XINFO', 'GROUPS', stream]);
            let groupsInfo: XInfoGroupsReply[] = [];

            if (Array.isArray(response)) {
                groupsInfo = response.map((r: any) => parseReply(r));
                groupsInfo.forEach((g) => {
                    g.stream = stream;
                    const streamLastGeneratedIdTimestamp = getTimestampFromId(streamInfo?.lastGeneratedId || "0");
                    const grouplastDeliveredIdTimestamp = getTimestampFromId(g.lastDeliveredId || "0");
                    const delayInMinutes = (streamLastGeneratedIdTimestamp - grouplastDeliveredIdTimestamp) / (1000 * 60);
                    g.lag = roundDecimals(delayInMinutes);
                });
            }

            groupStats.push(...groupsInfo);
            streamStats.push(streamInfo);
        }
        return { streamStats, groupStats };
    }

    private async getRedisServerStats() {
        const info = await client.info();
        const info_lines = info.split("\r\n")
            .filter(l => /version|human|perc/i.test(l))
            .map(l => l.split(":"));

        return info_lines;
    }

    private filterAlerts(primaryAlerts: Alert[], secondaryAlerts: Alert[] ): Alert[] {
        return primaryAlerts.filter(pa => !secondaryAlerts.some(sa => sa.type === pa.type && sa.source === pa.source));
    }

    async update() {
        let warnings: Alert[] = []; 
        try {
            await client.connect();

            const { streamStats, groupStats } = await this.getStreamStats();
            const server_info = await this.getRedisServerStats()

            await client.quit();

            this.stats.groupStats = groupStats;
            this.stats.streamStats = streamStats;
            this.stats.server_info = server_info;
            this.updateHistoricalStats();

            warnings = this.checkWarnings();
        }
        catch (e) {
            console.error("Error updating stats", e);
            warnings.push({
                type: "redis_down",
                source: "server",
                message: `Redis Server is down`,
                timestamp: new Date(),
                value: 0,
                severity: "critical"
            });
        }
        finally {
            const newAlerts = this.filterAlerts(warnings, this.stats.alerts);
            const resolvedAlerts = this.filterAlerts(this.stats.alerts, warnings);
            const unresolvedAlerts = this.filterAlerts(this.stats.alerts, resolvedAlerts);

            // Add new alerts to the count, subtract resolved alerts
            this.totalAlertCount += newAlerts.length;
            this.totalAlertCount -= resolvedAlerts.length;

            // Ensure totalAlertCount doesn't go negative
            if (this.totalAlertCount < 0) {
                this.totalAlertCount = 0;
            }
            
            this.stats.alerts = [...warnings];
            this.stats.resolvedAlerts = [...resolvedAlerts];

            console.log("Total Alert Count", this.totalAlertCount, "New Alerts", newAlerts.length, "Resolved Alerts", resolvedAlerts.length, "Unresolved Alerts", unresolvedAlerts.length);
            
            // const oneDayAgo = new Date();
            // oneDayAgo.setDate(oneDayAgo.getDate() - 1);
            // this.stats.resolvedAlerts = this.stats.resolvedAlerts.filter(alert => alert.timestamp > oneDayAgo);

            if (newAlerts.length > 0) {
                await this.alertSender.send(newAlerts, "New Redis Alerts", this.totalAlertCount);
            }
            if (resolvedAlerts.length > 0) {
                await this.alertSender.send(resolvedAlerts, "Resolved Redis Alerts", this.totalAlertCount);
            }
        }
    }

    checkWarnings(): Alert[] {
        const warnings = [
            ...RedisChecker.noReaders(this.stats),
            ...RedisChecker.slowConsumers(this.stats),
            ...RedisChecker.highConsumerPending(this.stats),
            ...RedisChecker.consumersNotInGroup(this.stats),
            ...RedisChecker.streamNotGettingData(this.stats),
            // **** Add more alerts here from RedisChecker **** //
        ];

        return warnings;
    }


}

export const redisStatsUpdater = new RedisStatsUpdater();

console.log("Checking every", interval);

const checkerTimer = setInterval(async () => {
    console.log("Checking Redis Stats");
    await redisStatsUpdater.update();
}, interval);

// shutdown gracefully and cleanup the client, useful on k8s and deno --watch mode
Deno.addSignalListener("SIGINT", () => { client.quit(); clearInterval(checkerTimer); Deno.exit(); });

