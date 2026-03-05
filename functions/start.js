const CX = require("../global");
const logCommand = require('../log/logcommand');
const { Markup } = require('telegraf');
const girlsOnly = require("../modules/girlsonly");

async function start() {
    const sendStartMenu = async (ctx) => {
        logCommand(ctx);

        if (girlsOnly.isEnabled()) {
            await girlsOnly.handleStart(ctx);
            return true;
        }

        const caption = `🪻 CX Start 🪻---->
| Yo soy @SumirekoUsami_bot,
| https://t.me/SumirekoUsami_bot
|
| Este es mi menu
| /start
| /help
|
| /walldesktop
| /wallphone
| /randomanime
| /meme
| /wiki + busqueda
|
| for youtube
| /mp3 + link
| /mp4 + link
| 
| Translators
|
| /translator + texto
| /spanishto + identificador + texto
| /identificadores 
|------------->
        `;

        const botones = Markup.keyboard([
            ['/help', '/meme'],
            ['/wallphone', '/walldesktop'],
            ['/randomanime', '/identificadores']
        ]).resize();

        await ctx.reply(caption, botones);
        return true;
    };

    CX.start(async (ctx) => {
        await sendStartMenu(ctx);
    });

    CX.hears(/^\s*hola[!. ]*$/i, async (ctx) => {
        await sendStartMenu(ctx);
    });
}

module.exports = start;
