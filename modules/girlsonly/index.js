const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const cx = require("consola");
const storage = require("./storage");
const { registerFlows, sendGirlsOnlyStart } = require("./flows");

let girlsOnlyEnabled = false;
const VIP_GROUP_LINK = "https://t.me/+8O4iJdlADu02MzIx";

function toPdfSafeText(value) {
    return String(value || "")
        .replace(/[^\x20-\x7e]/g, " ")
        .replace(/[()\\]/g, "\\$&")
        .trim();
}

function buildSimpleReceiptPdfBuffer(lines) {
    const contentLines = [
        "BT",
        "/F1 11 Tf",
        "50 790 Td",
        "14 TL"
    ];

    const safeLines = lines.map((line) => toPdfSafeText(line)).filter(Boolean);
    for (let index = 0; index < safeLines.length; index += 1) {
        const line = safeLines[index];
        contentLines.push(`(${line}) Tj`);
        if (index < safeLines.length - 1) {
            contentLines.push("T*");
        }
    }
    contentLines.push("ET");

    const stream = contentLines.join("\n");
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        `<< /Length ${Buffer.byteLength(stream, "binary")} >>\nstream\n${stream}\nendstream`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let i = 0; i < objects.length; i += 1) {
        offsets.push(Buffer.byteLength(pdf, "binary"));
        pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, "binary");
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let i = 1; i <= objects.length; i += 1) {
        pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(pdf, "binary");
}

function createReceiptPdf(payment, profile) {
    const receiptsDir = path.join(storage.PAYMENTS_DIR, "receipts");
    fs.mkdirSync(receiptsDir, { recursive: true });
    const filePath = path.join(receiptsDir, `${payment.id}.pdf`);
    const boughtAt = new Date(payment.createdAt || Date.now()).toLocaleString("es-PE", {
        dateStyle: "medium",
        timeStyle: "short"
    });
    const receiptLines = [
        "Boleta de compra - BeneficioGirls",
        "------------------------------",
        `Nro Operacion: ${payment.id}`,
        `Fecha: ${boughtAt}`,
        `Producto: ${payment.profileName || payment.profileId || "-"}`,
        `Zona: ${profile?.locationLabel || `${profile?.cityName || payment.cityId || "-"} - ${profile?.provinceName || payment.provinceId || "-"}`}`,
        `Metodo: ${payment.paymentMethod || "-"}`,
        `Precio: ${profile?.price || payment.price || "-"}`,
        `Cliente Telegram: @${payment.username || "-"}`,
        `Cliente ID: ${payment.userId || "-"}`,
        `Contacto Entregado: ${[profile?.contactName || "", profile?.contactPhone || ""].filter(Boolean).join(" · ") || "-"}`,
        "Estado: Aprobado",
        "Gracias por tu compra."
    ];
    const pdf = buildSimpleReceiptPdfBuffer(receiptLines);
    fs.writeFileSync(filePath, pdf);
    return filePath;
}

function listFolderImages(folderName) {
    const folderPath = path.join(process.cwd(), folderName);
    if (!fs.existsSync(folderPath)) {
        return [];
    }
    return fs.readdirSync(folderPath)
        .filter((file) => /\.(jpg|jpeg|png|webp)$/i.test(file))
        .map((file) => path.join(folderPath, file));
}

async function sendFolderImages(bot, chatId, folderName) {
    const files = listFolderImages(folderName);
    for (const filePath of files) {
        await bot.telegram.sendPhoto(chatId, { source: filePath });
    }
}

async function sendPostSaleSafetyMessages(bot, payment) {
    const username = payment.username || "user";
    await bot.telegram.sendMessage(
        payment.chatId,
        `GRACIAS @${username} POR COMPRAR EN BENEFICIO GIRLS! 💗🙌🏻`
    );

    await bot.telegram.sendMessage(
        payment.chatId,
        [
            "MENSAJE DE PARTE DE LOS ADMINISTRADORES",
            "",
            "Se le muestra un ejemplos de como iniciar chat con una glambusina, ya el resto depende de ustedes 🫡",
            "",
            "Se les aconseja no adelantar dinero ni hacer encuentro en lugares cerrados, para evitar estafas."
        ].join("\n")
    );

    await sendFolderImages(bot, payment.chatId, "chat");

    await bot.telegram.sendMessage(
        payment.chatId,
        [
            "⚠️Importante ⚠️",
            "",
            "📌 Las muchachas no son conocidas mias, No mencionar el grupo o te bloquearan.",
            "",
            "📌 Iniciar el chat con un: Hola, nos conocimos en Glambu.",
            "",
            "📌 No se garantiza respuesta ni salida. No hay reembolsos.",
            "",
            "SUERTE ✨"
        ].join("\n")
    );
}

function downloadFile(url, destinationPath) {
    return new Promise((resolve, reject) => {
        const transport = url.startsWith("https:") ? https : http;
        const request = transport.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                downloadFile(response.headers.location, destinationPath).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`No se pudo descargar el archivo: ${response.statusCode}`));
                return;
            }
            const fileStream = fs.createWriteStream(destinationPath);
            response.pipe(fileStream);
            fileStream.on("finish", () => {
                fileStream.close(() => resolve(destinationPath));
            });
            fileStream.on("error", reject);
        });
        request.on("error", reject);
    });
}

