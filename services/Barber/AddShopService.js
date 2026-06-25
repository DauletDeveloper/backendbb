const { db } = require('../../db');
const { barbershop, contacts, photoURL, barber, service } = require('../schema');
const { eq, and } = require('drizzle-orm');

const MAX_PHOTOS = 10;
const MAX_BARBERS = 15;
const MAX_SERVICES = 20;
const MAX_URL_LENGTH = 2048;



const sanitize = (str) => str?.replace(/[<>]/g, '').trim() ?? '';

const isValidHttpUrl = (raw) => {
  try {
    const { protocol, hostname } = new URL(raw);
    if (!['http:', 'https:'].includes(protocol)) return false;
    if (
      /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(hostname)
    ) return false;
    return true;
  } catch {
    return false;
  }
};

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};



const AddShopService = async (req) => {
  if (!req.userId) throw new Error('Необходима авторизация');
  const ownerId = req.userId;

  const {
    name, description, city, district, address,
    lat, lng, openTime, closeTime, days, photos,
    phone, website, registerPrice, barbers, services,
  } = req.body;


  if (!name?.trim())      throw new Error('Название обязательно');
  if (!city?.trim())      throw new Error('Город обязателен');
  if (!address?.trim())   throw new Error('Адрес обязателен');
  if (!phone?.trim())     throw new Error('Телефон обязателен');
  if (!openTime?.trim())  throw new Error('Время открытия обязательно');
  if (!closeTime?.trim()) throw new Error('Время закрытия обязательно');
  if (lat == null || lat === '') throw new Error('Широта обязательна');
  if (lng == null || lng === '') throw new Error('Долгота обязательна');


  if (!Array.isArray(photos) || photos.length === 0)
    throw new Error('Загрузите минимум 1 фото');

  const barbersArray  = Array.isArray(barbers)  ? barbers  : [];
  const servicesArray = Array.isArray(services) ? services : [];

  if (barbersArray.length === 0)  throw new Error('Добавьте минимум 1 мастера');
  if (servicesArray.length === 0) throw new Error('Добавьте минимум 1 услугу');

  if (!days || (Array.isArray(days) ? days.length === 0 : !days.trim()))
    throw new Error('Рабочие дни обязательны');

  const trimmedName = sanitize(name);
  if (trimmedName.length < 3 || trimmedName.length > 50)
    throw new Error('Название: от 3 до 50 символов');


  const trimmedDesc = sanitize(description ?? '');
  if (trimmedDesc.length > 0 && (trimmedDesc.length < 15 || trimmedDesc.length > 500))
    throw new Error('Описание: от 15 до 500 символов');

  const trimmedCity     = sanitize(city);
  const trimmedDistrict = sanitize(district ?? '');
  const trimmedAddress  = sanitize(address);

  if (trimmedCity.length > 100)     throw new Error('Город: максимум 100 символов');
  if (trimmedDistrict.length > 100) throw new Error('Район: максимум 100 символов');
  if (trimmedAddress.length > 200)  throw new Error('Адрес: максимум 200 символов');


  const trimmedPrice = sanitize(registerPrice ?? '');
  if (trimmedPrice.length > 0) {
    const priceNum = Number(trimmedPrice);
    if (isNaN(priceNum) || priceNum < 0 || priceNum > 9_999_999)
      throw new Error('Стоимость записи: число от 0 до 9 999 999');
  }


  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(openTime))  throw new Error('Время открытия: формат ЧЧ:ММ (09:00)');
  if (!timeRegex.test(closeTime)) throw new Error('Время закрытия: формат ЧЧ:ММ (21:00)');
  if (toMinutes(openTime) >= toMinutes(closeTime))
    throw new Error('Время открытия должно быть раньше времени закрытия');


  const validDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const daysArray = Array.isArray(days)
    ? days
    : days.split(',').map((d) => d.trim());
  const invalidDays = daysArray.filter((d) => !validDays.includes(d));
  if (invalidDays.length > 0)
    throw new Error(`Недопустимые рабочие дни: ${invalidDays.join(', ')}`);


  const cleanPhone = phone.replace(/[\s\-()]/g, '');
  if (!/^(\+7|8)\d{10}$/.test(cleanPhone))
    throw new Error('Телефон: формат +7XXXXXXXXXX или 8XXXXXXXXXX');


  if (website?.trim()) {
    if (!isValidHttpUrl(website.trim()))
      throw new Error('Некорректный URL сайта (только http/https, без локальных адресов)');
  }


  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (isNaN(latNum) || latNum < -90  || latNum > 90)
    throw new Error('Некорректная широта (от -90 до 90)');
  if (isNaN(lngNum) || lngNum < -180 || lngNum > 180)
    throw new Error('Некорректная долгота (от -180 до 180)');


  if (photos.length > MAX_PHOTOS)
    throw new Error(`Максимум ${MAX_PHOTOS} фотографий`);

  const uniquePhotos = [...new Set(photos)];
  if (uniquePhotos.length !== photos.length)
    throw new Error('Фотографии не должны повторяться');

  for (const url of photos) {
    if (typeof url !== 'string' || url.length > MAX_URL_LENGTH)
      throw new Error('URL фото слишком длинный или некорректный');
    if (!isValidHttpUrl(url))
      throw new Error(`Некорректный URL фото: ${url}`);
  }

  if (barbersArray.length > MAX_BARBERS)
    throw new Error(`Максимум ${MAX_BARBERS} мастеров`);

  const barberNames = barbersArray.map((b) => sanitize(b.name ?? '').toLowerCase());
  if (new Set(barberNames).size !== barberNames.length)
    throw new Error('Имена мастеров должны быть уникальными');

  for (const b of barbersArray) {
    const bName = sanitize(b.name ?? '');
    if (bName.length < 2 || bName.length > 50)
      throw new Error('Имя мастера: от 2 до 50 символов');

    const exp = Number(b.experienceInYears);
    if (isNaN(exp) || exp < 0 || exp > 60)
      throw new Error(`Опыт мастера «${bName}»: от 0 до 60 лет`);

    if (b.url?.trim()) {
      if (b.url.trim().length > MAX_URL_LENGTH)
        throw new Error(`URL фото мастера «${bName}» слишком длинный`);
      if (!isValidHttpUrl(b.url.trim()))
        throw new Error(`Некорректный URL фото мастера «${bName}» (только http/https)`);
    }
  }


  if (servicesArray.length > MAX_SERVICES)
    throw new Error(`Максимум ${MAX_SERVICES} услуг`);

  const serviceTypes = servicesArray.map((s) => sanitize(s.type ?? '').toLowerCase());
  if (new Set(serviceTypes).size !== serviceTypes.length)
    throw new Error('Названия услуг должны быть уникальными');

  for (const svc of servicesArray) {
    const svcType = sanitize(svc.type ?? '');
    if (svcType.length < 2 || svcType.length > 80)
      throw new Error('Название услуги: от 2 до 80 символов');

    const price = Number(svc.price);
    if (isNaN(price) || price < 0 || price > 9_999_999)
      throw new Error(`Цена услуги «${svcType}»: от 0 до 9 999 999`);

    if (!svc.url?.trim())
      throw new Error(`Фото услуги «${svcType}» обязательно`);
    if (svc.url.trim().length > MAX_URL_LENGTH)
      throw new Error(`URL фото услуги «${svcType}» слишком длинный`);
    if (!isValidHttpUrl(svc.url.trim()))
      throw new Error(`Некорректный URL фото услуги «${svcType}» (только http/https)`);
  }

  const location = [trimmedCity, trimmedDistrict, trimmedAddress]
    .filter(Boolean)
    .join(', ');
  if (!location) throw new Error('Не удалось сформировать адрес');
  const workingDays = daysArray.join(',');
  const newShop = await db.transaction(async (tx) => {
    const [shop] = await tx
      .insert(barbershop)
      .values({
        name: trimmedName,
        description: trimmedDesc || null,
        ownerId,
        isVerified: false,
        workingDays,
        openHour: openTime,
        closeHour: closeTime,
        location,
        lat: latNum,
        lng: lngNum,
        registerPrice: trimmedPrice || null,
        barbersCount: barbersArray.length,
      })
      .returning();

    const contactsToInsert = [
      { barberId: shop.id, type: 'Номер телефона', value: cleanPhone, url: `tel:${cleanPhone}` },
    ];
    if (website?.trim()) {
      contactsToInsert.push({
        barberId: shop.id,
        type: 'Сайт',
        value: website.trim(),
        url: website.trim(),
      });
    }

    await tx.insert(contacts).values(contactsToInsert);

    await tx.insert(photoURL).values(
      uniquePhotos.map((url) => ({ url, barberId: shop.id }))
    );

    await tx.insert(barber).values(
      barbersArray.map((b) => ({
        name:              sanitize(b.name),
        experienceInYears: Number(b.experienceInYears),
        url:               b.url?.trim() || null,
        barberId:          shop.id,
      }))
    );

    await tx.insert(service).values(
      servicesArray.map((svc) => ({
        type:     sanitize(svc.type),
        price:    Number(svc.price),
        url:      svc.url.trim(),
        barberId: shop.id,
      }))
    );

    return shop;
  });

  return newShop;
};

module.exports = { AddShopService };
