const jwt = require('jsonwebtoken');
const { users } = require('../schema');
const { db } = require('../../db');
const { eq } = require('drizzle-orm');
class TokenService {
   generateToken(payload) {
      const accessToken = jwt.sign({ ...payload }, process.env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
      const refreshToken = jwt.sign({ ...payload }, process.env.JWT_REFRESH_SECRET, { expiresIn: "30d" });
      return { accessToken, refreshToken };
    }
    async saveToken(userId, refreshToken) {
      await db.update(users)
        .set({ refreshToken })
        .where(eq(users.id, userId));
    }
    verifyRefreshToken(token) {
      return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    }
    validateAccessToken(token) {
      try {
        return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      } catch {
        return null;
      }
    }
}
module.exports = new TokenService();