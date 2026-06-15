const { db } = require('../../db');
const { users } = require('../db/schema');
const { eq, sql } = require('drizzle-orm');

const addCashService = async (email, amount) => {
  try {
    if (!amount || amount <= 0) {
      throw new Error('Сумма пополнения должна быть больше нуля');
    }
    const [updatedUser] = await db.update(users)
      .set({ 
        moneyCount: sql`${users.moneyCount} + ${amount}` 
      })
      .where(eq(users.email, email))
      .returning(); 

    if (!updatedUser) {
      throw new Error('Пользователь не найден');
    }

    return { 
      message: `Баланс пользователя ${email} успешно пополнен на ${amount}. Новый баланс: ${updatedUser.moneyCount}` 
    };
  }
  catch (error) {
    throw new Error(error.message);
  }
}

module.exports = { addCashService };
