import app from "./express";
import { setWebhook } from "./telegram";
import ngrok from "ngrok";
import config from "./config";
import Bot from "./bot";

const bot = new Bot();

app.post("/", (req, res) => {
	res.send("ok");
	const body: TGBody = req.body;
	if(body.message.text) {
		bot.handleCommand(body.message.text, body);
	}
});

async function main() {
	try {
		const tunnelUrl = config.WEBHOOK_URL ?? await ngrok.connect({ authtoken: config.NGROK_AUTH_TOKEN, addr: config.PORT });
		await setWebhook(tunnelUrl);
		console.log("HTTPS Tunnel: ", tunnelUrl);
	} catch(err) {
		console.error("FATAL ERROR: ", err);
		await ngrok.disconnect().catch(console.error);
		console.log("Rebooting in 5 sec. Probably you should restart");
		setTimeout(main, 5000);
	}
}
main();