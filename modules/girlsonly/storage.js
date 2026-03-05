const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const MODELS_DIR = path.join(ROOT_DIR, "models");
const PAYMENTS_DIR = path.join(DATA_DIR, "payments");
const CAPTURES_DIR = path.join(PAYMENTS_DIR, "captures");

const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const MODELS_PATH = path.join(DATA_DIR, "models.json");
const PAYMENTS_PATH = path.join(DATA_DIR, "payments.json");
const APPROVAL_QUEUE_PATH = path.join(DATA_DIR, "approval-queue.json");
const MAX_PROFILE_PHOTOS = 10;

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function ensureJsonFile(filePath, fallback) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2) + "\n", "utf8");
    }
}

function ensureStorage() {
    ensureDir(DATA_DIR);
    ensureDir(MODELS_DIR);
    ensureDir(PAYMENTS_DIR);
    ensureDir(CAPTURES_DIR);
    ensureJsonFile(CONFIG_PATH, { cities: [] });
    ensureJsonFile(MODELS_PATH, { profiles: [] });
    ensureJsonFile(PAYMENTS_PATH, { payments: [] });
    ensureJsonFile(APPROVAL_QUEUE_PATH, { items: [] });
}

function readJson(filePath, fallback) {
    ensureStorage();
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        return fallback;
    }
}

