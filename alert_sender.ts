import type { Alert } from "./redis_types.ts";
import { getEnvNamespace } from "./utils.ts";

export class TeamsAlertSender {
    private webhookUrl: string;

    constructor() {
        this.webhookUrl = Deno.env.get("TEAMS_WEBHOOK_URL") || '';
        if (!this.webhookUrl) {
            console.error("TEAMS_WEBHOOK_URL is not set");
        }
    }

    private getAlertStyle(title: string) {
        return title.includes("Resolved") ? { color: "good", emoji: "✅" } : { color: "warning", emoji: "⚠️" };
    }

    private async sendChunk(text: string, chunkTitle: string, count: number) {
        const style = this.getAlertStyle(chunkTitle);

        // Convert `text` into table rows with added borders
        const tableRows = text.split("\n").map((line) => {
            const [key, message, value] = line.split(":").map(item => item.trim());
            return {
                type: "ColumnSet",
                columns: [
                    {
                        type: "Column",
                        width: "auto",
                        items: [{
                            type: "TextBlock",
                            text: `${key}:`,
                            weight: "Bolder",
                            wrap: true,
                            spacing: "Small",
                        }],
                    },
                    {
                        type: "Column",
                        width: "stretch",
                        items: [{
                            type: "TextBlock",
                            text: `${message}${value ? `: ${value}` : ""}`,
                            wrap: true,
                            spacing: "Small",
                        }],
                    },
                ],
            };
        });

        const message = {
            type: "message",
            attachments: [
                {
                    contentType: "application/vnd.microsoft.card.adaptive",
                    content: {
                        type: "AdaptiveCard",
                        body: [
                            {
                                type: "ColumnSet",
                                columns: [
                                    {
                                        type: "Column",
                                        width: "auto",
                                        items: [
                                            {
                                                type: "Image",
                                                url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRS0K1pid1KZGG8O7heTiW4Hsck66g3Nsc0qg&s",
                                                width: "40px",
                                            },
                                        ],
                                    },
                                    {
                                        type: "Column",
                                        width: "stretch",
                                        items: [
                                            {
                                                type: "TextBlock",
                                                size: "extraLarge",
                                                weight: "Bolder",
                                                text: `${chunkTitle}`,
                                                color: style.color,
                                                wrap: true,
                                            },
                                        ],
                                    },
                                    {
                                        type: "Column",
                                        width: "auto",
                                        items: [
                                            {
                                                type: "TextBlock",
                                                size: "extraLarge",
                                                weight: "Bolder",
                                                text: `Count: ${count}`,
                                                color: style.color,
                                                wrap: true,
                                            },
                                        ],
                                    },
                                ],
                            },
                            {
                                type: "Container",
                                items: [
                                    ...tableRows, // Add table rows dynamically
                                ],
                            },
                        ],
                        actions: [
                            {
                                type: "Action.OpenUrl",
                                title: "View Details",
                                url: Deno.env.get("APP_URL") || "http://localhost:3000",
                                style: "positive",
                            },
                        ],
                        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                        version: "1.3",
                        msteams: {
                            width: "Full"
                        },
                    },
                },
            ],
        };

        console.log(`🚀 ~ Sending ${chunkTitle} to Teams channel`);
        const response = await fetch(this.webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(message)
        });

        if (!response.ok) {
            console.error(`Failed to send ${chunkTitle} to Teams channel`, await response.text());
        } else {
            console.log(`🚀 ~ Sent ${chunkTitle} to Teams channel`);
        }
    }

    async send(alerts: Alert[], title: string, count: number) {
        console.log(`🚀 ~ Sending ${title} to Teams channel on ${this.webhookUrl}`);
        if (!this.webhookUrl) return;

        const alertsText = alerts.map((alert) => {
            let alertType = alert.type.replace(/_/g, " ");
            alertType = alertType[0].toUpperCase() + alertType.slice(1);
            return `**${alertType}**: ${alert.message}`;
        }).join("\n");

        const maxMessageSize = 24000; // Teams message size limit
        const messageSize = alertsText.length;

        let start = 0;
        let end = maxMessageSize;
        let chunkIndex = 1;

        const alertTitle = `[${getEnvNamespace()}] ${title}`;

        while (start < messageSize) {
            const chunkText = alertsText.substring(start, end);
            const chunkTitle = messageSize <= maxMessageSize
                ? alertTitle
                : `${alertTitle} (Part ${chunkIndex})`;

            // Send the chunk
            await this.sendChunk(chunkText, chunkTitle, count);

            // Update start and end for the next chunk
            start = end;
            end += maxMessageSize;
            chunkIndex++;
        }
    }
}
