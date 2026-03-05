const fs = require("fs");
const path = require("path");

function truncate(value, maxLength) {
    return String(value).slice(0, maxLength);
}

function chunkButtons(buttons, columns) {
    const rows = [];
    for (let i = 0; i < buttons.length; i += columns) {
        rows.push(buttons.slice(i, i + columns));
    }
    return rows;
}

function buildMainKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: "CONTACTO 👤", callback_data: "go:menu:contact" }],
                [{ text: "GRUPO VIP 💎", callback_data: "go:menu:vip" }]
            ]
        }
    };
}

function cityKeyboard(cities) {
    const cityButtons = cities.map((city) => ({
        text: `${city.name.toUpperCase()} 🌎`,
        callback_data: `go:city:all:${truncate(city.id, 40)}`
    }));

    return {
        reply_markup: {
            inline_keyboard: [
                ...chunkButtons(cityButtons, 2),
                [{ text: "⬅ Volver", callback_data: "go:menu:root" }]
            ]
        }
    };
}

function provinceKeyboard(cityId, provinces) {
    const provinceButtons = provinces.map((province) => ({
        text: province.name,
        callback_data: `go:province:all:${truncate(cityId, 20)}:${truncate(province.id, 20)}`
    }));

    return {
        reply_markup: {
            inline_keyboard: [
                ...chunkButtons(provinceButtons, 2),
                [{ text: "⬅ Ciudades", callback_data: "go:back:cities" }]
            ]
        }
    };
}

function profileKeyboard(profile) {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: `Comprar a ${profile.name} ${pickEmoji()}`, callback_data: `go:buy:${truncate(profile.id, 40)}` }],
                [{ text: "⬅ Perfiles", callback_data: `go:back:profiles:${truncate(profile.cityId, 20)}:${truncate(profile.provinceId, 20)}` }]
            ]
        }
    };
}

function vipBuyKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Comprar pase VIP 💎", callback_data: "go:vip:buy" }],
                [{ text: "⬅ Volver", callback_data: "go:menu:root" }]
            ]
        }
    };
}

function paymentKeyboard(paymentId) {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: "PLIN", callback_data: `go:pay:${truncate(paymentId, 40)}:plin` }],
                [{ text: "TRANSFERENCIA BBVA", callback_data: `go:pay:${truncate(paymentId, 40)}:bbva` }],
                [{ text: "TRANSFERENCIA INTERBANK", callback_data: `go:pay:${truncate(paymentId, 40)}:interbank` }],
                [{ text: "⬅ Menu", callback_data: "go:menu:root" }]
            ]
        }
    };
}

function getBannerPath() {
    return path.join(process.cwd(), "banner", "baner.png");
}

