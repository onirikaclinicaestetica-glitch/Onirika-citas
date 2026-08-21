exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
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
      headers,
      body: JSON.stringify({
        success: false,
        error: 'JSON inválido'
      })
    };
  }

  const {
    message,
    service_code = null,
    appointment_type = 'first_visit',
    clinic_code = 'VALENCIA',
    from_date = null,
    to_date = null,
    from_time = null,
    to_time = null,
    max_results = 3
  } = data;

  if (!message || typeof message !== 'string') {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Falta el mensaje del cliente'
      })
    };
  }

  /*
   * V1.10.1
   * CHLOE todavía NO reserva.
   *
   * Esta primera capa recibe:
   * - mensaje original
   * - servicio detectado
   * - fecha/rango
   * - franja horaria
   *
   * Después conectaremos aquí el modelo conversacional
   * para extraer estos datos automáticamente.
   */

  if (!service_code) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        action: 'NEED_SERVICE',
        original_message: message,
        reply:
          'Claro ✨ ¿Qué tratamiento o experiencia te gustaría realizarte?'
      })
    };
  }

  if (!from_date || !to_date) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        action: 'NEED_DATE',
        original_message: message,
        service_code,
        reply:
          'Perfecto ✨ ¿Qué día te vendría mejor para tu visita?'
      })
    };
  }

  try {
    const params = new URLSearchParams({
      service: service_code,
      from: from_date,
      to: to_date,
      appointment_type,
      clinic: clinic_code,
      max_results: String(max_results)
    });

    if (from_time) {
      params.set('from_time', from_time);
    }

    if (to_time) {
      params.set('to_time', to_time);
    }

    const availabilityUrl =
      `https://citas.onirikaclinicaestetica.com/.netlify/functions/availability?${params.toString()}`;

    const response = await fetch(availabilityUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'No se pudo consultar disponibilidad',
          detail: result
        })
      };
    }

    const slots = Array.isArray(result.slots)
      ? result.slots
      : [];

    if (slots.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          action: 'NO_AVAILABILITY',
          original_message: message,
          service_code,
          slots: [],
          reply:
            'En esa franja no tengo disponibilidad. Puedo buscarte otro horario o un día cercano ✨'
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        action: 'OFFER_SLOTS',
        original_message: message,
        service_code,
        appointment_type,
        clinic_code,
        slots,
        reply:
          'He encontrado estas opciones disponibles para ti ✨'
      })
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Error interno de CHLOE',
        detail: e.message
      })
    };
  }
};
