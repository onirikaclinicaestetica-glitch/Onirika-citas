exports.handler = async (event) => {
  const id = event.queryStringParameters && event.queryStringParameters.id;

  if (!id) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Falta el id' })
    };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Configuración de Supabase incompleta' })
    };
  }

  try {
    const url =
      `${SUPABASE_URL}/rest/v1/appointment_experiences` +
      `?public_code=eq.${encodeURIComponent(id)}` +
      `&select=` +
      `id,public_code,precare,` +
      `appointments(` +
        `id,starts_at,ends_at,status,` +
        `clientes(nombre,apellidos),` +
        `services(name,category,duration_minutes),` +
        `staff(first_name)` +
      `)`;

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      const detail = await response.text();

      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Error al consultar Supabase',
          detail
        })
      };
    }

    const rows = await response.json();

    if (!rows || rows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'OAE no encontrado' })
      };
    }

    const oae = rows[0];
    const appointment = oae.appointments;

    if (!appointment) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Cita asociada no encontrada' })
      };
    }

    const cliente = appointment.clientes || {};
    const service = appointment.services || {};
    const staff = appointment.staff || {};

    const start = new Date(appointment.starts_at);

    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const timeFormatter = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const name = [cliente.nombre, cliente.apellidos]
      .filter(Boolean)
      .join(' ')
      .trim();

    const instructions = Array.isArray(oae.precare)
      ? oae.precare.join('|')
      : '';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        id: oae.public_code,
        name: name || 'Cliente',
        date: dateFormatter.format(start),
        time: timeFormatter.format(start),
        treatment: service.name || '',
        professional: staff.first_name || '',
        duration: service.duration_minutes
          ? `${service.duration_minutes} minutos`
          : '',
        instructions,
        category: service.category || '',
        source: 'master_crm'
      })
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Error interno al leer OAE',
        detail: e.message
      })
    };
  }
};
