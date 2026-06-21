const express = require("express");
const router = express.Router();
const { RegisterService } = require("../services/Register/RegisterService.js");
const { LoginService } = require("../services/Register/LoginService.js");
const { db } = require("../db.js");
const {
  users,
  register,
  barbershop,
  rating: ratingTable,
  notification,
} = require("../services/schema.js");
const { AddShopService } = require("../services/Barber/AddShopService.js");
const { and, eq, gte, lte, sql, desc } = require("drizzle-orm");
const {
  getShopsService,
  getShopService,
} = require("../services/Barber/GetShopService.js");
const jwt = require("jsonwebtoken");
const { getBarberRegisters } = require("../services/Barber/GetRegisters.js");
const { ilike, or, count } = require("drizzle-orm");
const { EditShopService } = require("../services/Barber/EditShopService");
const tokenService = require("../services/Register/TokenService.js");
const {
  RegisterShopService,
} = require("../services/Barber/RegisterService.js");
const {
  getPendingShopsService,
  approveShopService,
  rejectShopService,
  revokeShopService,
} = require("../services/Admin/Moderation.js");
const {
  sendNotificationService,
} = require("../services/Other/SendNotification.js");
const {
  EditUserService,
  EditEmailService,
} = require("../services/Register/EditUserService.js");
const {
  resetPasswordService,
  checkCodeService,
  newCodeGenerationService,
} = require("../services/Register/ResetPassword.js");
const {
  banUserService,
  unbanUserService,
} = require("../services/Admin/BanService.js");
const {
  getFavoritesService,
  addFavoriteService,
  removeFavoriteService,
} = require("../services/Other/FavouriteService.js");
const { VerifyUser } = require("../services/Register/VerifyService.js");
const {
  requireActiveSubscription,
} = require("../middleware/requireSubscription.js");
const {
  declineBarberService,
  declineUserService,
} = require("../services/Barber/DeclineRegister.js");
const rateLimit = require("express-rate-limit");
const {
  activateSubscription,
} = require("../services/Admin/SubscriptionService");


const safeError = (res, e, status = 500) => {
  console.error(e);
  const message =
    process.env.NODE_ENV === "production"
      ? "Внутренняя ошибка сервера"
      : e.message;
  return res.status(status).json({ status: "error", message });
};


const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    status: "error",
    message: "Слишком много попыток. Повторите через 15 минут.",
  },
});

const publicLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { status: "error", message: "Слишком много запросов." },
});

const registerShopLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 4,
  message: {
    status: "error",
    message: "Слишком много записей. Повторите через час.",
  },
});

const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    status: "error",
    message: "Слишком много запросов на смену email.",
  },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { status: "error", message: "Слишком много попыток сброса пароля." },
});

const addShopLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { status: "error", message: "Слишком много попыток добавления пароля." },
});

const refreshTokens = async (res, refreshToken) => {
  const decoded = tokenService.verifyRefreshToken(refreshToken);
  const [user] = await db.select().from(users).where(eq(users.id, decoded.id));
  if (!user || user.refreshToken !== refreshToken) {
    throw new Error("Не авторизован");
  }
  const tokens = tokenService.generateToken({
    id: user.id,
    email: user.email,
    role: user.role,
  });
  await tokenService.saveToken(user.id, tokens.refreshToken);
  res.cookie("accessToken", tokens.accessToken, {
    maxAge: 15 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.cookie("refreshToken", tokens.refreshToken, {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  return { userId: user.id, tokens };
};


const authMiddleware = async (req, res, next) => {
  try {
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET); // без вложенного try
        
        const rows = await db.execute(sql`
          SELECT id, is_banned, (banned_until IS NULL OR banned_until > NOW()) as still_banned
          FROM users WHERE id = ${decoded.id}
        `);
        const userData = rows[0];
        if (!userData)
          return res.status(401).json({ message: "Пользователь не найден" });
    
        if (userData.is_banned) {
          if (userData.still_banned)
            return res.status(403).json({ message: "Аккаунт заблокирован" });
          await db
            .update(users)
            .set({ isBanned: false, bannedUntil: null })
            .where(eq(users.id, decoded.id));
        }
        req.userId = decoded.id;
        req.userRole = decoded.role;
        return next();
      } catch (e) {
      }
    }
    if (!refreshToken) return res.status(401).json({ message: "Unauthorized" });
    
    try {
      const { userId, tokens } = await refreshTokens(res, refreshToken);
      const decoded = jwt.decode(tokens.accessToken);
      req.userId = userId;
      req.userRole = decoded?.role;
      return next();
    } catch (e) {
      return res.status(401).json({ message: e.message });
    }
  } catch (e) {
    return res.status(401).json({ message: e.message });
  }
};


const adminMiddleware = (req, res, next) => {
  if (!req.userRole || req.userRole !== "admin")
    return res.status(403).json({ message: "Нет доступа" });
  next();
};

const validateUUID = (paramName) => (req, res, next) => {
  const val = req.params[paramName];
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(val)) {
    return res
      .status(400)
      .json({ status: "error", message: `Некорректный ${paramName}` });
  }
  next();
};


