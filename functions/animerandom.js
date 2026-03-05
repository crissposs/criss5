const randomChar = require('anime-character-random');
const logCommand = require('../log/logcommand');
const CX = require("../global");
const cx = require('consola');

async function animerandom(message) {
    try {
            CX.command('randomanime', async (ctx) => {
                logCommand(ctx);
                
                try {
                    const haber = await randomChar.GetChar();
    
                    const animename = haber.AnimeName;
                    const name = haber.CharacterName;
                    const animeimg = haber.CharacterImage;
                    const japaname = haber.CharacterJapaneseName;
    
                    ctx.replyWithPhoto({ url: animeimg }, { caption: `🪻 **Personaje Random** 🪻\n\n🪻 **Anime** 🪻\n${animename}\n\n🪻 **Personaje** 🪻\n${name}\n\n🪻 **Jap** 🪻\n${japaname}` });
                    
                } catch (error) {
                    cx.warn('❌ debe ser el link de animerandom')
                    message.react('✖️');
                }
            });

    } catch (error) {
        cx.error('hubo un error en animerandom.js');
    }
};

module.exports = animerandom;