function resolveApprovalAction(item, payment) {
    if (item.action === "approve_vip_add") {
        return "approve_vip_add";
    }
    if (item.action === "approve_contact") {
        return "approve_contact";
    }
    if (item.action === "approve") {
        return payment.paymentType === "vip" ? "approve_vip_add" : "approve_contact";
    }
    return item.action;
}

async function processApprovalQueue(bot) {
    const queue = storage.getApprovalQueue();
    for (const item of queue.items || []) {
        if (item.status !== "pending") {
            continue;
        }
        const payment = storage.getPayments().payments.find((entry) => entry.id === item.paymentId);
        if (!payment) {
            storage.markQueueItemProcessed(item.id);
            continue;
        }

        try {
            const action = resolveApprovalAction(item, payment);

            if (action === "approve_contact") {
                const profile = storage.getProfile(payment.profileId);

                storage.updatePayment(payment.id, {
                    status: "approved"
                });

                const contactLines = [
                    `Pago aprobado para ${payment.profileName}.`,
                    profile?.contactName ? `Contacto: ${profile.contactName}` : null,
                    profile?.contactPhone ? `Telefono: ${profile.contactPhone}` : null,
                    profile?.contactTelegram ? `Telegram: ${profile.contactTelegram}` : null
                ].filter(Boolean);

                await bot.telegram.sendMessage(payment.chatId, contactLines.join("\n"));

                const receiptPath = createReceiptPdf(payment, profile);
                storage.updatePayment(payment.id, {
                    receiptPath: path.relative(storage.ROOT_DIR, receiptPath)
                });

                await bot.telegram.sendDocument(payment.chatId, { source: receiptPath }, {
                    caption: "Boleta de compra - BeneficioGirls 🇵🇪"
                });

                await sendPostSaleSafetyMessages(bot, payment);
            } else if (action === "approve_vip_add") {
                storage.updatePayment(payment.id, {
                    status: "approved_vip_pending_add"
                });

                const receiptPath = createReceiptPdf(payment, null);
                storage.updatePayment(payment.id, {
                    receiptPath: path.relative(storage.ROOT_DIR, receiptPath)
                });

                await bot.telegram.sendDocument(payment.chatId, { source: receiptPath }, {
                    caption: "Boleta de compra - Pase VIP 💎"
                });

                await bot.telegram.sendMessage(
                    payment.chatId,
                    [
                        "PAGO VIP APROBADO ✅",
                        "Aqui tienes tu enlace para entrar al grupo VIP:",
                        VIP_GROUP_LINK,
                        "",
                        "Espere a que el administrador te acepte, se paciente!"
                    ].join("\n")
                );

                await sendPostSaleSafetyMessages(bot, payment);
            } else if (action === "refund") {
                storage.updatePayment(payment.id, {
                    status: "refunded",
                    refundReason: item.reason || ""
                });
                await bot.telegram.sendMessage(
                    payment.chatId,
                    item.reason
                        ? `Tu pago fue reembolsado. Motivo: ${item.reason}`
                        : "Tu pago fue reembolsado. Si necesitas ayuda, responde a este chat."
                );
            } else if (action === "reject") {
                storage.updatePayment(payment.id, {
                    status: "rejected",
                    rejectionReason: item.reason || ""
                });
                await bot.telegram.sendMessage(
                    payment.chatId,
                    item.reason
                        ? `Tu pago fue rechazado. Motivo: ${item.reason}`
                        : "Tu pago fue rechazado. Contacta al admin para mas detalles."
                );
            }

            storage.markQueueItemProcessed(item.id);
        } catch (error) {
            cx.error(`[GirlsOnly] approval queue\n${error?.stack || error}`);
        }
    }
}

function registerGirlsOnly(bot, deps = {}) {
    if (process.env.ENABLE_GIRLSONLY !== "1") {
        return;
    }

    try {
        girlsOnlyEnabled = true;
        storage.ensureStorage();

        const state = {
            pendingByUser: new Map()
        };

        const runtime = {
            storage,
            state,
            logger: deps.logger || cx,
            adminChatId: process.env.ADMIN_CHAT_ID || "",
            saveTelegramFile: async (fileId, extension, paymentId) => {
                const link = await bot.telegram.getFileLink(fileId);
                const safeExtension = extension || ".jpg";
                const filename = `${paymentId}${safeExtension}`;
                const absolutePath = path.join(storage.CAPTURES_DIR, filename);
                await downloadFile(String(link), absolutePath);
                return {
                    absolutePath,
                    relativePath: path.relative(storage.ROOT_DIR, absolutePath)
                };
            }
        };

        registerFlows(bot, runtime).catch((error) => {
            cx.error(`[GirlsOnly] flow registration\n${error?.stack || error}`);
        });

        const timer = setInterval(() => {
            processApprovalQueue(bot).catch((error) => {
                cx.error(`[GirlsOnly] queue interval\n${error?.stack || error}`);
            });
        }, 5000);

        if (typeof timer.unref === "function") {
            timer.unref();
        }

        cx.success("[GirlsOnly] modulo registrado");
    } catch (error) {
        cx.error(`[GirlsOnly] registro fallido\n${error?.stack || error}`);
    }
}

module.exports = registerGirlsOnly;
module.exports.registerGirlsOnly = registerGirlsOnly;
module.exports.isEnabled = function isEnabled() {
    return girlsOnlyEnabled && process.env.ENABLE_GIRLSONLY === "1";
};
module.exports.handleStart = async function handleStart(ctx) {
    await sendGirlsOnlyStart(ctx);
};
