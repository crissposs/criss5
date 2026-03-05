const CX = require("../global");
const logCommand = require("../log/logcommand");
const cx = require('consola');

async function host() {
    try {
        CX.command('host', async (ctx) => {
            logCommand(ctx);

            try {
                const imageUrl = 'https://github.com/Yukyshiram/recursos_CDA/blob/main/boxmine.png?raw=true';

                const caption = `🪻El Mejor host🪻
🪷*Boxmine World*🪷
            
Este es el host ideal para correr el bot, tiene precios muy accesibles, el mas barato esdolares por mes y tambien hay servers gratuitos, siempre y cuando esten vacios en el nodoo 6
            
🪷link de discord🪷 https://discord.gg/Rxydysgy

🪷*Mes Gratis*🪷
            
Si creas una cuenta nueva en https://boxmineworld.com/
recibiras 300 boxcoins
            
Si pones el codigo promocional:
*MySofiCX*
ya que relativamente es sofia project pero para telegram
recibiras otras 300 boxcoins
            
Ahora tendras 600 lo que significa que puedes crear un servidor por un mes, totalmente gratis
            
*El codigo solo es utilizable 1 vez por persona, limite de 50 personas, multicuentas seran baneadas*
                `;
                ctx.replyWithPhoto({ url: imageUrl }, { caption: caption });
            } catch (error) {
                cx.warn("Hay un error");
            }
        });
    } catch (error) {
        cx.error('hay un error en host.js');
    }
}

module.exports = host;