router.get(
  "/barbers/:shopId",
  publicLimiter,
  validateUUID("shopId"),
  async (req, res) => {
    try {
      const { barber } = require("../services/schema");
      const barbers = await db
        .select({
          id: barber.id,
          name: barber.name,
          experienceInYears: barber.experienceInYears,
        })
        .from(barber)
        .where(eq(barber.barberId, req.params.shopId));

      return res.status(200).json({ status: "success", data: barbers });
    } catch (e) {
      return safeError(res, e);
    }
  },
);

router.post("/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    await RegisterService(name, email, password);
    return res
      .status(201)
      .json({ status: "success", message: "waiting for verify" });
  } catch (error) {
    return res.status(400).json({ status: "error", message: error.message });
  }
});

router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await LoginService(email, password);
    res.cookie("refreshToken", result.refreshToken, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
    res.cookie("accessToken", result.accessToken, {
      maxAge: 15 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
    return res
      .status(200)
      .json({ status: "success", data: { user: result.user } });
  } catch (error) {
    return res.status(400).json({ status: "error", message: error.message });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
  return res.status(200).json({ status: "success" });
});

router.get("/verify/:userId", validateUUID("userId"), async (req, res) => {
  try {
    const user = await VerifyUser(req.params.userId);
    const tokens = tokenService.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    await tokenService.saveToken(user.id, tokens.refreshToken);
    res.cookie("refreshToken", tokens.refreshToken, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
    res.cookie("accessToken", tokens.accessToken, {
      maxAge: 15 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
    res.status(200).json({ status: "success" });
  } catch (error) {
    return res.status(400).json({ status: "error", message: error.message });
  }
});

router.post(
  "/resetpassword/request",
  resetPasswordLimiter,
  async (req, res) => {
    try {
      const { email } = req.body;
      const result = await newCodeGenerationService(email);
      return res.status(result.retryAfterMs ? 429 : 200).json(result);
    } catch (error) {
      return safeError(res, error);
    }
  },
);

router.post("/resetpassword/check", resetPasswordLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    const result = await checkCodeService(email, otp);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return safeError(res, error);
  }
});

router.post(
  "/resetpassword/confirm",
  resetPasswordLimiter,
  async (req, res) => {
    try {
      const { email, otp, newPassword } = req.body;
      const result = await resetPasswordService(email, otp, newPassword);
      if (!result.success) return res.status(400).json(result);

      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      res.cookie("accessToken", result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 15 * 60 * 1000,
      });
      return res
        .status(200)
        .json({ success: true, message: result.message, user: result.user });
    } catch (error) {
      return safeError(res, error);
    }
  },
);

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isVerified: users.isVerified,
        isBanned: users.isBanned,
      })
      .from(users)
      .where(eq(users.id, req.userId));
    return res.json({ user });
  } catch (e) {
    return safeError(res, e);
  }
});

router.get("/user", authMiddleware, async (req, res) => {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.userId),
      columns: {
        name: true,
        email: true,
        role: true,
        isVerified: true,
        isBanned: true,
      },
      with: {
        registers: true,
        ownedBarbershops: true,
        rates: true,
      },
    });

    if (!user)
      return res.status(404).json({ message: "Пользователь не найден" });
    return res.status(200).json({ status: "success", data: user });
  } catch (e) {
    return safeError(res, e);
  }
});

