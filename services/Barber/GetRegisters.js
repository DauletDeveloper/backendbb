const { db } = require("../../db");
const { eq } = require("drizzle-orm");
const { register, barbershop } = require("../schema");

const getBarberRegisters = async (barberId) => {
  const [barber] = await db
    .select()
    .from(barbershop)
    .where(eq(barbershop.id, barberId));

  const registers = await db.query.register.findMany({
    where: eq(register.barberId, barberId),
    with: {
      user: {
        columns: { id: true, name: true, email: true },
      },
      barber: {
        columns: { id: true, name: true },
      },
    },
    orderBy: (r, { desc }) => [desc(r.date)],
  });

  return { barber, registers };
};

module.exports = { getBarberRegisters };