const { db } = require("../../db.js");
const { users } = require("../schema.js");
const { eq, and } = require("drizzle-orm");

const VERIFY_TTL_MS = 5 * 60 * 1000;
 
const VerifyUser = async (userId) => {
  if (!userId) {
    throw new Error("userId обязателен");
  }
 
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));
 
  if (!user) {
    throw new Error("Ссылка недействительна или устарела");
  }
 
  if (user.isVerified) {
    throw new Error("Аккаунт уже подтверждён");
  }
 
  if (user.createdAt) {
    const elapsed = Date.now() - new Date(user.createdAt).getTime();
    if (elapsed > VERIFY_TTL_MS) {
      await db.delete(users).where(eq(users.id, userId));
      throw new Error("Ссылка для подтверждения устарела. Зарегистрируйтесь снова.");
    }
  }
 
  const [updatedUser] = await db
    .update(users)
    .set({ isVerified: true })
    .where(and(eq(users.id, userId), eq(users.isVerified, false)))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isVerified: users.isVerified,
    });
 
  if (!updatedUser) {
    throw new Error("Не удалось подтвердить аккаунт");
  }
 
  return updatedUser;
};
 
module.exports = { VerifyUser };