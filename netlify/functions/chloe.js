function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function getMadridToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function extractOutputText(response) {
  if (!response || !Array.isArray(response.output)) {
    return null;
  }

  for (const item of response.output) {
    if (!item || !Array.isArray(item.content)) continue;

    for (const content of item.content) {
      if (content.type === 'output_text' && content.text) {
        return content.text;
      }
    }
  }

  return null;
}

async function interpretMessage(message) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no configurada');
  }

  const today = getMadridToday();

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },

    body: JSON.stringify({
      model: 'gpt-5.6-luna',
      store: false,

      input: [
        {
          role: 'system',
          content:
`Eres el motor de interpretación de CHLOE, recepcionista virtual de ONÍRIKA Clínica Médico-Estética en Valencia, España.

Tu única función aquí es interpretar el mensaje del cliente y devolver datos estructurados para consultar la agenda.

FECHA ACTUAL EN VALENCIA:
${today}

ZONA HORARIA:
Europe/Madrid

SERVICIOS CONOCIDOS:

- ONIRIKA SCULPT360
  service_code: SCULPT360
  categoría: CORPORAL
  También puede mencionarse como Sculpt360, reducción abdominal, reducir abdomen, grasa abdominal, moldear abdomen.

- CELLULITE RESET
  service_code: CELLULITE
  categoría: CORPORAL
  También puede mencionarse como celulitis, piernas con celulitis, piel de naranja.

- INDIBA PORCELAIN SKIN
  service_code: PORCELAIN
  categoría: FACIAL
  También puede mencionarse como Porcelain Skin, Indiba facial, luminosidad, piel luminosa.

- EXPERT JET SKIN RESET
  service_code: EXPERT_JET
  categoría: FACIAL
  También puede mencionarse como Expert Jet, limpieza facial profunda, limpieza tecnológica.

- ONIRIKA LASER 3D
  service_code: LASER3D
  categoría: DEPILACIÓN
  También puede mencionarse como láser, depilación láser, Laser 3D.

REGLAS:

1. Nunca inventes una fecha si el cliente no expresa ninguna referencia temporal.
2. Convierte referencias relativas usando la fecha actual indicada arriba.
3. "mañana" significa el día siguiente.
4. Un día de la semana como "el lunes" significa el próximo lunes futuro, salvo que el contexto indique otra cosa.
5. "por la mañana":
   from_time = 10:00
   to_time = 14:00

6. "por la tarde":
   from_time = 16:00
   to_time = 20:00

7. "a primera hora":
   from_time = 10:00
   to_time = 12:00

8. "a última hora":
   from_time = 18:00
   to_time = 20:00

9. "después de las 18":
   from_time = 18:00
   to_time = 20:00

10. Si indica una hora concreta, usa esa hora como from_time y to_time.

11. Para esta fase, appointment_type será "first_visit" salvo que el mensaje diga claramente que ya es cliente y se trata de una sesión posterior, en cuyo caso usa "recurrent".

12. Si no puedes identificar con suficiente seguridad el tratamiento, service_code debe ser null.

13. Si no puedes identificar fecha, from_date y to_date deben ser null.

14. No inventes disponibilidad.
15. No confirmes citas.
16. No respondas conversacionalmente. Solo devuelve la estructura solicitada.`
        },

        {
          role: 'user',
          content: message
        }
      ],

      text: {
        format: {
          type: 'json_schema',
          name: 'chloe_intent',
          strict: true,

          schema: {
            type: 'object',
            additionalProperties: false,

            properties: {
              service_code: {
                type: ['string', 'null']
              },

              appointment_type: {
                type: 'string',
                enum: ['first_visit', 'recurrent']
              },

              from_date: {
                type: ['string', 'null']
              },

              to_date: {
                type: ['string', 'null']
              },

              from_time: {
                type: ['string', 'null']
              },

              to_time: {
                type: ['string', 'null']
              }
            },

            required: [
              'service_code',
              'appointment_type',
              'from_date',
              'to_date',
              'from_time',
              'to_time'
            ]
          }
        }
      }
    })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result?.error?.message ||
      'Error interpretando el mensaje con OpenAI'
    );
  }

  const text = extractOutputText(result);

  if (!text) {
    throw new Error('OpenAI no devolvió interpretación');
  }

  return JSON.parse(text);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, {
      success: false,
      error: 'Método no permitido'
    });
  }

  let data;

  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return jsonResponse(400, {
      success: false,
      error: 'JSON inválido'
    });
  }

  const message =
    typeof data.message === 'string'
      ? data.message.trim()
      : '';

  if (!message) {
    return jsonResponse(400, {
      success: false,
      error: 'Falta el mensaje del cliente'
    });
  }

  try {
    /*
     * Si algún dato llega explícitamente desde otro canal,
     * lo conservamos.
     * La IA completa lo que falta.
     */

    const ai = await interpretMessage(message);

    const serviceCode =
      data.service_code ||
      ai.service_code ||
      null;

    const appointmentType =
      data.appointment_type ||
      ai.appointment_type ||
      'first_visit';

    const clinicCode =
      data.clinic_code ||
      'VALENCIA';

    const fromDate =
      data.from_date ||
      ai.from_date ||
      null;

    const toDate =
      data.to_date ||
      ai.to_date ||
      null;

    const fromTime =
      data.from_time ||
      ai.from_time ||
      null;

    const toTime =
      data.to_time ||
      ai.to_time ||
      null;

    const maxResults =
      Number(data.max_results || 3);


    // ==========================================
    // FALTA TRATAMIENTO
    // ==========================================

    if (!serviceCode) {
      return jsonResponse(200, {
        success: true,
        action: 'NEED_SERVICE',
        interpreted: ai,

        reply:
          'Claro ✨ ¿Qué tratamiento o qué te gustaría mejorar?'
      });
    }


    // ==========================================
    // FALTA FECHA
    // ==========================================

    if (!fromDate || !toDate) {
      return jsonResponse(200, {
        success: true,
        action: 'NEED_DATE',
        service_code: serviceCode,
        interpreted: ai,

        reply:
          'Perfecto ✨ ¿Qué día te vendría mejor para tu visita?'
      });
    }


    // ==========================================
    // CONSULTAR MASTER CRM
    // ==========================================

    const params = new URLSearchParams({
      service: serviceCode,
      from: fromDate,
      to: toDate,
      appointment_type: appointmentType,
      clinic: clinicCode,
      max_results: String(maxResults)
    });

    if (fromTime) {
      params.set('time_from', fromTime);
    }

    if (toTime) {
      params.set('time_to', toTime);
    }

    const availabilityUrl =
      `https://citas.onirikaclinicaestetica.com/.netlify/functions/availability?${params.toString()}`;

    const availabilityResponse =
      await fetch(availabilityUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      });

    const availability =
      await availabilityResponse.json();

    if (!availabilityResponse.ok) {
      return jsonResponse(502, {
        success: false,
        error: 'No se pudo consultar disponibilidad',
        detail: availability
      });
    }

    const slots =
      Array.isArray(availability.slots)
        ? availability.slots
        : [];


    // ==========================================
    // SIN DISPONIBILIDAD
    // ==========================================

    if (slots.length === 0) {
      return jsonResponse(200, {
        success: true,
        action: 'NO_AVAILABILITY',

        service_code: serviceCode,
        appointment_type: appointmentType,

        interpreted: ai,
        slots: [],

        reply:
          'En esa franja no tengo disponibilidad. Puedo buscarte otro horario o un día cercano ✨'
      });
    }


    // ==========================================
    // FORMATEAR RESPUESTA PARA CHLOE
    // ==========================================

    const optionText = slots
      .map(slot => slot.time_label)
      .join(', ');

    const firstDate =
      slots[0]?.date_label || 'ese día';

    return jsonResponse(200, {
      success: true,
      action: 'OFFER_SLOTS',

      service_code: serviceCode,
      appointment_type: appointmentType,
      clinic_code: clinicCode,

      interpreted: ai,
      slots,

      reply:
        `Perfecto ✨ Para ${firstDate} tengo disponibilidad a las ${optionText}. ¿Cuál de estos horarios te viene mejor?`
    });

  } catch (e) {
    return jsonResponse(500, {
      success: false,
      error: 'Error interno de CHLOE',
      detail: e.message
    });
  }
};