router.patch("/user", authMiddleware, async (req, res) => {
  try {
    const result = await EditUserService(req);
    return res.status(200).json({ status: "success", data: result });
  } catch (e) {
    return res.status(400).json({ status: "error", message: e.message });
  }
});

router.patch("/user/email", authMiddleware, emailLimiter, async (req, res) => {
  try {
    await EditEmailService(req);
    return res
      .status(200)
      .json({ status: "success", message: "Письмо отправлено на новый email" });
  } catch (e) {
    return res.status(400).json({ status: "error", message: e.message });
  }
});

router.get("/getshops", publicLimiter, async (req, res) => {
  try {
    const {
      page = 1,
      location,
      verified,
      openNow,
      minRating,
      search,
    } = req.query;
    const result = await getShopsService({
      page: Number(page),
      location,
      verified,
      openNow,
      minRating,
      search,
    });
    return res.status(200).json({ status: "success", data: result });
  } catch (error) {
    return res.status(400).json({ status: "error", message: error.message });
  }
});

router.get(
  "/getshop/:shopId",
  publicLimiter,
  validateUUID("shopId"),
  async (req, res) => {
    try {
      const result = await getShopService(req.params.shopId);
      if (!result)
        return res
          .status(404)
          .json({ status: "error", message: "Барбершоп не найден" });
      return res.status(200).json({ status: "success", data: result });
    } catch (error) {
      return safeError(res, error);
    }
  },
);

router.post("/upload", addShopLimiter, authMiddleware, async (req, res) => {
  try {
    const result = await AddShopService(req);
    return res.status(200).json({
      status: "success",
      message: "Ждем одобрения модерацией",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({ status: "error", message: error.message });
  }
});

router.patch(
  "/shop/:shopId",
  authMiddleware,
  validateUUID("shopId"),
  requireActiveSubscription,
  async (req, res) => {
    try {
      const result = await EditShopService(req);
      return res.status(200).json({ status: "success", data: result });
    } catch (error) {
      const status =
        error.message === "Нет доступа"
          ? 403
          : error.message === "Барбершоп не найден"
            ? 404
            : 400;
      return res
        .status(status)
        .json({ status: "error", message: error.message });
    }
  },
);

router.get("/usershops", authMiddleware, async (req, res) => {
  try {
    const userShops = await db
      .select()
      .from(barbershop)
      .where(eq(barbershop.ownerId, req.userId));
    return res.status(200).json({ status: "success", data: userShops });
  } catch (e) {
    return safeError(res, e);
  }
});

router.post(
  "/newRegister",
  authMiddleware,
  registerShopLimiter,
  async (req, res) => {
    try {
      const result = await RegisterShopService(req);
      return res.status(201).json({ status: "success", data: result });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error.message });
    }
  },
);

router.get(
  "/slots/:barberId",
  publicLimiter,
  validateUUID("barberId"),
  async (req, res) => {
    const { barberId } = req.params;
    const { date } = req.query;

    if (!date) return res.status(400).json({ message: "date required" });
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date) || isNaN(Date.parse(date))) {
      return res
        .status(400)
        .json({ message: "Некорректный формат даты. Ожидается YYYY-MM-DD" });
    }

    const startOfDay = new Date(date + "T00:00:00.000+05:00");
    const endOfDay = new Date(date + "T23:59:59.999+05:00");

    const registers = await db.query.register.findMany({
      where: and(
        eq(register.barberId, barberId),
        eq(register.status, "active"),
        gte(register.date, startOfDay),
        lte(register.date, endOfDay),
      ),
    });
    const slots = registers.map((r) => {
      const t = typeof r.time === "string" ? r.time : String(r.time);
      return t.slice(0, 5);
    });

    res.json({ slots });
  },
);


router.get("/regabout/:id", authMiddleware, validateUUID("id"), async (req, res) => {
  try {
    const { id } = req.params;
    const [registerData] = await db
      .select()
      .from(register)
      .where(eq(register.id, id));

    if (!registerData)
      return res.status(404).json({ status: "error", message: "Не найдено" });
    if (registerData.userId !== req.userId)
      return res.status(403).json({ status: "error", message: "Нет доступа" });

    const [barberData] = await db
      .select()
      .from(barbershop)
      .where(eq(barbershop.id, registerData.barberId));
    return res
      .status(200)
      .json({ status: "success", data: registerData, barberData });
  } catch (e) {
    return safeError(res, e);
  }
});

