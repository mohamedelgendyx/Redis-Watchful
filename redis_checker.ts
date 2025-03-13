import { Alert, RedisStats } from "./redis_types.ts"
import { getTimestampFromId, roundDecimals } from "./utils.ts";


// list of predicates and filters to check the data returned by redis stats
export class RedisChecker {
    static noReaders(redisStats: RedisStats): Alert[] {
        return redisStats.groupStats
            .filter(group => group.consumers === 0)
            .map(group => ({
                type: "no_readers",
                source: `${group.stream}:${group.name}`,
                message: `No readers for stream ${group.stream}`,
                timestamp: new Date(),
                value: group.stream,
                severity: "warning"
            }));
    }

    static highMemoryUsage(redisStats: RedisStats): Alert[] {
        const memoryInfo = redisStats.server_info.find(info => info[0] === 'used_memory_human');
        if (memoryInfo) {
            const memoryUsage = parseFloat(memoryInfo[1]);
            if (memoryUsage > 100) { // example threshold
                return [{
                    type: "high_memory_usage",
                    source: "server",
                    message: `High memory usage: ${memoryUsage}MB`,
                    timestamp: new Date(),
                    value: memoryUsage,
                    severity: "warning"
                }];
            }
        }
        return [];
    }

    static slowConsumers(redisStats: RedisStats): Alert[] {
        return redisStats.groupStats
            .filter(group => group.lag! >= 2) // 2 minutes threshold
            .map(group => {
                return {
                    type: "slow_consumers",
                    source: `${group.stream}:${group.name}`,
                    message: `Consumer ${group.name} has a high reading delay for stream ${group.stream}: ${group.lag} minutes`,
                    timestamp: new Date(),
                    value: group.lag,
                    severity: "warning"
                };
            });
    }

    static highConsumerPending(redisStats: RedisStats): Alert[] {
        return redisStats.groupStats
            .filter(group => group.pending !== undefined && group.pending > 100) // example threshold
            .map(group => ({
                type: "high_consumer_pending",
                source: `${group.stream}:${group.name}`,
                message: `Consumer ${group.name} has high pending messages count for stream ${group.stream}: ${group.pending}`,
                timestamp: new Date(),
                value: group.pending,
                severity: "warning"
            }));
    }

    static highCPUUsage(redisStats: RedisStats): Alert[] {
        const cpuInfo = redisStats.server_info.find(info => info[0] === 'used_cpu_sys');
        if (cpuInfo) {
            const cpuUsage = parseFloat(cpuInfo[1]);
            if (cpuUsage > 80) { // example threshold
                return [{
                    type: "high_cpu_usage",
                    source: "server",
                    message: `High CPU usage: ${cpuUsage}%`,
                    timestamp: new Date(),
                    value: cpuUsage,
                    severity: "warning"
                }];
            }
        }
        return [];
    }

    static highConnectedClients(redisStats: RedisStats): Alert[] {
        const clientsInfo = redisStats.server_info.find(info => info[0] === 'connected_clients');
        if (clientsInfo) {
            const connectedClients = parseInt(clientsInfo[1], 10);
            if (connectedClients > 1000) { // example threshold
                return [{
                    type: "high_connected_clients",
                    source: "server",
                    message: `High number of connected clients: ${connectedClients}`,
                    timestamp: new Date(),
                    value: connectedClients,
                    severity: "warning"
                }];
            }
        }
        return [];
    }

    static highBlockedClients(redisStats: RedisStats): Alert[] {
        const blockedClientsInfo = redisStats.server_info.find(info => info[0] === 'blocked_clients');
        if (blockedClientsInfo) {
            const blockedClients = parseInt(blockedClientsInfo[1], 10);
            if (blockedClients > 10) { // example threshold
                return [{
                    type: "high_blocked_clients",
                    source: "server",
                    message: `High number of blocked clients: ${blockedClients}`,
                    timestamp: new Date(),
                    value: blockedClients,
                    severity: "warning"
                }];
            }
        }
        return [];
    }

