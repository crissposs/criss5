const CX = require("../global");
const cx = require("consola");
const logCommand = require("../log/logcommand");
const ytdl = require("ytdl-core");
const fs = require("fs");
const { Markup } = require('telegraf');
let videoURL;

async function audio() {
    try {
        CX.command("mp3", async (ctx) => {
            logCommand(ctx);

            const mediaPath = "./audios/";
            if (!fs.existsSync(mediaPath)) {
                fs.mkdirSync(mediaPath);
            }

            try {
                const commandArgs = ctx.message.text.split(" ");
                if (commandArgs.length >= 2) {
                    //este identifica el link
                    videoURL = commandArgs.slice(1).join(" ");

                    //muestra en consola el link
                    cx.start(`Buscar en YouTube para convertir: ${videoURL} \n\n`);

                    ytdl.getInfo(videoURL).then(async (info) => {
                        // Obtiene el título del video
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
                            const outputFilePath = `audios/${title}.mp3`;
                            const outputStream = fs.createWriteStream(outputFilePath);

                            // Descarga el video y guarda en el archivo
                            const audioStream = ytdl(videoURL, {
                                filter: "audioonly",
                                quality: "highestaudio",
                            });
                            audioStream.pipe(outputStream);

                            outputStream.on("finish", async () => {
                                cx.success(
                                    `El audio ${outputFilePath} se ha guardado correctamente, procediendo a enviar.\n`
                                );
                                await ctx.replyWithAudio({ source: outputFilePath });
                                await fs.unlinkSync(outputFilePath);
                            });
                        } else if (duracion >= 601) {
                            const message = "El video dura más de 10 minutos. ¿Deseas continuar con la descarga?";
                            const keyboard = Markup.inlineKeyboard([
                                Markup.button.callback("Sí", "continue"),
                                Markup.button.callback("No", "cancel")
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

        CX.action("continue", async(ctx) => {
            ctx.answerCbQuery("Continuando con la descarga...");
            ctx.reply("Intentando enviar el audio...");

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
                const outputFilePath = `audios/${title}.mp3`;
                const outputStream = fs.createWriteStream(outputFilePath);

                // Descarga el video y guarda en el archivo
                const audioStream = ytdl(videoURL, {
                    filter: "audioonly",
                    quality: "highestaudio",
                });
                audioStream.pipe(outputStream);

                outputStream.on("finish", async () => {
                    cx.success(
                        `El audio ${outputFilePath} se ha guardado correctamente, procediendo a enviar.\n\n`
                    );
                    await ctx.replyWithAudio({ source: outputFilePath });
                    await fs.unlinkSync(outputFilePath);
                });
            });
        });

        CX.action("cancel", (ctx) => {
            ctx.answerCbQuery("Descarga cancelada.");
        });
    } catch (error) {
        cx.error("hay un error en mp3.js");
    }
}

module.exports = audio;