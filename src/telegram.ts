import config from "./config";
import fetch from "node-fetch";
import FormData from "form-data";

export function sendMessage(chat_id: string | number, text: string) {
	return fetch(`https://api.telegram.org/bot${config.TG_BOT_KEY}/sendMessage?chat_id=${chat_id}&text=${text}`);
}

export function sendPhoto(chat_id: string | number, text: string, photoUrl: string) {
	const form = new FormData();
	form.append("chat_id", chat_id);
	form.append("caption", text);
	form.append("photo", photoUrl);
	return fetch(`https://api.telegram.org/bot${config.TG_BOT_KEY}/sendPhoto`, {
		method: "POST",
		body: form
	});
}

export function setWebhook(url: string) {
	console.log("Setting TG webhook");
	return fetch(`https://api.telegram.org/bot${config.TG_BOT_KEY}/setWebhook`, {
		method: "post"
		, body: JSON.stringify({ url: encodeURI(url) })
		, headers: { "content-type": "application/json" }

	})
		.then((res) => res.json())
		.then(res => console.log("TG Webhook: ", res.ok))
}

export default {
	setWebhook
	, sendMessage
	, sendPhoto
}