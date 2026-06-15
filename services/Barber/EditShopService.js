const { db } = require('../../db');
const { barbershop, photoURL, contacts, barber } = require('../schema');
const { eq, and, inArray, count } = require('drizzle-orm');

const MAX_PHOTOS = 10;
const MAX_BARBERS = 15;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PHONE_REGEX = /^\+?[1-9]\d{6,14}$/;
const VALID_CONTACT_TYPES = ['Номер телефона', 'Сайт', 'Instagram', 'WhatsApp', 'Telegram'];

const EditShopService = async (req) => {
  const userId = req.userId;
  const shopId = req.params.shopId;

  const [shop] = await db.select().from(barbershop).where(eq(barbershop.id, shopId));
  if (!shop) throw new Error('Барбершоп не найден');
  if (shop.ownerId !== userId) throw new Error('Нет доступа');

  const {
    name,
    description,
    workingDays,
    openHour,
    closeHour,
    registerPrice,
    location,
    lat,
    lng,
    contacts: newContacts,
    deletePhotoIds,
    newPhotoURLs,
    barbers: barbersPayload,
  } = req.body;

  const updateData = {};
  if (name !== undefined) {
    const trimmed = name.trim();
    if (trimmed.length < 3 || trimmed.length > 50) throw new Error('Название: от 3 до 50 символов');
    updateData.name = trimmed;
  }


  if (description !== undefined) {
    const trimmed = description.trim();
    if (trimmed.length > 0 && (trimmed.length < 15 || trimmed.length > 500)) {
      throw new Error('Описание: от 15 до 500 символов');
    }
    updateData.description = trimmed || null;
  }

  if (workingDays !== undefined) {
    const validDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const daysArray = Array.isArray(workingDays)
      ? workingDays
      : workingDays.split(',').map((d) => d.trim());
    const invalid = daysArray.filter((d) => !validDays.includes(d));
    if (invalid.length > 0) throw new Error(`Недопустимые рабочие дни: ${invalid.join(', ')}`);
    updateData.workingDays = daysArray.join(',');
  }


  if (openHour !== undefined) {
    if (!TIME_REGEX.test(openHour)) throw new Error('Время открытия: формат ЧЧ:ММ');
    updateData.openHour = openHour;
  }
  if (closeHour !== undefined) {
    if (!TIME_REGEX.test(closeHour)) throw new Error('Время закрытия: формат ЧЧ:ММ');
    updateData.closeHour = closeHour;
  }
  const effectiveOpen  = updateData.openHour  ?? shop.openHour;
  const effectiveClose = updateData.closeHour ?? shop.closeHour;
  if (effectiveOpen && effectiveClose && effectiveOpen >= effectiveClose) {
    throw new Error('Время открытия должно быть раньше времени закрытия');
  }

  if (registerPrice !== undefined) {
    const trimmed = String(registerPrice).trim();
    if (trimmed.length > 100) throw new Error('Стоимость записи: максимум 100 символов');
    updateData.registerPrice = trimmed || null;
  }

  if (location !== undefined) {
    if (!location.trim()) throw new Error('Локация не может быть пустой');
    updateData.location = location.trim();
  }


  if (lat !== undefined) {
    const latNum = Number(lat);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) throw new Error('Некорректная широта (lat)');
    updateData.lat = String(latNum);
  }
  if (lng !== undefined) {
    const lngNum = Number(lng);
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) throw new Error('Некорректная долгота (lng)');
    updateData.lng = String(lngNum);
  }

  if (Object.keys(updateData).length > 0) {
    await db.update(barbershop).set(updateData).where(eq(barbershop.id, shopId));
  }


  if (Array.isArray(deletePhotoIds) && deletePhotoIds.length > 0) {
    await db.delete(photoURL).where(
      and(
        inArray(photoURL.id, deletePhotoIds),
        eq(photoURL.barberId, shopId),
      )
    );
  }


  if (Array.isArray(newPhotoURLs) && newPhotoURLs.length > 0) {
    const [{ total }] = await db.select({ total: count() }).from(photoURL).where(eq(photoURL.barberId, shopId));
    if (Number(total) + newPhotoURLs.length > MAX_PHOTOS) {
      throw new Error(`Максимум ${MAX_PHOTOS} фотографий`);
    }
    for (const url of newPhotoURLs) {
      try { new URL(url); } catch { throw new Error(`Некорректный URL фото: ${url}`); }
    }
    await db.insert(photoURL).values(newPhotoURLs.map((url) => ({ url, barberId: shopId })));
  }


  if (req.files?.length) {
    if (req.files.length > MAX_PHOTOS) throw new Error(`Максимум ${MAX_PHOTOS} фотографий за раз`);
    await db.insert(photoURL).values(
      req.files.map((file) => ({ url: file.path || file.location, barberId: shopId }))
    );
  }


  if (newContacts !== undefined) {
    if (!Array.isArray(newContacts)) throw new Error('contacts должен быть массивом');
    if (newContacts.length > 10) throw new Error('Максимум 10 контактов');

    const sanitized = newContacts.map((c, i) => {
      if (!c.type || !VALID_CONTACT_TYPES.includes(c.type)) {
        throw new Error(`Контакт[${i}]: недопустимый тип "${c.type}"`);
      }
      if (!c.value || typeof c.value !== 'string' || !c.value.trim()) {
        throw new Error(`Контакт[${i}]: значение обязательно`);
      }
      if (c.type === 'Номер телефона') {
        if (!PHONE_REGEX.test(c.value.replace(/[\s\-()]/g, ''))) {
          throw new Error(`Контакт[${i}]: некорректный номер телефона`);
        }
      }
      if (c.type === 'Сайт') {
        try { new URL(c.value); } catch { throw new Error(`Контакт[${i}]: некорректный URL`); }
      }
      return { barberId: shopId, type: c.type, value: c.value.trim(), url: c.url?.trim() ?? null };
    });

    await db.delete(contacts).where(eq(contacts.barberId, shopId));
    if (sanitized.length > 0) await db.insert(contacts).values(sanitized);
  }


  if (Array.isArray(barbersPayload)) {
    if (barbersPayload.length > MAX_BARBERS) {
      throw new Error(`Максимум ${MAX_BARBERS} мастеров`);
    }


    for (const [i, b] of barbersPayload.entries()) {
      const trimmedName = b.name?.trim() ?? '';
      if (trimmedName.length < 2 || trimmedName.length > 50) {
        throw new Error(`Мастер[${i}]: имя от 2 до 50 символов`);
      }
      const exp = Number(b.experienceInYears);
      if (isNaN(exp) || exp < 0 || exp > 60) {
        throw new Error(`Мастер[${i}] «${trimmedName}»: опыт от 0 до 60 лет`);
      }
    }

    const existing = await db.select().from(barber).where(eq(barber.shopId, shopId));
    const existingIds = new Set(existing.map((b) => b.id));

    const toKeepIds   = new Set();
    const toInsert    = [];
    const toUpdate    = [];

    for (const b of barbersPayload) {
      const trimmedName = b.name.trim();
      const exp = Number(b.experienceInYears);

      if (b.id && existingIds.has(b.id)) {
        const old = existing.find((e) => e.id === b.id);
        if (old.name !== trimmedName || old.experienceInYears !== exp) {
          toUpdate.push({ id: b.id, name: trimmedName, experienceInYears: exp });
        }
        toKeepIds.add(b.id);
      } else {
        toInsert.push({ name: trimmedName, experienceInYears: exp, shopId });
      }
    }


    const toDeleteIds = existing
      .map((b) => b.id)
      .filter((id) => !toKeepIds.has(id));

    if (toDeleteIds.length > 0) {
      await db.delete(barber).where(inArray(barber.id, toDeleteIds));
    }
    for (const u of toUpdate) {
      await db.update(barber)
        .set({ name: u.name, experienceInYears: u.experienceInYears })
        .where(eq(barber.id, u.id));
    }
    if (toInsert.length > 0) {
      await db.insert(barber).values(toInsert);
    }

    const finalCount = (existing.length - toDeleteIds.length) + toInsert.length;
    await db.update(barbershop).set({ barbersCount: finalCount }).where(eq(barbershop.id, shopId));
  }

  const [updated] = await db.select().from(barbershop).where(eq(barbershop.id, shopId));
  return updated;
};

module.exports = { EditShopService };