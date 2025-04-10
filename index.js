require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const http = require('http');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const MONITORED_CHANNEL_USERNAME = process.env.TELEGRAM_CHANNEL_USERNAME;
const WEB_SERVER_PORT = process.env.PORT || 3000;

const telegramBot = new Telegraf(TELEGRAM_BOT_TOKEN);

async function verifyDiscordWebhook() {
    try {
        const response = await axios.get(DISCORD_WEBHOOK_URL);

        if (response.status === 200 && response.data && response.data.id) {
            const webhookName = response.data.name || 'Nome webhook non impostato';
            console.log(`Webhook Discord valido. Nome: ${webhookName}`);
            return true;
        } else {
            console.error('Il webhook Discord non è valido o non è accessibile.');
            return false;
        }
    } catch (error) {
        console.error('Errore durante la verifica del webhook Discord:', error.message);
        return false;
    }
}

async function getBotInfo() {
    try {
        const botInfo = await telegramBot.telegram.getMe();
        console.log(`Bot avviato: @${botInfo.username} (${botInfo.first_name})`);
        return botInfo;
    } catch (error) {
        console.error('Errore durante il recupero delle informazioni del bot:', error.message);
        return null;
    }
}

async function onStart() {
    try {
        const botInfo = await getBotInfo();
        const isWebhookValid = await verifyDiscordWebhook();

        if (MONITORED_CHANNEL_USERNAME) {
            console.log(`Canale Telegram monitorato: ${MONITORED_CHANNEL_USERNAME}`);
        } else {
            console.log('Nessun canale specificato. Il bot risponderà a tutti i messaggi diretti.');
        }

        if (!isWebhookValid) {
            console.error('Il bot non può essere avviato correttamente a causa di un webhook Discord non valido.');
            process.exit(1);
        }

        console.log('Online.');
        startWebServer();
    } catch (error) {
        console.error('Errore durante l\'avvio del bot:', error.message);
        process.exit(1);
    }
}

function startWebServer() {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Bot is alive and running!\n');
    });

    server.listen(WEB_SERVER_PORT, () => {
        console.log(`Server web avviato sulla porta ${WEB_SERVER_PORT}.`);
    });
}

async function downloadFile(ctx) {
    try {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
        return response.data;
    } catch (error) {
        console.error('Errore nel download del file:', error);
        return null;
    }
}

async function sendToDiscord(ctx, message, photo = null) {
    try {
        const payload = {
            content: '<@1346512369102225560>',
            embeds: [{
                description: message,
                color: 16744256,
                footer: {
                    text: `t.me/poldonews • ${new Date().toLocaleDateString('it-IT')} • jes.is-a.dev`
                }
            }]
        };

        if (photo) {
            payload.embeds[0].image = { url: `attachment://photo.jpg` };
        }

        if (photo) {
            const formData = new FormData();
            formData.append('payload_json', JSON.stringify(payload));
            formData.append('file', photo, 'photo.jpg');

            await axios.post(DISCORD_WEBHOOK_URL, formData, {
                headers: formData.getHeaders()
            });
        } else {
            await axios.post(DISCORD_WEBHOOK_URL, payload);
        }

        console.log('Messaggio inviato a Discord con successo');
    } catch (error) {
        console.error('Errore nell\'invio a Discord:', error);
    }
}

telegramBot.on('photo', async (ctx) => {
    try {
        if (ctx.chat && ctx.chat.username !== MONITORED_CHANNEL_USERNAME.slice(1)) {
            console.log(`Messaggio ignorato: non proviene dal canale ${MONITORED_CHANNEL_USERNAME}`);
            return;
        }

        const message = ctx.message.caption || '';
        const photoFile = await downloadFile(ctx);

        if (photoFile) {
            await sendToDiscord(ctx, message, photoFile);
        }
    } catch (error) {
        console.error('Errore nel gestire il messaggio con foto:', error);
    }
});

telegramBot.on('text', async (ctx) => {
    try {
        if (ctx.chat && ctx.chat.username !== MONITORED_CHANNEL_USERNAME.slice(1)) {
            console.log(`Messaggio ignorato: non proviene dal canale ${MONITORED_CHANNEL_USERNAME}`);
            return;
        }

        const message = ctx.message.text || '';
        await sendToDiscord(ctx, message);
    } catch (error) {
        console.error('Errore nel gestire il messaggio di testo:', error);
    }
});

onStart().then(() => {
    telegramBot.launch({
        dropPendingUpdates: true
    });
});

process.once('SIGINT', () => {
    telegramBot.stop('SIGINT');
    process.exit(0);
});
process.once('SIGTERM', () => {
    telegramBot.stop('SIGTERM');
    process.exit(0);
});
