const { Telegraf } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const bot = new Telegraf(process.env.BOT_TOKEN);

async function getSheet() {
  const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
  await doc.useServiceAccountAuth({
    client_email: process.env.CLIENT_EMAIL,
    private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
  });
  await doc.loadInfo();
  return doc.sheetsByIndex[0];
}

bot.start((ctx) => ctx.reply(
  'Привет! Бот для заказов\n\n' +
  '/add — добавить заказ пошагово\n' +
  '/list — последние 10\n' +
  '/stats — статистика'
));

const conversations = new Map();

bot.command('add', async (ctx) => {
  conversations.set(ctx.from.id, { step: 0, data: {} });
  await ctx.reply('1. Магазин (например, Wildberries)');
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const state = conversations.get(userId);
  if (!state) return;

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
  } else {
    try {
      const sheet = await getSheet();
      await sheet.addRow(state.data);
      await ctx.reply('Заказ добавлен! ✅');
    } catch (err) {
      console.error(err);
      await ctx.reply('Ошибка сохранения');
    }
    conversations.delete(userId);
  }
});

bot.command('list', async (ctx) => {
  try {
    const sheet = await getSheet();
    const rows = await sheet.getRows({ limit: 10 });
    if (rows.length === 0) return ctx.reply('Нет заказов');

    let msg = 'Последние 10:\n\n';
    rows.forEach((r, i) => {
      msg += `${i+1}. ${r['Дата заказа']} – ${r['Позиция']} (${r['Количество']} шт)\n` +
             `   Сумма: ${r['Сумма']}\n\n`;
    });
    ctx.reply(msg);
  } catch (err) {
    ctx.reply('Ошибка');
  }
});

bot.command('stats', async (ctx) => {
  try {
    const sheet = await getSheet();
    const rows = await sheet.getRows();
    let sum = 0, profit = 0;
    rows.forEach(r => {
      sum += Number(r['Сумма'] || 0);
      profit += Number(r['Прибыль'] || 0);
    });
    const count = rows.length;
    const avg = count ? (sum / count).toFixed(2) : 0;

    ctx.reply(
      `Статистика:\n` +
      `Заказов: ${count}\n` +
      `Сумма: ${sum.toFixed(2)} ₽\n` +
      `Прибыль: ${profit.toFixed(2)} ₽\n` +
      `Средний чек: ${avg} ₽`
    );
  } catch (err) {
    ctx.reply('Ошибка');
  }
});

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    await bot.handleUpdate(body);
    return { statusCode: 200 };
  } catch (e) {
    console.error(e);
    return { statusCode: 500 };
  }
};
