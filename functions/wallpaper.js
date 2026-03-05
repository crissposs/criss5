const CX = require('../global');
const cx = require('consola');
const logCommand = require('../log/logcommand');
const akaneko = require('akaneko');

async function wallpaper() {
    try {
        CX.command('wallphone', async (ctx) => {
            logCommand(ctx);
    
            try {
                const imageUrl = await akaneko.mobileWallpapers();
                const caption = '🪻Aqui tiene su wallpaper🪻';

                ctx.replyWithPhoto({ url: imageUrl }, { caption: caption });
            } catch (error) {
                cx.warn("Hay un error con el link de la libreria");
            }
        });
    } catch (error) {
        cx.error('hay un error en wallpaper.js');
    }
    
}

module.exports = wallpaper;