    static consumersNotInGroup(redisStats: RedisStats): Alert[] {
        return redisStats.groupStats
            .filter(group => group.consumers === 0 && (group.pending ?? 0) > 0)
            .map(group => ({
                type: "consumers_not_in_group",
                source: `${group.stream}:${group.name}`,
                message: `Consumers not in group for stream ${group.stream}`,
                timestamp: new Date(),
                value: group.stream,
                severity: "warning"
            }));
    }

    static largeStreamSize(redisStats: RedisStats): Alert[] {
        return redisStats.streamStats
            .filter(stream => stream.length! > 100000) // example threshold
            .map(stream => ({
                type: "large_stream_size",
                source: stream.name!,
                message: `Stream ${stream.name} size is too large: ${stream.length} entries`,
                timestamp: new Date(),
                value: stream.length,
                severity: "warning"
            }));
    }

    static highStreamMemoryUsage(redisStats: RedisStats): Alert[] {
        return redisStats.streamStats
            .filter(stream => stream.memoryUsage! > 500) // 500MB threshold
            .map(stream => ({
                type: "high_stream_memory_usage",
                source: stream.name!,
                message: `Stream ${stream.name} memory usage is too high: ${stream.memoryUsage}MB`,
                timestamp: new Date(),
                value: stream.memoryUsage,
                severity: "warning"
            }));
    }

    static highPrecUsage(redisStats: RedisStats): Alert[] {
        const exceededPercInfo = redisStats.server_info
            .filter(info => info[0].includes("perc") && parseFloat(info[1]) > 80) // 80% threshold
            .map(info => {
                let metricName = info[0].replace(/_/g, ' ').replace('perc', 'percentage');
                metricName = metricName[0].toUpperCase() + metricName.slice(1);
                return [metricName, info[1]];
            });
        return exceededPercInfo
            .map(info => ({
                type: "high_perc_usage",
                source: "server",
                message: `${info[0]} is too high: ${info[1]}`,
                timestamp: new Date(),
                value: info[1],
                severity: "warning"
            }));
    }

    static streamSizeAboveAverage(redisStats: RedisStats): Alert[] {
        return redisStats.streamStats
            .filter(stream => {
                if (!stream.name || !stream.length) return false;
                const averageData = redisStats.historicalAverages[stream.name] || { total: 0, count: 0 };
                const average = averageData.count > 0 ? averageData.total / averageData.count : 0;
                redisStats.historicalAverages[stream.name] = {
                    total: averageData.total + stream.length,
                    count: averageData.count + 1
                };
                return stream.length > average * 1.2; // example threshold: 50% above average
            })
            .map(stream => ({
                type: "stream_size_above_average",
                source: stream.name!,
                message: `Stream ${stream.name} size is significantly above its historical average: ${stream.length} entries`,
                timestamp: new Date(),
                value: stream.length,
                severity: "warning"
            }));
    }

    static streamNotGettingData(redisStats: RedisStats): Alert[] {
        const now = new Date();
        return redisStats.streamStats
            .filter(stream => {
                const lastGeneratedIdTimestamp = getTimestampFromId(stream?.lastGeneratedId || "0");
                const timeDiff = now.getTime() - lastGeneratedIdTimestamp;
                return timeDiff > 1000 * 60 * 60 * 24; // example threshold: 24 hours
            })
            .map(stream => {
                const lastGeneratedIdTimestamp = getTimestampFromId(stream?.lastGeneratedId || "0");
                const hoursWithoutData = roundDecimals((now.getTime() - lastGeneratedIdTimestamp) / (1000 * 60 * 60));
                return {
                    type: "stream_not_getting_data",
                    source: stream.name!,
                    message: `Stream ${stream.name} has not received any data for a long time: ${hoursWithoutData} hours`,
                    timestamp: new Date(),
                    value: hoursWithoutData,
                    severity: "warning"
                };
            });
    }
}