router.get("/userregisters", authMiddleware, async (req, res) => {
  try {
    const userRegs = await db
      .select()
      .from(register)
      .where(eq(register.userId, req.userId));
    return res.status(200).json({ status: "success", data: userRegs });
  } catch (e) {
    return safeError(res, e);
  }
});

function calculateAsymmetricRating(currentRate, newRate, totalRatings) {
  const weight = Math.max(0.1, 1 / Math.log2(totalRatings + 2));
  const currentRating = Number(currentRate);
  let impact;
  if (newRate >= 4) {
    impact = (newRate - currentRating) * weight;
  } else if (newRate === 3) {
    impact = (newRate - currentRating) * weight * 1.3;
  } else {
    impact = (newRate - currentRating) * weight * 2.5;
  }
  const newRating = currentRating + impact;
  return Math.min(5.0, Math.max(1.0, newRating));
}

router.post(
  "/rateshop/:shopId",
  authMiddleware,
  validateUUID("shopId"),
  async (req, res) => {
    try {
      const userId = req.userId;
      const { shopId } = req.params;
      const { rate, description, registerId } = req.body;

      if (!rate) return res.status(400).json({ message: "rate обязателен" });
      const numRate = Number(rate);
      if (isNaN(numRate) || numRate < 1 || numRate > 5)
        return res.status(400).json({ message: "rate должен быть от 1 до 5" });

      if (!registerId)
        return res.status(400).json({ message: "registerId обязателен" });

      const [shop] = await db
        .select()
        .from(barbershop)
        .where(eq(barbershop.id, shopId));
      if (!shop)
        return res.status(404).json({ message: "Барбершоп не найден" });

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));
      if (!user)
        return res.status(404).json({ message: "Пользователь не найден" });

      const [existingRating] = await db
        .select()
        .from(ratingTable)
        .where(
          and(eq(ratingTable.raterId, userId), eq(ratingTable.ratedId, shopId))
        );
      if (existingRating)
        return res.status(403).json({ message: "Вы уже оставляли отзыв на этот барбершоп" });

      const [appointment] = await db
        .select()
        .from(register)
        .where(
          and(
            eq(register.id, Number(registerId)),
            eq(register.userId, userId),
          ),
        );
      if (!appointment)
        return res.status(403).json({ message: "У вас нет такой записи" });

      if (appointment.barberId !== shopId)
        return res.status(403).json({ message: "Запись не относится к этому барбершопу" });

      if (appointment.status === "declined")
        return res.status(403).json({ message: "Нельзя оставить отзыв на отменённую запись" });

      if (appointment.status === "rated")
        return res.status(403).json({ message: "Нельзя оставить 2 отзыва за одну запись" });

      if (appointment.status !== "active")
        return res.status(403).json({ message: "Отзыв можно оставить только на активную запись" });

      const appointmentDate = new Date(appointment.date);
      const [hours, minutes, seconds] = appointment.time.split(":").map(Number);
      appointmentDate.setHours(hours, minutes, seconds || 0, 0);

      const nowAlmaty = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Almaty" }),
      );
      const diffMinutes = (nowAlmaty - appointmentDate) / (1000 * 60);

      if (diffMinutes < 30) {
        const remainingMinutes = Math.ceil(30 - diffMinutes);
        return res.status(403).json({
          message: `Отзыв можно оставить через ${remainingMinutes} мин. после времени записи`,
        });
      }

      const result = await db.transaction(async (tx) => {
        const [newRating] = await tx
          .insert(ratingTable)
          .values({
            rate: numRate,
            description: description?.trim() || "Нет комментария",
            raterName: user.name || "Гость",
            raterId: userId,
            ratedId: shopId,
          })
          .returning();

        await tx
          .update(register)
          .set({ status: "rated" })
          .where(eq(register.id, Number(registerId)));

        const [{ count: ratingCount }] = await tx
          .select({ count: sql`COUNT(*)` })
          .from(ratingTable)
          .where(eq(ratingTable.ratedId, shopId));

        const totalRatings = Number(ratingCount);
        const currentRating = shop.rating ?? 5.0;
        const newShopRating = calculateAsymmetricRating(
          currentRating,
          numRate,
          totalRatings,
        );

        await tx
          .update(barbershop)
          .set({ rating: Number(newShopRating.toFixed(2)) })
          .where(eq(barbershop.id, shopId));

        return { newRating, newShopRating };
      });

      return res.status(201).json({
        status: "success",
        data: result.newRating,
        shopRating: Number(result.newShopRating.toFixed(2)),
      });
    } catch (e) {
      return safeError(res, e);
    }
  },
);

