const { getStore, connectLambda } = require('@netlify/blobs');

function makeId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

exports.handler = async (event) => {
  connectLambda(event);

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  if (!data.name || !data.date || !data.time || !data.treatment) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos de la cita' }) };
  }

  try {
    const store = getStore('citas');
    let id;
    for (let i = 0; i < 5; i++) {
      id = makeId();
      const existing = await store.get(id);
      if (!existing) break;
    }
    await store.setJSON(id, {
      name: data.name,
      date: data.date,
      time: data.time,
      treatment: data.treatment,
      subtitle: data.subtitle || '',
      professional: data.professional || '',
      duration: data.duration || '',
      instructions: data.instructions || '',
      id
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Error interno al guardar' }) };
  }
};
