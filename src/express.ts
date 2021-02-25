import express from "express";
import config from "./config";

const app = express();
app.use(express.json());
app.listen(config.PORT, () => console.log("server starting on port : " + config.PORT));

let HOST_URL = "";
export function getHostUrl() {
	return HOST_URL;
}
export function setHostUrl(url: string) {
	HOST_URL = url;
}

export default app;