router.get("/favorites", authMiddleware, async (req, res) => {
  try {
    const data = await getFavoritesService(req.userId);
    res.json({ data });
  } catch (e) {
    return safeError(res, e);
  }
});

router.post("/addFavorite", authMiddleware, async (req, res) => {
  try {
    const { barberId } = req.body;
    if (!barberId)
      return res.status(400).json({ message: "barberId required" });
    const result = await addFavoriteService(req.userId, barberId);
    res.json(result);
  } catch (e) {
    return safeError(res, e);
  }
});

router.delete(
  "/removefavorite/:barberId",
  authMiddleware,
  validateUUID("barberId"),
  async (req, res) => {
    try {
      const result = await removeFavoriteService(
        req.userId,
        req.params.barberId,
      );
      res.json(result);
    } catch (e) {
      return safeError(res, e);
    }
  },
);

router.get("/notifications", authMiddleware, async (req, res) => {
  try {
    const notifications = await db
      .update(notification)
      .set({ isReaded: true })
      .where(eq(notification.to, req.userId))
      .returning();

    return res.status(200).json({
      status: "success",
      data: notifications,
      message: notifications.length ? undefined : "Уведомления отсутствуют",
    });
  } catch (e) {
    return safeError(res, e);
  }
});

router.get("/getunreaded", authMiddleware, async (req, res) => {
  try {
    const unreadNotifications = await db
      .select()
      .from(notification)
      .where(
        and(eq(notification.to, req.userId), eq(notification.isReaded, false)),
      )
      .limit(50);

    return res
      .status(200)
      .json({ status: "success", data: unreadNotifications });
  } catch (e) {
    return safeError(res, e);
  }
});

router.delete("/deletenotification/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await db
      .select()
      .from(notification)
      .where(
        and(eq(notification.id, Number(id)), eq(notification.to, req.userId)),
      );
    if (!existing)
      return res
        .status(404)
        .json({ status: "error", message: "Уведомление не найдено" });
    await db
      .delete(notification)
      .where(
        and(eq(notification.id, Number(id)), eq(notification.to, req.userId)),
      );
    return res
      .status(200)
      .json({ status: "success", message: "Уведомление удалено" });
  } catch (e) {
    return safeError(res, e);
  }
});

router.get("/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, search = "" } = req.query;
    const limit = 20;
    const offset = (Number(page) - 1) * limit;
    const where = search
      ? or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))
      : undefined;

    const [allUsers, [{ total }]] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          isVerified: users.isVerified,
          isBanned: users.isBanned,
          bannedUntil: users.bannedUntil,
        })
        .from(users)
        .where(where)
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(users).where(where),
    ]);
    return res.status(200).json({
      status: "success",
      data: allUsers,
      meta: {
        total: Number(total),
        page: Number(page),
        pages: Math.ceil(Number(total) / limit),
      },
    });
  } catch (e) {
    return safeError(res, e);
  }
});

router.patch(
  "/moderation/ban/:userId",
  authMiddleware,
  adminMiddleware,
  validateUUID("userId"),
  async (req, res) => {
    try {
      const { reason, durationMinutes } = req.body;
      if (!reason)
        return res.status(400).json({ message: "reason обязателен" });
      const user = await banUserService(
        req.params.userId,
        reason,
        durationMinutes,
      );
      res.json({ status: "success", data: user });
    } catch (e) {
      return safeError(res, e);
    }
  },
);

router.patch(
  "/moderation/unban/:userId",
  authMiddleware,
  adminMiddleware,
  validateUUID("userId"),
  async (req, res) => {
    try {
      const user = await unbanUserService(req.params.userId);
      res.json({ status: "success", data: user });
    } catch (e) {
      return safeError(res, e);
    }
  },
);

router.get(
  "/moderation/pending",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const shops = await getPendingShopsService();
      res.json({ data: shops });
    } catch (e) {
      return safeError(res, e);
    }
  },
);