function getPlinPath() {
    return path.join(process.cwd(), "plin.jpeg");
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

async function navigateMessage(ctx, text, extra) {
    await ctx.reply(text, extra);
}

function buildStartText(ctx) {
    const username = ctx.from?.username || ctx.from?.first_name || "user";
    return [
        "╭━━━━━━━━━━━━━━━⪨",
        `┊Bienvenid@ ${username} a BeneficioGirls 🇵🇪`,
        "┊Elige una opcion para continuar.",
        "╰━━━━━━━━━━━━━━━⪨",
        "📌 Visitanos en nuestra pagina web",
        "Https:beneficiosgirls.xyz",
        "",
        "Paso 1: Toca CONTACTO 👤 o GRUPO VIP 💎",
        "Paso 2: Elige tu zona o pase VIP",
        "Paso 3: Selecciona metodo de pago",
        "Paso 4: Envia tu captura y espera confirmacion"
    ].join("\n");
}

async function navigateStartMessage(ctx) {
    const text = buildStartText(ctx);
    const keyboard = buildMainKeyboard();
    const bannerPath = getBannerPath();

    if (fs.existsSync(bannerPath)) {
        await ctx.replyWithPhoto({ source: bannerPath }, {
            caption: text,
            ...keyboard
        });
        return;
    }

    await ctx.reply(text, keyboard);
}

function pickEmoji() {
    const emojis = ["😏", "🥵", "❤️‍🔥", "🍑", "🔥", "🔞", "😻", "💋", "😈"];
    return emojis[Math.floor(Math.random() * emojis.length)];
}

function extractProfilePhotos(profile) {
    const candidates = [];
    if (Array.isArray(profile?.photoPaths)) {
        candidates.push(...profile.photoPaths);
    }
    if (Array.isArray(profile?.fotos)) {
        candidates.push(...profile.fotos);
    }
    if (profile?.photoPath) {
        candidates.push(profile.photoPath);
    }
    if (profile?.foto) {
        candidates.push(profile.foto);
    }
    const seen = new Set();
    const unique = [];
    for (const item of candidates) {
        const normalized = String(item || "").trim();
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        unique.push(normalized);
    }
    return unique.slice(0, 10);
}

async function sendProfile(bot, chatId, profile) {
    const photoPaths = extractProfilePhotos(profile);

    const sourceKey = String(profile?.source || "").trim().toLowerCase();
    const sourceLabel = sourceKey === "seeking" ? "Seeking" : "Glambu";
    const lines = [
        "╭━━━━━━━━━━━⪨",
        `┊🙍‍♀️  Nombre : ${profile.name || "-"}`,
        "╰━━━━━━━━━━━⪨",
        `┊ 📌  Zona : ${profile.locationLabel || `${profile.cityName || profile.cityId} - ${profile.provinceName || profile.provinceId}`}`,
        `┊ 🎂  Velitas : ${profile.velitas || "-"}`,
        `┊ 💗  Contacto : ${sourceLabel}`,
        "┊━━━━━━━━━━━⪨",
        `┊ 💵  Precio : ${profile.price || "-"}`,
        "╰━━━━━━━━━━━⪨"
    ];

    const absolutePhotos = photoPaths
        .map((photo) => (path.isAbsolute(photo) ? photo : path.join(process.cwd(), photo)))
        .filter((absolutePhotoPath) => fs.existsSync(absolutePhotoPath));

    if (absolutePhotos.length > 1) {
        await bot.telegram.sendMediaGroup(
            chatId,
            absolutePhotos.map((absolutePhotoPath) => ({
                type: "photo",
                media: { source: absolutePhotoPath }
            }))
        );
        await bot.telegram.sendMessage(chatId, lines.join("\n"), profileKeyboard(profile));
        return;
    }

    if (absolutePhotos.length === 1) {
        await bot.telegram.sendPhoto(chatId, { source: absolutePhotos[0] }, {
            caption: lines.join("\n"),
            ...profileKeyboard(profile)
        });
        return;
    }

    await bot.telegram.sendMessage(chatId, lines.join("\n"), profileKeyboard(profile));
}

function buildProfileSelectionText(profiles) {
    if (!profiles.length) {
        return "No hay contactos disponibles en esta zona por ahora.";
    }
    return [
        "╭━━━━━━━━━━━━━━━━━━━━━━━━━⪨",
        "┊Estos son los contactos disponibles en esta zona 🗺",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━⪨"
    ].join("\n");
}

function methodsText() {
    return [
        "╭━━━━━━━━━⪨",
        "┊Metodos de Pago :",
        "╰━━━━━━━━━⪨"
    ].join("\n");
}

async function sendPaymentMethodInstructions(ctx, paymentMethod) {
    const plinPath = getPlinPath();
    const capturePrompt = [
        "╭━━━━━━━━━━━━━━━━━━━━━⪨",
        "┊SUBIR CAPTURA DEL PAGO PARA VERIFICAR",
        "╰━━━━━━━━━━━━━━━━━━━━━⪨"
    ].join("\n");

    if (paymentMethod === "plin") {
        if (fs.existsSync(plinPath)) {
            await ctx.replyWithPhoto({ source: plinPath });
        }
        await ctx.reply([
            "Nombre : Ali Pereyra",
            "",
            capturePrompt,
            "",
            "Aviso ‼️",
            "Verificar el Nombre antes de Pagar"
        ].join("\n"));
        return;
    }

    if (paymentMethod === "bbva") {
        await ctx.reply([
            "CCI : 0011 0814 020683537",
            "Nombre : Ali Pereyra",
            "",
            capturePrompt,
            "",
            "Aviso ‼️",
            "Verificar el Nombre antes de Pagar"
        ].join("\n"));
        return;
    }

    if (paymentMethod === "interbank") {
        await ctx.reply([
            "CCI : 898 3469134930",
            "Nombre : Ali Pereyra",
            "",
            capturePrompt,
            "",
            "Aviso ‼️",
            "Verificar el Nombre antes de Pagar"
        ].join("\n"));
        return;
    }

    await ctx.reply(capturePrompt);
}

async function sendVipIntro(ctx) {
    const groupImages = listFolderImages("grupo");
    if (groupImages.length > 1) {
        await ctx.telegram.sendMediaGroup(
            ctx.chat.id,
            groupImages.map((imagePath) => ({
                type: "photo",
                media: { source: imagePath }
            }))
        );
    } else if (groupImages.length === 1) {
        await ctx.replyWithPhoto({ source: groupImages[0] });
    }

    await ctx.reply([
        "╭━━━━━━━━━━━━━━⪨",
        "┊💵 Precio del VIP : S/ 50",
        "╰━━━━━━━━━━━━━━⪨",
        "",
        "       Beneficios de ser VIP",
        "",
        "📌 Acceso a todos los contactos disponibles",
        "📌 Garantia del Chat con la Saliente",
        "📌 Acceso a Descuentos y Promociones"
    ].join("\n"), vipBuyKeyboard());
}

async function sendGirlsOnlyStart(ctx) {
    await navigateStartMessage(ctx);
}

async function registerFlows(bot, runtime) {
    const {
        storage,
        state,
        logger,
        adminChatId,
        saveTelegramFile
    } = runtime;

    const safeLog = (label, error) => {
        logger.error(`[GirlsOnly] ${label}\n${error?.stack || error}`);
    };

    bot.action("go:menu:root", async (ctx) => {
        try {
            await ctx.answerCbQuery();
            await navigateStartMessage(ctx);
        } catch (error) {
            safeLog("menu root", error);
        }
    });

    bot.action("go:menu:contact", async (ctx) => {
        try {
            const cities = storage.listCities();
            await ctx.answerCbQuery();
            if (!cities.length) {
                await navigateMessage(ctx, "Todavia no hay ciudades configuradas.");
                return;
            }
            await navigateMessage(
                ctx,
                [
                    "Elige la ciudad de donde quieres el contacto",
                    "╭━━━━━━━━━━━━━━━━━━━━━━━━━⪨",
                    "┊Por el momento tenemos contactos de estas ciudades",
                    "╰━━━━━━━━━━━━━━━━━━━━━━━━━⪨"
                ].join("\n"),
                cityKeyboard(cities)
            );
        } catch (error) {
            safeLog("menu contact", error);
        }
    });

    bot.action("go:menu:vip", async (ctx) => {
        try {
            await ctx.answerCbQuery();
            await sendVipIntro(ctx);
        } catch (error) {
            safeLog("menu vip", error);
        }
    });

    bot.action("go:back:cities", async (ctx) => {
        try {
            const cities = storage.listCities();
            await ctx.answerCbQuery();
            await navigateMessage(
                ctx,
                [
                    "Elige la ciudad de donde quieres el contacto",
                    "╭━━━━━━━━━━━━━━━━━━━━━━━━━⪨",
                    "┊Por el momento tenemos contactos de estas ciudades",
                    "╰━━━━━━━━━━━━━━━━━━━━━━━━━⪨"
                ].join("\n"),
                cityKeyboard(cities)
            );
        } catch (error) {
            safeLog("back cities", error);
        }
    });

    bot.action(/^go:city:all:([^:]+)$/, async (ctx) => {
        try {
            const cityId = ctx.match[1];
            const city = storage.getCity(cityId);
            await ctx.answerCbQuery();
            if (!city) {
                await navigateMessage(ctx, "La ciudad ya no existe.");
                return;
            }
            const provinces = city.provinces || [];
            if (!provinces.length) {
                await navigateMessage(ctx, "Esa ciudad todavia no tiene provincias cargadas.");
                return;
            }
            await navigateMessage(
                ctx,
                `Selecciona una provincia de ${city.name}.`,
                provinceKeyboard(city.id, provinces)
            );
        } catch (error) {
            safeLog("city select", error);
        }
    });

    bot.action(/^go:province:all:([^:]+):([^:]+)$/, async (ctx) => {
        try {
            const cityId = ctx.match[1];
            const provinceId = ctx.match[2];
            const city = storage.getCity(cityId);
            const province = storage.getProvince(cityId, provinceId);
            const profiles = storage.listProfilesByLocation(cityId, provinceId, { vipOnly: false });
            await ctx.answerCbQuery();
            if (!city || !province) {
                await navigateMessage(ctx, "La ubicacion seleccionada ya no existe.");
                return;
            }
            await navigateMessage(ctx, buildProfileSelectionText(profiles));
            for (const profile of profiles) {
                await sendProfile(bot, ctx.chat.id, profile);
            }
        } catch (error) {
            safeLog("province select", error);
        }
    });

    bot.action(/^go:back:profiles:([^:]+):([^:]+)$/, async (ctx) => {
        try {
            const cityId = ctx.match[1];
            const provinceId = ctx.match[2];
            const profiles = storage.listProfilesByLocation(cityId, provinceId, { vipOnly: false });
            await ctx.answerCbQuery();
            await navigateMessage(ctx, buildProfileSelectionText(profiles));
            for (const profile of profiles) {
                await sendProfile(bot, ctx.chat.id, profile);
            }
        } catch (error) {
            safeLog("back profiles", error);
        }
    });

    bot.action(/^go:buy:([^:]+)$/, async (ctx) => {
        try {
            const profileId = ctx.match[1];
            const profile = storage.getProfile(profileId);
            await ctx.answerCbQuery();
            if (!profile || profile.available === false) {
                await navigateMessage(ctx, "Ese perfil ya no esta disponible.");
                return;
            }
            const draftPaymentId = storage.makeId("draft");
            state.pendingByUser.set(ctx.from.id, {
                stage: "choose_payment",
                type: "contact",
                profileId,
                draftPaymentId,
                chatId: ctx.chat.id
            });
            await navigateMessage(ctx, methodsText(), paymentKeyboard(draftPaymentId));
        } catch (error) {
            safeLog("buy profile", error);
        }
    });

    bot.action("go:vip:buy", async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const draftPaymentId = storage.makeId("draft");
            state.pendingByUser.set(ctx.from.id, {
                stage: "choose_payment",
                type: "vip",
                draftPaymentId,
                chatId: ctx.chat.id
            });
            await navigateMessage(ctx, methodsText(), paymentKeyboard(draftPaymentId));
        } catch (error) {
            safeLog("buy vip", error);
        }
    });

    bot.action(/^go:pay:([^:]+):([^:]+)$/, async (ctx) => {
        try {
            const draftPaymentId = ctx.match[1];
            const paymentMethod = ctx.match[2];
            const current = state.pendingByUser.get(ctx.from.id);
            await ctx.answerCbQuery();
            if (!current || current.draftPaymentId !== draftPaymentId) {
                await navigateMessage(ctx, "La compra expiro. Vuelve a intentarlo.");
                return;
            }

            state.pendingByUser.set(ctx.from.id, {
                ...current,
                stage: "awaiting_capture",
                paymentMethod
            });

            await sendPaymentMethodInstructions(ctx, paymentMethod);
        } catch (error) {
            safeLog("select payment", error);
        }
    });

    bot.on("photo", async (ctx, next) => {
        try {
            const pending = state.pendingByUser.get(ctx.from.id);
            if (!pending || pending.stage !== "awaiting_capture") {
                return next();
            }
            const photo = ctx.message.photo?.[ctx.message.photo.length - 1];
            if (!photo) {
                return next();
            }

            const paymentBase = {
                id: pending.draftPaymentId,
                chatId: ctx.chat.id,
                userId: ctx.from.id,
                username: ctx.from.username || "",
                paymentMethod: pending.paymentMethod,
                paymentType: pending.type,
                proofFileId: photo.file_id
            };

            if (pending.type === "contact") {
                const profile = storage.getProfile(pending.profileId);
                if (!profile || profile.available === false) {
                    state.pendingByUser.delete(ctx.from.id);
                    await ctx.reply("Ese perfil ya no esta disponible.");
                    return;
                }
                paymentBase.profileId = profile.id;
                paymentBase.profileName = profile.name;
                paymentBase.cityId = profile.cityId;
                paymentBase.provinceId = profile.provinceId;
            } else {
                paymentBase.profileId = "vip-pass";
                paymentBase.profileName = "Pase VIP";
            }

            const savedCapture = await saveTelegramFile(photo.file_id, ".jpg", pending.draftPaymentId);
            const payment = storage.createPayment({
                ...paymentBase,
                proofPath: savedCapture.relativePath
            });

            state.pendingByUser.delete(ctx.from.id);
            await ctx.reply("Captura recibida. Tu pago queda pendiente de revision manual.");

            if (adminChatId) {
                await bot.telegram.sendMessage(
                    adminChatId,
                    `Nuevo pago GirlsOnly\npaymentId: ${payment.id}\ntipo: ${payment.paymentType || "contact"}\nproducto: ${payment.profileName}\nfrom.id: ${payment.userId}\nchat.id: ${payment.chatId}\nmetodo: ${payment.paymentMethod}`
                );
            }
        } catch (error) {
            safeLog("photo payment", error);
            await ctx.reply("No pude procesar la captura. Intenta nuevamente.");
        }
    });

    bot.on("document", async (ctx, next) => {
        try {
            const pending = state.pendingByUser.get(ctx.from.id);
            if (!pending || pending.stage !== "awaiting_capture") {
                return next();
            }
            const document = ctx.message.document;
            if (!document || !String(document.mime_type || "").startsWith("image/")) {
                await ctx.reply("Envianos la captura como imagen.");
                return;
            }
            const extension = path.extname(document.file_name || "") || ".jpg";

            const paymentBase = {
                id: pending.draftPaymentId,
                chatId: ctx.chat.id,
                userId: ctx.from.id,
                username: ctx.from.username || "",
                paymentMethod: pending.paymentMethod,
                paymentType: pending.type,
                proofFileId: document.file_id
            };

            if (pending.type === "contact") {
                const profile = storage.getProfile(pending.profileId);
                if (!profile || profile.available === false) {
                    state.pendingByUser.delete(ctx.from.id);
                    await ctx.reply("Ese perfil ya no esta disponible.");
                    return;
                }
                paymentBase.profileId = profile.id;
                paymentBase.profileName = profile.name;
                paymentBase.cityId = profile.cityId;
                paymentBase.provinceId = profile.provinceId;
            } else {
                paymentBase.profileId = "vip-pass";
                paymentBase.profileName = "Pase VIP";
            }

            const savedCapture = await saveTelegramFile(document.file_id, extension, pending.draftPaymentId);
            const payment = storage.createPayment({
                ...paymentBase,
                proofPath: savedCapture.relativePath
            });

            state.pendingByUser.delete(ctx.from.id);
            await ctx.reply("Captura recibida. Tu pago queda pendiente de revision manual.");

            if (adminChatId) {
                await bot.telegram.sendMessage(
                    adminChatId,
                    `Nuevo pago GirlsOnly\npaymentId: ${payment.id}\ntipo: ${payment.paymentType || "contact"}\nproducto: ${payment.profileName}\nfrom.id: ${payment.userId}\nchat.id: ${payment.chatId}\nmetodo: ${payment.paymentMethod}`
                );
            }
        } catch (error) {
            safeLog("document payment", error);
            await ctx.reply("No pude procesar la captura. Intenta nuevamente.");
        }
    });

    bot.on("text", async (ctx, next) => {
        try {
            const pending = state.pendingByUser.get(ctx.from.id);
            if (!pending || pending.stage !== "awaiting_capture") {
                return next();
            }
            await ctx.reply("Estoy esperando una captura de pago en imagen.");
        } catch (error) {
            safeLog("awaiting text", error);
        }
    });
}

module.exports = {
    buildMainKeyboard,
    sendGirlsOnlyStart,
    registerFlows
};
