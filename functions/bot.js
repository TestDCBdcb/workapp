const { Telegraf } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');

// Глобальная авторизация — делаем ОДИН раз при запуске
const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);

(async () => {
  try {
    await doc.useServiceAccountAuth({
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
    await doc.loadInfo();
    console.log('Google Sheets авторизация успешна');
  } catch (err) {
    console.error('Ошибка авторизации Google Sheets:', err.message);
  }
})();

const bot = new Telegraf(process.env.BOT_TOKEN);

const conversations = new Map();

bot.start((ctx) => ctx.reply('Привет! Используй /add для добавления заказа, /list, /stats'));

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
      const sheet = doc.sheetsByIndex[0];
      await sheet.addRow(state.data);
      await ctx.reply('Заказ добавлен! ✅');
    } catch (err) {
      console.error('Ошибка добавления строки:', err.message);
      await ctx.reply('Ошибка сохранения, попробуй позже');
    }
    conversations.delete(userId);
  }
});

// ... (остальные команды /list и /stats аналогично, используй doc.sheetsByIndex[0])

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    await bot.handleUpdate(body);
    return { statusCode: 200 };
  } catch (e) {
    console.error('Ошибка в handler:', e.message);
    return { statusCode: 500 };
  }
};
