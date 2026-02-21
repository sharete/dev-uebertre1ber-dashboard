const fetch = globalThis.fetch;

class DiscordNotifier {
    constructor() {
        this.webhookUrl = (process.env.DISCORD_WEBHOOK_URL || "").trim();
        this.token = (process.env.DISCORD_TOKEN || "").trim();
        this.channelId = (process.env.DISCORD_CHANNEL_ID || "").trim();
    }

    /**
     * Sends a notification to Discord.
     * @param {object} player - Player profile data
     * @param {object} match - Match details/stats
     * @returns {Promise<boolean>}
     */
    async sendMatchNotification(player, match) {
        if (!this.webhookUrl && (!this.token || !this.channelId)) {
            console.warn("⚠️ Discord Notifier: No credentials found (WebHook or Token/ChannelID). Skipping notification.");
            return false;
        }

        const embed = this._formatMatchEmbed(player, match);

        if (this.webhookUrl) {
            return this._sendViaWebhook(embed);
        } else {
            return this._sendViaBot(embed);
        }
    }

    /**
     * Formats the match result into a Discord embed.
     * @private
     */
    _formatMatchEmbed(player, match) {
        const isWin = match.result === "W";
        const color = isWin ? 0x00FF00 : 0xFF0000; // Green for win, Red for loss
        const title = isWin ? "🏆 Sieg für " + player.nickname : "💀 Niederlage für " + player.nickname;
        
        return {
            title: title,
            url: player.faceitUrl,
            color: color,
            thumbnail: { url: player.avatar || "https://corporate.faceit.com/wp-content/uploads/icon-faceit-300x300.png" },
            fields: [
                { name: "Map", value: match.map || "Unknown", inline: true },
                { name: "K/D", value: match.kd || "0.00", inline: true },
                { name: "Kills", value: match.kills.toString(), inline: true },
                { name: "Elo", value: player.elo.toString(), inline: true }
            ],
            footer: { text: "Faceit Dashboard Update • " + new Date().toLocaleString("de-DE") }
        };
    }

    /** @private */
    async _sendViaWebhook(embed) {
        try {
            const res = await fetch(this.webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ embeds: [embed] })
            });
            return res.ok;
        } catch (e) {
            console.error("❌ Discord Webhook Error:", e.message);
            return false;
        }
    }

    /** @private */
    async _sendViaBot(embed) {
        try {
            const res = await fetch(`https://discord.com/api/v10/channels/${this.channelId}/messages`, {
                method: "POST",
                headers: {
                    "Authorization": `Bot ${this.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ embeds: [embed] })
            });
            return res.ok;
        } catch (e) {
            console.error("❌ Discord Bot Error:", e.message);
            return false;
        }
    }
}

module.exports = new DiscordNotifier();
