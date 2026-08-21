exports.handler = async (event) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Configuración de Supabase incompleta'
      })
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Método no permitido'
      })
    };
  }

  let data;

  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'JSON inválido'
      })
    };
  }

  const {
    name,
    last_name = null,
    phone = null,
    email = null,

    service_code,
    slot_start,

    campaign = null,
    source = 'META',
    clinic_code = 'VALENCIA',

    has_own_phone = true,

    referred_by_cliente_id = null,
    contact_name = null,
    contact_phone = null,
    contact_email = null,
    relationship = null
  } = data;

  if (!name || !service_code || !slot_start) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Faltan datos obligatorios: name, service_code, slot_start'
      })
    };
  }

  try {
    const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/chloe_book_first_visit`;

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        p_nombre: name,
        p_apellidos: last_name,
        p_telefono: phone,
        p_email: email,

        p_service_code: service_code,
        p_start: slot_start,
        p_campaign: campaign,
        p_source: source,
        p_clinic_code: clinic_code,

        p_has_own_phone: has_own_phone,

        p_referred_by_cliente_id: referred_by_cliente_id,
        p_contact_name: contact_name,
        p_contact_phone: contact_phone,
        p_contact_email: contact_email,
        p_relationship: relationship
      })
    });

    if (!response.ok) {
      const detail = await response.text();

      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'No se pudo crear la cita',
          detail
        })
      };
    }

    const rows = await response.json();

    if (!rows || rows.length === 0) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'La reserva no devolvió ningún resultado'
        })
      };
    }

    const booking = rows[0];

    const start = new Date(booking.starts_at);
    const end = new Date(booking.ends_at);

    const dateFormatter = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const timeFormatter = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const oaeUrl =
      `https://citas.onirikaclinicaestetica.com/?id=${booking.public_code}`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        success: true,

        cliente_id: booking.cliente_id,
        cliente_created: booking.cliente_created,

        appointment_id: booking.appointment_id,

        specialist: booking.especialista,
        service_name: booking.service_name,

        date_label: dateFormatter.format(start),
        time_label: timeFormatter.format(start),
        end_time_label: timeFormatter.format(end),

        public_code: booking.public_code,
        oae_url: oaeUrl,

        message: 'Cita confirmada'
      })
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Error interno',
        detail: e.message
      })
    };
  }
};
