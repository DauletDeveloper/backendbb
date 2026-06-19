const { db } = require("../../db.js");
const { barbershop } = require("../schema.js");
const { eq, and, ilike, gte, lte, desc } = require("drizzle-orm");

const LIMIT = 10;
const MAX_SEARCH_LENGTH = 100;
const ALMATY_TZ = "Asia/Almaty";
const getNowAlmaty = () => {
  return new Date(new Date().toLocaleString("en-US", { timeZone: ALMATY_TZ }));
};
const isSubscriptionActive = (shop) => {
  const now = getNowAlmaty();

  if (shop.subscriptionStatus === "active" && shop.subscriptionEndsAt) {
    return new Date(shop.subscriptionEndsAt) > now;
  }

  if (shop.subscriptionStatus === "trial" && shop.trialEndsAt) {
    return new Date(shop.trialEndsAt) > now;
  }

  return false;
};

const getShopsService = async ({ page = 1, location, openNow, minRating, search }) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const offset = (pageNum - 1) * LIMIT;

  if (location && location.length > MAX_SEARCH_LENGTH) {
    throw new Error(`Параметр location не должен превышать ${MAX_SEARCH_LENGTH} символов`);
  }
  if (search && search.length > MAX_SEARCH_LENGTH) {
    throw new Error(`Параметр search не должен превышать ${MAX_SEARCH_LENGTH} символов`);
  }

  const filters = [eq(barbershop.isVerified, true)];

  if (location) filters.push(ilike(barbershop.location, `%${location}%`));
  if (search)   filters.push(ilike(barbershop.name, `%${search}%`));

  if (openNow === "true") {
    const now = getNowAlmaty();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    filters.push(lte(barbershop.openHour, currentTime));
    filters.push(gte(barbershop.closeHour, currentTime));
  }

  const shops = await db.query.barbershop.findMany({
    where: and(...filters),
    limit: LIMIT,
    offset,
    orderBy: desc(barbershop.createdAt),
    with: {
      photos: true,
      contacts: true,
      barbers: true,
    },
  });
  let result = shops.filter(isSubscriptionActive);
  
  if (minRating !== undefined) {
    const min = parseFloat(minRating);
    if (!isNaN(min)) {
      result = result.filter((s) => s.rating != null && s.rating >= min);
    }
  }
  
  return { shops: result, page: pageNum, hasMore: shops.length === LIMIT };
};

const getShopService = async (shopId) => {
  const shop = await db.query.barbershop.findFirst({
    where: eq(barbershop.id, shopId),
    with: {
      photos: true,
      contacts: true,
      rates: true,
      services: true,
      barbers: true,
    },
  });
  if (!shop) return null;
  const { rates, ...rest } = shop;
  return { ...rest, ratings: rates };
};

module.exports = { getShopsService, getShopService };