const CX = require("../global");
const cx = require("consola");
const logCommand = require("../log/logcommand");
const ytdl = require("ytdl-core");
const fs = require("fs");
const { Markup } = require('telegraf');
let videoURL;

async function video() {
    try {
        CX.command("mp4", async (ctx) => {
            logCommand(ctx);

            const mediaPath = "./videos/";
            if (!fs.existsSync(mediaPath)) {
                fs.mkdirSync(mediaPath);
            }

            try {
                const commandArgs = ctx.message.text.split(" ");
                if (commandArgs.length >= 2) {
                    //este identifica el link
                    videoURL = commandArgs.slice(1).join(" ");

                    //muestra en consola el link
                    cx.start(`Buscar en YouTube: ${videoURL} \n\n`);

                    ytdl.getInfo(videoURL).then(async (info) => {

                        const resultado = info.videoDetails.title;
                        const descripcion = info.videoDetails.description;
                        const categoria = info.videoDetails.category;
                        const duracion = info.videoDetails.lengthSeconds;

                        if (duracion <= '600') {
                            ctx.reply("🪻 Sumireko's await 🪻\n\nprocesando...");

                            const cleanedText = resultado.split(" ")[0].toLowerCase();
                            const title = cleanedText.replace(/[^\w\s]/g, "");

                            console.log(resultado)

                            ctx.reply(
                                `🪻 Titulo 🪻\n${resultado}\n\n🪻 Descripcion 🪻\n${descripcion}\n\n🪻 Categoria 🪻\n${categoria}`
                            );

                            // Crea el archivo de salida con el título del video como nombre
                            const outputFilePath = `videos/${title}.mp4`;
                            const outputStream = fs.createWriteStream(outputFilePath);

                            // Descarga el video y guarda en el archivo
                            const videoStream = ytdl(videoURL, {
                                quality: 'highest',
                                filter: 'audioandvideo',
                                format: 'mp4'
                            });
                            videoStream.pipe(outputStream);

                            outputStream.on("finish", async () => {
                                cx.success(
                                    `El video ${outputFilePath} se ha guardado correctamente, procediendo a enviar.\n\n`
                                );
                                await ctx.replyWithVideo({ source: outputFilePath }, { caption: resultado });
                                await fs.unlinkSync(outputFilePath);
                            });

                        } else if (duracion >= 601) {
                            const message = "El video dura más de 10 minutos. ¿Deseas continuar con la descarga?";
                            const keyboard = Markup.inlineKeyboard([
                                Markup.button.callback("Sí", "continua"),
                                Markup.button.callback("No", "cancelar")
                            ]);

                            ctx.reply(message, keyboard);
                        }
                    });
                } else {
                    ctx.reply('Debes proporcionar una busqueda después del comando.');
                }
            } catch (error) {
                console.warn("hubo un error en el procesamiento del link");
            }
        });

        try {
            CX.action("continua", async (ctx) => {
                ctx.answerCbQuery("Continuando con la descarga...");
                ctx.reply("Intentando realizar el porcedimiento del video...");
    
                ytdl.getInfo(videoURL).then(async (info) => {
                    // Obtiene el título del video
                    const resultado = info.videoDetails.title;
                    const descripcion = info.videoDetails.description;
                    const categoria = info.videoDetails.category;
    
                    const cleanedText = resultado.split(" ")[0].toLowerCase();
                    const title = cleanedText.replace(/[^\w\s]/g, "");
    
                    ctx.reply(
                        `🪻 Titulo 🪻\n${resultado}\n\n🪻 Descripcion 🪻\n${descripcion}\n\n🪻 Categoria 🪻\n${categoria}`
                    );
    
                    // Crea el archivo de salida con el título del video como nombre
                    const outputFilePath = `videos/${title}.mp4`;
                    const outputStream = fs.createWriteStream(outputFilePath);
    
                    // Descarga el video y guarda en el archivo
                    const videoStream = ytdl(videoURL, {
                        quality: 'highest',
                        filter: 'audioandvideo',
                        format: 'mp4'
                    });
                    videoStream.pipe(outputStream);
    
                    outputStream.on("finish", async () => {
                        cx.success(
                            `El video ${outputFilePath} se ha guardado correctamente, procediendo a enviar.\n\n`
                        );
                        await ctx.replyWithVideo({ source: outputFilePath }, { caption: resultado });
                        await fs.unlinkSync(outputFilePath);
                    });
                });
            });
        } catch (error) {
            ctx.reply('Ocurrio un error inesperado')
        }

        CX.action("cancelar", (ctx) => {
            ctx.answerCbQuery("Descarga cancelada.");
        });
    } catch (error) {
        cx.error("hay un error en mp3.js");
    }
}

module.exports = video;