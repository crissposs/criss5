//librerias
const { Telegraf } = require('telegraf');

//require token
require('dotenv').config();
const TOKEN = process.env.BOT_TOKEN || process.env.TOKEN;

const CX = new Telegraf(TOKEN);

module.exports = CX
