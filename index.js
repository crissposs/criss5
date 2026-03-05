const cx = require("consola");
const chalk = require("chalk");
const comandos = require("./commands");
const bot = require("./global");

const green = chalk.green;
const blue = chalk.italic.blue;
const yellow = chalk.yellow;

let launched = false;

comandos();
require("./modules/girlsonly")(bot);

bot.catch((error, ctx) => {
    const updateType = typeof ctx?.updateType === "function" ? ctx.updateType() : ctx?.updateType || "unknown";
    const fromId = ctx?.from?.id ?? "unknown";
    const username = ctx?.from?.username ?? "(sin username)";
    const chatId = ctx?.chat?.id ?? "unknown";

    cx.error(
        `Telegraf error\n` +
        `updateType: ${updateType}\n` +
        `from.id: ${fromId}\n` +
        `username: ${username}\n` +
        `chat.id: ${chatId}\n` +
        `${error?.stack || error}`
    );
});

process.on("uncaughtException", (error) => {
    cx.error(`uncaughtException\n${error?.stack || error}`);
});

process.on("unhandledRejection", (reason) => {
    cx.error(`unhandledRejection\n${reason?.stack || reason}`);
});

bot.use(async (ctx, next) => {
    const updateType = typeof ctx?.updateType === "function" ? ctx.updateType() : ctx?.updateType || "unknown";
    const chatType = ctx?.chat?.type ?? "unknown";
    const username = ctx?.from?.username ?? "(sin username)";
    const messageText = ctx?.message?.text ?? "(sin text)";
    const fromId = ctx?.from?.id ?? "unknown";
    const chatId = ctx?.chat?.id ?? "unknown";

    cx.info(`\nUpdate:` + yellow(updateType) + `\n` +
        green("Chat: ") + yellow(chatType) + `\n` +
        green("Usuario: ") + blue(username) + `\n` +
        green("Message: ") + blue(messageText) + `\n` +
        green("from.id: ") + blue(String(fromId)) + `\n` +
        green("chat.id: ") + blue(String(chatId)) + `\n`
    );

    return next();
});

async function startBot() {
    if (launched) {
        return bot;
    }
    await bot.launch();
    launched = true;
    cx.success("Sumireko se a iniciado exitosamente\n");
    return bot;
}

async function stopBot(reason = "shutdown") {
    if (!launched) {
        return;
    }
    bot.stop(reason);
    launched = false;
}

if (require.main === module) {
    startBot().catch((error) => {
        cx.error(`El error esta en:\n${error?.stack || error}`);
        process.exitCode = 1;
    });
}

module.exports = {
    bot,
    startBot,
    stopBot
};
