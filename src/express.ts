import express from "express";
import config from "./config";

const app = express();
app.use(express.json());
app.listen(config.PORT, () => console.log("server starting on port : " + config.PORT));

export default app;