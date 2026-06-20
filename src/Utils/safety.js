import path from 'path';
import dotenv from 'dotenv';
import { dirname } from 'dirname-filename-esm';

const __dirname = dirname(import.meta);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = 
{
  MONGO_URI: process.env.MONGO_URI || '',
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  CLIENT_ID: process.env.CLIENT_ID || '',
  GUILD_ID: process.env.GUILD_ID || '',
  EVENT_TYPE: process.env.EVENT_TYPE || '',
  API_KEY: process.env.API_KEY || process.env.EVENT_TYPE || '',
  BACKEND_NAME: process.env.BACKEND_NAME || '',
  PORT: parseInt(process.env.PORT),
  XMPP_PORT: parseInt(process.env.XMPP_PORT),
  EU_IP: process.env.EU_IP || '',
  NAE_IP: process.env.NAE_IP || '',
  MATCHMAKER_IP: process.env.MATCHMAKER_IP || '',
  LOG_WEBHOOK: process.env.LOG_WEBHOOK || '',
  MAIN_SEASON: parseInt(process.env.MAIN_SEASON) || 0,
};

class Safety {
  constructor() {
    this.env = env;
  }
}

export default new Safety();