function writeJson(filePath, value) {
    ensureStorage();
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(text) {
    return String(text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || makeId("item");
}

function getConfig() {
    return readJson(CONFIG_PATH, { cities: [] });
}

function saveConfig(config) {
    writeJson(CONFIG_PATH, config);
    return config;
}

function getProfiles() {
    const data = readJson(MODELS_PATH, { profiles: [] });
    const profiles = Array.isArray(data.profiles) ? data.profiles : [];
    return {
        ...data,
        profiles: profiles.map((profile) => normalizeProfileRead(profile))
    };
}

function saveProfiles(data) {
    writeJson(MODELS_PATH, data);
    return data;
}

function getPayments() {
    return readJson(PAYMENTS_PATH, { payments: [] });
}

function savePayments(data) {
    writeJson(PAYMENTS_PATH, data);
    return data;
}

function getApprovalQueue() {
    return readJson(APPROVAL_QUEUE_PATH, { items: [] });
}

function saveApprovalQueue(data) {
    writeJson(APPROVAL_QUEUE_PATH, data);
    return data;
}

function listCities() {
    return getConfig().cities || [];
}

function getCity(cityId) {
    return listCities().find((city) => city.id === cityId) || null;
}

function getProvince(cityId, provinceId) {
    const city = getCity(cityId);
    if (!city) {
        return null;
    }
    return (city.provinces || []).find((province) => province.id === provinceId) || null;
}

function upsertCity(name) {
    const config = getConfig();
    const city = {
        id: slugify(name),
        name,
        provinces: []
    };
    config.cities.push(city);
    return saveConfig(config);
}

function removeCity(cityId) {
    const config = getConfig();
    config.cities = (config.cities || []).filter((city) => city.id !== cityId);
    return saveConfig(config);
}

function upsertProvince(cityId, name) {
    const config = getConfig();
    const city = (config.cities || []).find((item) => item.id === cityId);
    if (!city) {
        throw new Error("Ciudad no encontrada");
    }
    city.provinces = city.provinces || [];
    city.provinces.push({
        id: slugify(name),
        name
    });
    return saveConfig(config);
}

function removeProvince(cityId, provinceId) {
    const config = getConfig();
    const city = (config.cities || []).find((item) => item.id === cityId);
    if (!city) {
        return saveConfig(config);
    }
    city.provinces = (city.provinces || []).filter((province) => province.id !== provinceId);
    return saveConfig(config);
}

function mergeCityCatalog(catalog = []) {
    const config = getConfig();
    config.cities = config.cities || [];
    let citiesAdded = 0;
    let districtsAdded = 0;

    for (const incomingCity of catalog) {
        const cityName = String(incomingCity?.name || "").trim();
        if (!cityName) {
            continue;
        }
        const cityId = slugify(cityName);
        let city = config.cities.find((item) => item.id === cityId);
        if (!city) {
            city = {
                id: cityId,
                name: cityName,
                provinces: []
            };
            config.cities.push(city);
            citiesAdded += 1;
        }
        city.provinces = city.provinces || [];
        const existingProvinceIds = new Set((city.provinces || []).map((province) => province.id));
        for (const incomingDistrict of incomingCity.districts || []) {
            const districtName = String(incomingDistrict || "").trim();
            if (!districtName) {
                continue;
            }
            const districtId = slugify(districtName);
            if (existingProvinceIds.has(districtId)) {
                continue;
            }
            city.provinces.push({
                id: districtId,
                name: districtName
            });
            existingProvinceIds.add(districtId);
            districtsAdded += 1;
        }
    }

    saveConfig(config);
    return {
        citiesAdded,
        districtsAdded,
        totalCities: (config.cities || []).length
    };
}

function listProfiles() {
    return getProfiles().profiles || [];
}

function getProfile(profileId) {
    return listProfiles().find((profile) => profile.id === profileId) || null;
}

function saveProfile(profile) {
    const data = getProfiles();
    data.profiles = data.profiles || [];
    const incomingPhotoPaths = extractProfilePhotoPaths(profile);
    const normalizedPhotoPaths = incomingPhotoPaths
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, MAX_PROFILE_PHOTOS);
    const normalizedProfile = {
        id: profile.id || makeId("profile"),
        name: profile.name || "",
        nationality: profile.nationality || "",
        cityId: profile.cityId || "",
        cityName: profile.cityName || "",
        provinceId: profile.provinceId || "",
        provinceName: profile.provinceName || "",
        locationLabel: profile.locationLabel || "",
        velitas: profile.velitas || "",
        gustos: profile.gustos || "",
        price: profile.price || "",
        description: profile.description || "",
        source: profile.source || "",
        vip: profile.vip === true,
        available: profile.available !== false,
        photoPath: normalizedPhotoPaths[0] || "",
        photoPaths: normalizedPhotoPaths,
        foto: normalizedPhotoPaths[0] || "",
        fotos: normalizedPhotoPaths,
        contactName: profile.contactName || "",
        contactPhone: profile.contactPhone || "",
        contactTelegram: profile.contactTelegram || ""
    };
    const index = data.profiles.findIndex((item) => item.id === normalizedProfile.id);
    if (index >= 0) {
        data.profiles[index] = normalizedProfile;
    } else {
        data.profiles.push(normalizedProfile);
    }
    saveProfiles(data);
    return normalizedProfile;
}

function extractProfilePhotoPaths(profile) {
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
    return unique;
}

function normalizeProfileRead(profile) {
    const normalizedPhotoPaths = extractProfilePhotoPaths(profile).slice(0, MAX_PROFILE_PHOTOS);
    return {
        ...profile,
        photoPath: normalizedPhotoPaths[0] || "",
        photoPaths: normalizedPhotoPaths,
        foto: normalizedPhotoPaths[0] || "",
        fotos: normalizedPhotoPaths
    };
}

function removeProfile(profileId) {
    const data = getProfiles();
    data.profiles = (data.profiles || []).filter((item) => item.id !== profileId);
    return saveProfiles(data);
}

function listProfilesByLocation(cityId, provinceId, options = {}) {
    const { vipOnly = false } = options;
    return listProfiles().filter((profile) => {
        const locationMatch = profile.cityId === cityId && profile.provinceId === provinceId;
        const availabilityMatch = profile.available !== false;
        const vipMatch = vipOnly ? profile.vip === true : true;
        return locationMatch && availabilityMatch && vipMatch;
    });
}

function createPayment(payment) {
    const data = getPayments();
    const nextPayment = {
        id: payment.id || makeId("pay"),
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...payment
    };
    data.payments = data.payments || [];
    data.payments.push(nextPayment);
    savePayments(data);
    return nextPayment;
}

function updatePayment(paymentId, patch) {
    const data = getPayments();
    const index = (data.payments || []).findIndex((item) => item.id === paymentId);
    if (index < 0) {
        return null;
    }
    data.payments[index] = {
        ...data.payments[index],
        ...patch,
        updatedAt: new Date().toISOString()
    };
    savePayments(data);
    return data.payments[index];
}

function removePayment(paymentId) {
    const data = getPayments();
    const current = (data.payments || []).find((item) => item.id === paymentId) || null;
    data.payments = (data.payments || []).filter((item) => item.id !== paymentId);
    savePayments(data);
    return current;
}

function enqueueApproval(item) {
    const queue = getApprovalQueue();
    queue.items = queue.items || [];
    queue.items.push({
        id: item.id || makeId("queue"),
        status: "pending",
        createdAt: new Date().toISOString(),
        ...item
    });
    saveApprovalQueue(queue);
    return queue.items[queue.items.length - 1];
}

function markQueueItemProcessed(queueId) {
    const queue = getApprovalQueue();
    const current = (queue.items || []).find((item) => item.id === queueId);
    if (!current) {
        return null;
    }
    current.status = "processed";
    current.processedAt = new Date().toISOString();
    saveApprovalQueue(queue);
    return current;
}

module.exports = {
    ROOT_DIR,
    DATA_DIR,
    MODELS_DIR,
    PAYMENTS_DIR,
    CAPTURES_DIR,
    CONFIG_PATH,
    MODELS_PATH,
    PAYMENTS_PATH,
    APPROVAL_QUEUE_PATH,
    ensureStorage,
    readJson,
    writeJson,
    makeId,
    slugify,
    getConfig,
    saveConfig,
    getProfiles,
    saveProfiles,
    getPayments,
    savePayments,
    getApprovalQueue,
    saveApprovalQueue,
    listCities,
    getCity,
    getProvince,
    upsertCity,
    removeCity,
    upsertProvince,
    removeProvince,
    mergeCityCatalog,
    listProfiles,
    getProfile,
    saveProfile,
    removeProfile,
    listProfilesByLocation,
    createPayment,
    updatePayment,
    removePayment,
    enqueueApproval,
    markQueueItemProcessed
};
