const { db } = require('../../db');
const { barbershop, contacts, photoURL, barber, service } = require('../schema');

const MAX_PHOTOS = 10;
const MAX_BARBERS = 15;
const MAX_SERVICES = 20;

const AddShopService = async (req) => {
  const {
    name, description, city, district, address,
    lat, lng, openTime, closeTime, days, photos,
    phone, website, registerPrice, barbers, services,
  } = req.body;
  const ownerId = req.userId;
  if (!name?.trim())      throw new Error('Название обязательно');
  if (!city?.trim())      throw new Error('Город обязателен');
  if (!address?.trim())   throw new Error('Адрес обязателен');
  if (!phone?.trim())     throw new Error('Телефон обязателен');
  if (!openTime?.trim())  throw new Error('Время открытия обязательно');
  if (!closeTime?.trim()) throw new Error('Время закрытия обязательно');
  if (lat == null || lat === '') throw new Error('Широта обязательна');
  if (lng == null || lng === '') throw new Error('Долгота обязательна');

  if (!Array.isArray(photos) || photos.length === 0) {
    throw new Error('Загрузите минимум 1 фото');
  }

  const barbersArray = Array.isArray(barbers) ? barbers : [];
  if (barbersArray.length === 0) throw new Error('Добавьте минимум 1 мастера');

  const servicesArray = Array.isArray(services) ? services : [];
  if (servicesArray.length === 0) throw new Error('Добавьте минимум 1 услугу');

  if (!days || (Array.isArray(days) ? days.length === 0 : !days.trim())) {
    throw new Error('Рабочие дни обязательны');
  }

  const trimmedName = name.trim();
  if (trimmedName.length < 3 || trimmedName.length > 50) {
    throw new Error('Название: от 3 до 50 символов');
  }


  if (description?.trim().length > 0) {
    const trimmedDesc = description.trim();
    if (trimmedDesc.length < 15 || trimmedDesc.length > 500) {
      throw new Error('Описание: от 15 до 500 символов');
    }
  }


  const trimmedPrice = registerPrice?.trim() ?? '';
  if (trimmedPrice.length > 100) {
    throw new Error('Стоимость записи: максимум 100 символов');
  }


  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(openTime))  throw new Error('Время открытия: формат ЧЧ:ММ (например 09:00)');
  if (!timeRegex.test(closeTime)) throw new Error('Время закрытия: формат ЧЧ:ММ (например 21:00)');
  if (openTime >= closeTime)      throw new Error('Время открытия должно быть раньше времени закрытия');

  const validDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const daysArray = Array.isArray(days) ? days : days.split(',').map((d) => d.trim());
  const invalidDays = daysArray.filter((d) => !validDays.includes(d));
  if (invalidDays.length > 0) throw new Error(`Недопустимые рабочие дни: ${invalidDays.join(', ')}`);

  const phoneRegex = /^\+?[1-9]\d{6,14}$/;
  if (!phoneRegex.test(phone.replace(/[\s\-()]/g, ''))) {
    throw new Error('Некорректный номер телефона');
  }

  if (website) {
    try { new URL(website); }
    catch { throw new Error('Некорректный URL сайта'); }
  }


  const latNum = Number(lat);
  if (isNaN(latNum) || latNum < -90 || latNum > 90) throw new Error('Некорректная широта (lat)');
  const lngNum = Number(lng);
  if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) throw new Error('Некорректная долгота (lng)');

  if (photos.length > MAX_PHOTOS) throw new Error(`Максимум ${MAX_PHOTOS} фотографий`);
  for (const url of photos) {
    try { new URL(url); }
    catch { throw new Error(`Некорректный URL фото: ${url}`); }
  }


  if (barbersArray.length > MAX_BARBERS) {
    throw new Error(`Максимум ${MAX_BARBERS} мастеров`);
  }
  for (const b of barbersArray) {
    if (!b.name?.trim() || b.name.trim().length < 2 || b.name.trim().length > 50) {
      throw new Error('Имя мастера: от 2 до 50 символов');
    }
    const exp = Number(b.experienceInYears);
    if (isNaN(exp) || exp < 0 || exp > 60) {
      throw new Error(`Опыт мастера «${b.name.trim()}»: от 0 до 60 лет`);
    }
    if (b.url) {
      try { new URL(b.url); }
      catch { throw new Error(`Некорректный URL фото мастера «${b.name.trim()}»`); }
    }
  }
  if (servicesArray.length > MAX_SERVICES) {
    throw new Error(`Максимум ${MAX_SERVICES} услуг`);
  }
  for (const s of servicesArray) {
    if (!s.type?.trim() || s.type.trim().length < 2 || s.type.trim().length > 80) {
      throw new Error('Название услуги: от 2 до 80 символов');
    }
    const price = Number(s.price);
    if (isNaN(price) || price < 0 || price > 9999999) {
      throw new Error(`Цена услуги «${s.type.trim()}»: от 0 до 9 999 999`);
    }
    if (!s.url?.trim()) {
      throw new Error(`Фото услуги «${s.type.trim()}» обязательно`);
    }
    try { new URL(s.url.trim()); }
    catch { throw new Error(`Некорректный URL фото услуги «${s.type.trim()}»`); }
  }

  const location = [city, district, address].filter(Boolean).join(', ');
  const workingDays = daysArray.join(',');

  const [newShop] = await db
    .insert(barbershop)
    .values({
      name: trimmedName,
      description: description?.trim() || null,
      ownerId,
      isVerified: false,
      workingDays,
      openHour: openTime,
      closeHour: closeTime,
      location,
      lat: String(latNum),
      lng: String(lngNum),
      registerPrice: trimmedPrice || null,
      barbersCount: barbersArray.length,
    })
    .returning();


  const contactsToInsert = [
    { barberId: newShop.id, type: 'Номер телефона', value: phone, url: `tel:${phone}` },
  ];
  if (website) contactsToInsert.push({ barberId: newShop.id, type: 'Сайт', value: website, url: website });
  await db.insert(contacts).values(contactsToInsert);

  if (photos.length > 0) {
    await db.insert(photoURL).values(photos.map((url) => ({ url, barberId: newShop.id })));
  }


  if (barbersArray.length > 0) {
    await db.insert(barber).values(
      barbersArray.map((b) => ({
        name: b.name.trim(),
        experienceInYears: Number(b.experienceInYears),
        url: b.url?.trim() || null,
        barberId: newShop.id,
      }))
    );
  }

  if (servicesArray.length > 0) {
    await db.insert(service).values(
      servicesArray.map((s) => ({
        type: s.type.trim(),
        price: Number(s.price),
        url: s.url.trim(),
        barberId: newShop.id,
      }))
    );
  }

  return newShop;
};

module.exports = { AddShopService };