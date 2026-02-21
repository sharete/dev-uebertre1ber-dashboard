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
        
        // Match Link
        const matchUrl = `https://www.faceit.com/en/cs2/room/${match.matchId}`;
        
        // Elo Diff
        const eloDiff = match.eloDiff !== undefined ? (match.eloDiff >= 0 ? ` (+${match.eloDiff})` : ` (${match.eloDiff})`) : "";
        
        let title = isWin ? "🏆 Sieg für " + player.nickname : "💀 Niederlage für " + player.nickname;
        if (match.score) title += ` (${match.score})`;

        const fields = [
            { name: "Map", value: match.map || "Unknown", inline: true },
            { name: "Score", value: match.score || "—", inline: true },
            { name: "Elo", value: `${player.elo}${eloDiff}`, inline: true },
            { name: "K/D", value: match.kd || "0.00", inline: true },
            { name: "Kills", value: `${match.kills}/${match.deaths}${match.assists ? " (" + match.assists + ")" : ""}`, inline: true },
            { name: "ADR", value: match.adr ? match.adr.toFixed(1) : "—", inline: true },
            { name: "HS %", value: match.hsPercent ? match.hsPercent + "%" : "—", inline: true },
            { name: "MVPs", value: match.mvps?.toString() || "0", inline: true },
            { name: "Match Link", value: `[Room](${matchUrl})`, inline: true }
        ];

        if (match.teammates && match.teammates.length > 0) {
            fields.push({ name: "Dashboard Teammates", value: match.teammates.join(", "), inline: false });
        }

        return {
            title: title,
            url: player.faceitUrl,
            color: color,
            thumbnail: { url: player.avatar || "https://corporate.faceit.com/wp-content/uploads/icon-faceit-300x300.png" },
            fields: fields,
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
