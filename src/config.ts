require("dotenv").config();
const config = {
	COINBASE_PASSPHRASE: process.env.COINBASE_PASSPHRASE!
	, COINBASE_SECRET: process.env.COINBASE_SECRET!
	, COINBASE_KEY_NAME: process.env.COINBASE_KEY_NAME!
	, TG_BOT_KEY: process.env.TG_BOT_KEY!
	, PORT: process.env.PORT || 80
	, WEBHOOK_URL: process.env.WEBHOOK_URL || null
	, NGROK_AUTH_TOKEN: process.env.NGROK_AUTH_TOKEN!
	, API_FLASH_KEY: process.env.API_FLASH_KEY
} 
const undef = Object.entries(config).filter(([_, v]) => v === undefined);
if(undef.length > 0) {
	console.error("Some config keys are undefiend: \n", undef.map(v => v[0]).join("\n"));
	process.exit(1);
}

export default config;