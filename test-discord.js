const notifier = require('./src/notifier');

async function test() {
    console.log("🚀 Testing Discord Notifier...");
    
    if (!process.env.DISCORD_WEBHOOK_URL) {
        console.error("❌ DISCORD_WEBHOOK_URL is not set in environment!");
        process.exit(1);
    }

    const dummyPlayer = {
        nickname: "TestPlayer",
        faceitUrl: "https://www.faceit.com/en/players/TestPlayer",
        avatar: "https://corporate.faceit.com/wp-content/uploads/icon-faceit-300x300.png",
        elo: 1337
    };

    const dummyMatch = {
        result: "W",
        map: "de_mirage",
        kd: "1.50",
        kills: 25
    };

    console.log("⏳ Sending test notification...");
    const success = await notifier.sendMatchNotification(dummyPlayer, dummyMatch);

    if (success) {
        console.log("✅ Test notification sent successfully!");
    } else {
        console.error("❌ Failed to send test notification.");
    }
}

test();
