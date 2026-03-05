const chalk = require('chalk');
const cx = require("consola");
const magenta = chalk.magenta;
const whiteBright = chalk.whiteBright;

function logCommand(ctx) {
    if (ctx === undefined) {
        console.log('Se te olvido definir el ctx dentro de logCommand de alguna funcion');
    } else if (ctx?.message?.text === undefined) {

    } else {
        cx.info(whiteBright(`Comando `) + magenta(ctx.message.text) + whiteBright(` ejecutado \n`));
    }

}

module.exports = logCommand;
