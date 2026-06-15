const { db } = require("../../db");
const { favorites } = require("../schema");
const { eq, and, sql } = require("drizzle-orm");
 
const getFavoritesService = async (userId) => {
  const rows = await db.query.favorites.findMany({
    where: eq(favorites.userId, userId),
    with: {
      barbershop: {
        with: {
          photos: true,
          contacts: true,
          rates: true,
        },
      },
    },
    orderBy: (f, { desc }) => [desc(f.createdAt)],
  });
 
  return rows.map((row) => {
    const { rates, ...rest } = row.barbershop;
    return { ...rest, ratings: rates };
  });
};
 
const addFavoriteService = async (userId, barberId) => {
  const result = await db
    .insert(favorites)
    .values({ userId, barberId })
    .onConflictDoNothing()
    .returning();
 
  if (result.length === 0) {
    return { already: true };
  }
  return { added: true };
};
 
const removeFavoriteService = async (userId, barberId) => {
  const deleted = await db
    .delete(favorites)
    .where(
      and(
        eq(favorites.userId, userId),
        eq(favorites.barberId, barberId)
      )
    )
    .returning();
 
  if (deleted.length === 0) {
    return { removed: false, message: "Запись не найдена" };
  }
  return { removed: true };
};
 
const checkFavoriteService = async (userId, barberId) => {
  const row = await db.query.favorites.findFirst({
    where: and(
      eq(favorites.userId, userId),
      eq(favorites.barberId, barberId)
    ),
  });
  return { isFavorite: !!row };
};
 
module.exports = {
  getFavoritesService,
  addFavoriteService,
  removeFavoriteService,
  checkFavoriteService,
};