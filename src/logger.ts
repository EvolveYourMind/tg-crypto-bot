
import * as path from "path"
import * as fs from "fs"

const LOG_DB_PATH = path.resolve(__dirname, "..", "log_db.json");

type LogDatabase = TGBody[];

function read(): LogDatabase {
  return fs.existsSync(LOG_DB_PATH) ? JSON.parse(fs.readFileSync(LOG_DB_PATH).toString()) : { price_alert: [] }
}

function write(x: LogDatabase) {
  fs.writeFileSync(LOG_DB_PATH, JSON.stringify(x));
}

function update(f: (x: LogDatabase) => LogDatabase): LogDatabase {
  const res = f(read());
  write(res);
  return res;
}

export function SaveToLog(body: TGBody) {
  try {
    update(x => [...x, body]);
  } catch(err) {
    console.error(err);
  }
}