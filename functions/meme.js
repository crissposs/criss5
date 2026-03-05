const hispamemes = require("hispamemes");
const cx = require("consola");
const CX = require("../global");
const logCommand = require("../log/logcommand");


async function meme() {
    try {
        CX.command('meme', async (ctx) => {
            logCommand(ctx);
            try {
                let momo = hispamemes.meme();
                const caption = '🪻Toma tu meme🪻';

                ctx.replyWithPhoto({ url: momo }, { caption: caption });
            } catch (error) {
                cx.warn("Hay un error con el link de la libreria");
            }
        });
    } catch (error) {
        cx.error('hay un error en meme.js');
    }
}

module.exports = meme;