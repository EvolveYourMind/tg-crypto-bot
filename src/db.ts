import * as path from "path"
import * as fs from "fs"

const DB_PATH = path.resolve(__dirname, "..", "db.json");

export type Database = {
	price_alert: {
		id: string
		product_id: string
		target_price: number
		chat_id: number
	}[]
}

function read(): Database {
	return fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH).toString()) : { price_alert: [] }
}

function write(x: Database) {
	fs.writeFileSync(DB_PATH, JSON.stringify(x));
}

function update(f: (x: Database) => Database): Database {
	const res = f(read());
	write(res);
	return res;
}

export default {
	read
	, write
	, update
}