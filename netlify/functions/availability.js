exports.handler = async (event) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Configuración de Supabase incompleta' })
    };
  }

  const q = event.queryStringParameters || {};

  const service = q.service;
  const from = q.from;
  const to = q.to;
  const appointmentType = q.appointment_type || 'first_visit';
  const clinic = q.clinic || 'VALENCIA';
  const maxResults = Number(q.max_results || 3);
  const timeFrom = q.time_from || null;
  const timeTo = q.time_to || null;

  if (!service || !from || !to) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Faltan parámetros obligatorios: service, from, to'
      })
    };
  }

  try {
    const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/get_smart_slots`;

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        p_service_code: service,
        p_from_date: from,
        p_to_date: to,
        p_appointment_type: appointmentType,
        p_clinic_code: clinic,
        p_max_results: maxResults,
        p_time_from: timeFrom,
        p_time_to: timeTo
      })
    });

    if (!response.ok) {
      const detail = await response.text();

      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Error consultando disponibilidad',
          detail
        })
      };
    }

    const rows = await response.json();

    const formatterDate = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

    const formatterTime = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const slots = rows.map(row => {
      const start = new Date(row.slot_start);
      const end = new Date(row.slot_end);

      return {
        slot_start: row.slot_start,
        slot_end: row.slot_end,

        date_label: formatterDate.format(start),
        time_label: formatterTime.format(start),
        end_time_label: formatterTime.format(end),

        available_staff_count: row.available_staff_count,

        suggested_staff_id: row.suggested_staff_id,
        suggested_specialist: row.suggested_specialist
      };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        service,
        appointment_type: appointmentType,
        clinic,
        slots
      })
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Error interno',
        detail: e.message
      })
    };
  }
};
