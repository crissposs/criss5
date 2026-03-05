const animerandom = require("./functions/animerandom");
const meme = require("./functions/meme");
const start = require("./functions/start");
const audio = require("./functions/mp3");
const video = require("./functions/mp4");
const translator = require("./functions/translator");
const walldes = require("./functions/walldes");
const wallpaper = require("./functions/wallpaper");
const wikia = require("./functions/wiki");
const spanishto = require("./functions/spanishto");
const identificador = require("./functions/identificador");
const helper = require("./functions/help");
const host = require("./functions/host");

async function comandos() {
    try {
        //start
        start();

        //help
        helper();

        //commands
        wallpaper();
        walldes();
        animerandom();
        meme();
        wikia();
        audio();
        video();
        translator();
        spanishto();
        identificador();
        host();
    } catch (error) {
        console.error('Ocurrio un error en uno de los comandos');
    }
}

module.exports = comandos;