router.patch(
  "/moderation/approve/:shopId",
  authMiddleware,
  adminMiddleware,
  validateUUID("shopId"),
  async (req, res) => {
    try {
      const shop = await approveShopService(req.params.shopId);
      res.json({ data: shop });
    } catch (e) {
      return safeError(res, e);
    }
  },
);

router.delete(
  "/moderation/reject/:shopId",
  authMiddleware,
  adminMiddleware,
  validateUUID("shopId"),
  async (req, res) => {
    try {
      const result = await rejectShopService(req.params.shopId);
      res.json(result);
    } catch (e) {
      return safeError(res, e);
    }
  },
);

router.patch(
  "/moderation/revoke/:shopId",
  authMiddleware,
  adminMiddleware,
  validateUUID("shopId"),
  async (req, res) => {
    try {
      const shop = await revokeShopService(req.params.shopId);
      res.json({ data: shop });
    } catch (e) {
      return safeError(res, e);
    }
  },
);

router.post("/sendnotif", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { to, title, description } = req.body;
    await sendNotificationService({ to, title, description });
    res.status(200).json({ message: "Уведомление отправлено" });
  } catch (e) {
    return safeError(res, e);
  }
});

router.get("/getbarberregs/:barberId", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { barberId } = req.params;

    const { barber, registers } = await getBarberRegisters(barberId);

    if (!barber) throw new Error("Не найден такой барбершоп");
    if (barber.ownerId !== userId) throw new Error("Нет доступа");

    return res.status(200).json({
      status: "success",
      data: { barber, registers },
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
});

router.patch(
  "/register/decline/:registerId",
  authMiddleware,
  async (req, res) => {
    try {
      const result = await declineUserService(
        Number(req.params.registerId),
        req.userId,
      );
      return res.status(200).json({ status: "success", data: result });
    } catch (e) {
      const status =
        e.message === "Нет доступа"
          ? 403
          : e.message === "Запись не найдена"
            ? 404
            : 400;
      return res.status(status).json({ status: "error", message: e.message });
    }
  },
);

router.patch(
  "/register/decline/barber/:registerId",
  authMiddleware,
  async (req, res) => {
    try {
      const result = await declineBarberService(
        Number(req.params.registerId),
        req.userId,
      );
      return res.status(200).json({ status: "success", data: result });
    } catch (e) {
      const status =
        e.message === "Нет доступа"
          ? 403
          : e.message === "Запись не найдена"
            ? 404
            : 400;
      return res.status(status).json({ status: "error", message: e.message });
    }
  },
);

router.post(
  "/admin/subscription/activate/:shopId",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    const { shopId } = req.params;
    if (!shopId) {
      return res.status(400).json({ error: "shopId обязателен" });
    }
    try {
      await activateSubscription(shopId);
      res.json({ success: true });
    } catch (err) {
      if (err.message === "Барбершоп не найден") {
        return res.status(404).json({ error: err.message });
      }
      return safeError(res, err);
    }
  },
);

router.patch("/report/:ratingId", authMiddleware, validateUUID("ratingId"), async (req, res) => {
  try {
    const userId = req.userId;
    const { shopId } = req.body;
    const { ratingId } = req.params;

    if (!shopId)
      return res.status(400).json({ status: "error", message: "shopId обязателен" });

    const [shop] = await db.select().from(barbershop)
      .where(eq(barbershop.id, shopId));

    if (!shop) throw new Error("Shop not found");
    if (shop.ownerId !== userId)
      throw new Error("Доступно только владельцу");

    const [rating] = await db.select().from(ratingTable)
      .where(eq(ratingTable.id, ratingId));

    if (!rating) throw new Error("Rating not found");
    if (rating.isReported || rating.reportedCount >= 1)
      throw new Error("Можно жаловаться только 1 раз на отзыв");

    await db.update(ratingTable).set({
      isReported: true,
      reportedCount: 1,
    }).where(eq(ratingTable.id, ratingId));

    res.status(200).json({ status: "success" });
  } catch (err) {
    return res.status(400).json({ status: "error", message: err.message });
  }
});

router.get("/getreports", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const data = await db.select().from(ratingTable)
      .where(eq(ratingTable.isReported, true));
    res.status(200).json({ status: "success", data });
  } catch (err) {
    return safeError(res, err);
  }
});

