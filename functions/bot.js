const { Telegraf } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');

// Глобальная авторизация с логами
const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);

(async () => {
  console.log('Начинаю авторизацию Google Sheets...');
  const startTime = Date.now();
  try {
    await doc.useServiceAccountAuth({
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
    console.log('Авторизация auth успешна. Время: ' + (Date.now() - startTime) + ' ms');
    
    console.log('Загружаю info таблицы...');
    const loadStart = Date.now();
    await doc.loadInfo();
    console.log('LoadInfo успешна. Время: ' + (Date.now() - loadStart) + ' ms');
    console.log('Общая авторизация Google Sheets успешна. Общее время: ' + (Date.now() - startTime) + ' ms');
  } catch (err) {
    console.error('Ошибка авторизации Google Sheets: ' + err.message);
  }
})();

const bot = new Telegraf(process.env.BOT_TOKEN);

const conversations = new Map();

bot.start(async (ctx) => {
  console.log('Команда /start получена от user: ' + ctx.from.id);
  await ctx.reply('Привет! Бот для заказов\n\n/add — добавить\n/list — последние 10\n/stats — статистика');
  console.log('Ответ на /start отправлен');
});

bot.command('add', async (ctx) => {
  console.log('Команда /add получена');
  conversations.set(ctx.from.id, { step: 0, data: {} });
  await ctx.reply('1. Магазин (например, Wildberries)');
  console.log('Ответ на /add отправлен');
});

bot.on('text', async (ctx) => {
  console.log('Получено текстовое сообщение: ' + ctx.message.text.substring(0, 50)); // первые 50 символов
  const userId = ctx.from.id;
  const state = conversations.get(userId);
  if (!state) {
    console.log('Нет активной сессии для этого пользователя');
    return;
  }

  const fields = [
    'Магазин','Номер заказа','Аккаунт','Дата заказа','Позиция',
    'Штрих код товара','Бирка (qr код)','Серийник','Адрес ПВЗ',
    'Дата получения','На складе Маркета','Оплата','SKU','Покупатель',
    'Дата продажи','FBY/FBS','Дата поставки','Город поставки',
    'Номер коробки','Номер поставки','Номер заказа','Стикер вб фбс',
    'Цена товара','Количество','Сумма','Оплачено баллами',
    'Начисленно баллов','Яма/Вб Продажа','Яма/Вб Зачисление',
    'Налог','Продажа','ПВЗ','Прибыль'
  ];

  state.data[fields[state.step]] = ctx.message.text.trim();
  state.step++;

  if (state.step < fields.length) {
    await ctx.reply(`${state.step + 1}. ${fields[state.step]}`);
    console.log('Ответ на шаг добавления отправлен');
  } else {
    try {
      console.log('Начинаю добавление строки в Sheets...');
      const addStart = Date.now();
      const sheet = doc.sheetsByIndex[0];
      await sheet.addRow(state.data);
      console.log('Строка добавлена. Время: ' + (Date.now() - addStart) + ' ms');
      await ctx.reply('Заказ добавлен! ✅');
    } catch (err) {
      console.error('Ошибка добавления строки: ' + err.message);
      await ctx.reply('Ошибка сохранения');
    }
    conversations.delete(userId);
  }
});

bot.command('list', async (ctx) => {
  console.log('Команда /list получена');
  try {
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows({ limit: 10 });
    if (rows.length === 0) return ctx.reply('Нет заказов');

    let msg = 'Последние 10:\n\n';
    rows.forEach((r, i) => {
      msg += `${i+1}. ${r['Дата заказа']} – ${r['Позиция']} (${r['Количество']} шт)\n   Сумма: ${r['Сумма']}\n\n`;
    });
    ctx.reply(msg);
    console.log('Ответ на /list отправлен');
  } catch (err) {
    console.error('Ошибка /list: ' + err.message);
    ctx.reply('Ошибка');
  }
});

bot.command('stats', async (ctx) => {
  console.log('Команда /stats получена');
  try {
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    let sum = 0, profit = 0;
    rows.forEach(r => {
      sum += Number(r['Сумма'] || 0);
      profit += Number(r['Прибыль'] || 0);
    });
    const count = rows.length;
    const avg = count ? (sum / count).toFixed(2) : 0;

    ctx.reply(`Статистика:\nЗаказов: ${count}\nСумма: ${sum.toFixed(2)} ₽\nПрибыль: ${profit.toFixed(2)} ₽\nСредний чек: ${avg} ₽`);
    console.log('Ответ на /stats отправлен');
  } catch (err) {
    console.error('Ошибка /stats: ' + err.message);
    ctx.reply('Ошибка');
  }
});

exports.handler = async (event) => {
  console.log('Handler запущен. Event body: ' + (event.body ? event.body.substring(0, 100) : 'no body'));
  const startTime = Date.now();
  try {
    const body = JSON.parse(event.body || '{}');
    console.log('JSON parsed успешно');
    await bot.handleUpdate(body);
    console.log('handleUpdate завершён успешно. Время: ' + (Date.now() - startTime) + ' ms');
    return { statusCode: 200 };
  } catch (e) {
    console.error('Ошибка в handler: ' + e.message + ' | Stack: ' + e.stack);
    return { statusCode: 500 };
  }
};
