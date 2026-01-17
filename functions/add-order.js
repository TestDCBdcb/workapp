// Тот же импорт и инициализация doc, как в orders.js

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  try {
    const body = JSON.parse(event.body);
    const { initData, data } = body;

    // Валидация initData (тот же код)

    await initializeSheets();

    const sheet = doc.sheetsByIndex[0];
    await sheet.addRow(data);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: err.message };
  }
};