router.delete("/deletereport/:ratingId", authMiddleware, adminMiddleware, validateUUID("ratingId"), async (req, res) => {
  try {
    const { ratingId } = req.params;

    const [review] = await db
      .select({
        raterName: ratingTable.raterName,
        ownerId: barbershop.ownerId,
        ratedId: ratingTable.ratedId,
      })
      .from(ratingTable)
      .leftJoin(barbershop, eq(barbershop.id, ratingTable.ratedId))
      .where(eq(ratingTable.id, ratingId));

    await db.delete(ratingTable).where(eq(ratingTable.id, ratingId));

    if (review?.ratedId) {
      const remaining = await db
        .select({ rate: ratingTable.rate })
        .from(ratingTable)
        .where(eq(ratingTable.ratedId, review.ratedId));

      const newRating = remaining.length > 0
        ? remaining.reduce((sum, r) => sum + r.rate, 0) / remaining.length
        : 5.0;
      await db.update(barbershop)
        .set({ rating: newRating })
        .where(eq(barbershop.id, review.ratedId));
    }

    if (review?.ownerId) {
      await sendNotificationService({
        to: review.ownerId,
        title: "Отзыв удалён модерацией",
        description: `Модерация рассмотрела ваш запрос и удалила отзыв${review.raterName ? ` от ${review.raterName}` : ""} и вынесла решение удалить его. Данный отзыв не будет влиять на ваш рейтинг.`,
      }).catch(console.error);
    }

    res.status(200).json({ status: "success" });
  } catch (err) {
    return safeError(res, err);
  }
});


router.patch("/resolve/:ratingId", authMiddleware, adminMiddleware, validateUUID("ratingId"), async (req, res) => {
  try {
    const { ratingId } = req.params;

    const [review] = await db
      .select({
        raterName: ratingTable.raterName,
        ownerId: barbershop.ownerId,
      })
      .from(ratingTable)
      .leftJoin(barbershop, eq(barbershop.id, ratingTable.ratedId))
      .where(eq(ratingTable.id, ratingId));

    await db.update(ratingTable).set({
      isReported: false,
      reportedCount: 0,
    }).where(eq(ratingTable.id, ratingId));

    if (review?.ownerId) {
      await sendNotificationService({
        to: review.ownerId,
        title: "Решение по жалобе на отзыв",
        description: `Модерация не увидела нарушений в отзыве${review.raterName ? ` от ${review.raterName}` : ""}. Если хотите оспорить решение, свяжитесь с модерацией.`,
      }).catch(console.error);
    }

    res.status(200).json({ status: "success" });
  } catch (err) {
    return safeError(res, err);
  }
});
router.patch('/reportuser/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { registerId } = req.body;

    if (!registerId) return res.status(400).json({ message: 'registerId обязателен' });

    const [reg] = await db
      .select({ isReported: register.isReported })
      .from(register)
      .where(eq(register.id, registerId));

    if (!reg) return res.status(404).json({ message: 'Запись не найдена' });
    if (reg.isReported) return res.status(400).json({ message: 'Жалоба уже отправлена' });

    await db.update(register).set({ isReported: true }).where(eq(register.id, registerId));

    const [user] = await db
      .select({ warnsCount: users.warnsCount })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    const newWarns = user.warnsCount + 1;
    await db.update(users).set({ warnsCount: newWarns }).where(eq(users.id, userId));

    if (newWarns === 3) {
      await banUserService(userId, 'Превышен лимит предупреждений', 30 * 24 * 60);
    } else if (newWarns === 4) {
      await banUserService(userId, 'Повторные нарушения', 60 * 24 * 60);
    } else if (newWarns > 4) {
      await banUserService(userId, 'Систематические нарушения', null);
    }

    return res.status(200).json({ status: 'success', warnsCount: newWarns });
  } catch (e) {
    return safeError(res, e);
  }
});
router.get('/admin/getdashboarddata', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [
      [{ count: usersCount }],
      [{ count: barbershopsCount }],
      [{ count: registersCount }],
    ] = await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(barbershop),
      db.select({ count: count() }).from(register),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        usersCount,
        barbershopsCount,
        registersCount,
      },
    });
  } catch (error) {
    console.error('Dashboard data error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});
module.exports = router;
