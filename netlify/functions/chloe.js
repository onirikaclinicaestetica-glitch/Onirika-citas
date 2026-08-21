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


// =========================================================
// FECHA ACTUAL VALENCIA
// =========================================================

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


// =========================================================
// EXTRAER RESPUESTA OPENAI
// =========================================================

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


// =========================================================
// SUPABASE RPC
// =========================================================

async function supabaseRpc(functionName, payload) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error('Configuración de Supabase incompleta');
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof result === 'string'
        ? result
        : JSON.stringify(result)
    );
  }

  return result;
}


// =========================================================
// OBTENER / CREAR MEMORIA
// =========================================================

async function getConversation({
  externalConversationId,
  channel,
  clinicCode,
  source,
  campaign
}) {

  const result = await supabaseRpc(
    'get_or_create_chloe_conversation',
    {
      p_external_conversation_id: externalConversationId,
      p_channel: channel,
      p_clinic_code: clinicCode,
      p_source: source,
      p_campaign: campaign
    }
  );

  if (!Array.isArray(result) || result.length === 0) {
    throw new Error('No se pudo recuperar la conversación');
  }

  return result[0];
}


// =========================================================
// ACTUALIZAR MEMORIA
// =========================================================

async function updateConversation({
  conversationId,
  serviceCode = null,
  appointmentType = null,
  fromDate = null,
  toDate = null,
  fromTime = null,
  toTime = null,
  offeredSlots = null,
  selectedSlotStart = null,
  state = null,
  lastUserMessage = null,
  lastChloeReply = null
}) {
// =========================================================
// GUARDAR DATOS DE LA PERSONA ATENDIDA
// =========================================================

async function updateClientData({
  conversationId,
  nombre = null,
  apellidos = null,
  telefono = null,
  email = null,
  hasOwnPhone = null,
  state = null
}) {
  return supabaseRpc(
    'update_chloe_client_data',
    {
      p_conversation_id: conversationId,
      p_nombre: nombre,
      p_apellidos: apellidos,
      p_telefono: telefono,
      p_email: email,
      p_has_own_phone: hasOwnPhone,
      p_referred_by_cliente_id: null,
      p_contact_name: null,
      p_contact_phone: null,
      p_contact_email: null,
      p_relationship: null,
      p_state: state
    }
  );
}
  return supabaseRpc(
    'update_chloe_conversation',
    {
      p_conversation_id: conversationId,
      p_service_code: serviceCode,
      p_appointment_type: appointmentType,
      p_from_date: fromDate,
      p_to_date: toDate,
      p_from_time: fromTime,
      p_to_time: toTime,
      p_offered_slots: offeredSlots,
      p_selected_slot_start: selectedSlotStart,
      p_state: state,
      p_last_user_message: lastUserMessage,
      p_last_chloe_reply: lastChloeReply
    }
  );
}


// =========================================================
// DETECTAR ELECCIÓN DE HORARIO
// =========================================================

function findSelectedSlot(message, offeredSlots) {

  if (!Array.isArray(offeredSlots)) {
    return null;
  }

  const match = message.match(
    /\b([01]?\d|2[0-3])(?:[:h.]([0-5]\d))?\b/
  );

  if (!match) {
    return null;
  }

  const hour = String(match[1]).padStart(2, '0');
  const minute = match[2] || '00';

  const requestedTime = `${hour}:${minute}`;

  return offeredSlots.find(
    slot => slot.time_label === requestedTime
  ) || null;
}


// =========================================================
// INTERPRETACIÓN IA
// =========================================================

async function interpretMessage(message) {

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no configurada');
  }

  const today = getMadridToday();

  const response = await fetch(
    'https://api.openai.com/v1/responses',
    {
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
`Eres el motor de interpretación de CHLOE,
recepcionista virtual de ONÍRIKA Clínica Médico-Estética
en Valencia, España.

FECHA ACTUAL EN VALENCIA:
${today}

ZONA HORARIA:
Europe/Madrid

Tu función aquí es exclusivamente interpretar intención
y devolver datos estructurados.

SERVICIOS:

ONIRIKA SCULPT360
service_code: SCULPT360
También:
Sculpt360,
reducción abdominal,
reducir abdomen,
grasa abdominal,
moldear abdomen.

CELLULITE RESET
service_code: CELLULITE
También:
celulitis,
piel de naranja,
celulitis piernas.

INDIBA PORCELAIN SKIN
service_code: PORCELAIN
También:
Porcelain Skin,
Indiba facial,
luminosidad facial.

EXPERT JET SKIN RESET
service_code: EXPERT_JET
También:
Expert Jet,
limpieza facial profunda,
limpieza tecnológica.

ONIRIKA LASER 3D
service_code: LASER3D
También:
depilación láser,
láser,
Laser 3D.

REGLAS TEMPORALES:

"por la mañana":
10:00–14:00

"por la tarde":
16:00–20:00

"a primera hora":
10:00–12:00

"a última hora":
18:00–20:00

"después de las 18":
18:00–20:00

Si indica una hora concreta,
usa esa hora como from_time y to_time.

"mañana" significa el día siguiente.

Un día como "el lunes" significa
el próximo lunes futuro.

appointment_type será first_visit
salvo que quede claro que es una sesión posterior
de un cliente existente.

No inventes fechas.

No inventes disponibilidad.

No confirmes citas.

Si no identificas tratamiento:
service_code = null.

Si no identificas fecha:
from_date = null
to_date = null.

Devuelve solamente la estructura solicitada.`
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
                  enum: [
                    'first_visit',
                    'recurrent'
                  ]
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
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result?.error?.message ||
      'Error interpretando mensaje'
    );
  }

  const text = extractOutputText(result);

  if (!text) {
    throw new Error(
      'OpenAI no devolvió interpretación'
    );
  }

  return JSON.parse(text);
}

// =========================================================
// INTERPRETAR DATOS BÁSICOS DEL CLIENTE
// =========================================================

async function interpretClientData(message) {

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no configurada');
  }

  const response = await fetch(
    'https://api.openai.com/v1/responses',
    {
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
`Extrae únicamente los datos personales que la persona haya escrito explícitamente.

No inventes ningún dato.

Si escribe "Laura Gómez":
nombre = Laura
apellidos = Gómez

Si escribe un teléfono, extráelo.

Si escribe email, extráelo.

Si falta un dato, devuelve null.

No respondas conversacionalmente.`
          },

          {
            role: 'user',
            content: message
          }
        ],

        text: {
          format: {
            type: 'json_schema',
            name: 'chloe_client_data',
            strict: true,

            schema: {
              type: 'object',
              additionalProperties: false,

              properties: {
                nombre: {
                  type: ['string', 'null']
                },

                apellidos: {
                  type: ['string', 'null']
                },

                telefono: {
                  type: ['string', 'null']
                },

                email: {
                  type: ['string', 'null']
                }
              },

              required: [
                'nombre',
                'apellidos',
                'telefono',
                'email'
              ]
            }
          }
        }
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result?.error?.message ||
      'Error interpretando datos del cliente'
    );
  }

  const text = extractOutputText(result);

  if (!text) {
    throw new Error(
      'OpenAI no devolvió datos del cliente'
    );
  }

  return JSON.parse(text);
}
// =========================================================
// HANDLER PRINCIPAL CHLOE
// =========================================================

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
      error: 'Falta el mensaje'
    });
  }


  const externalConversationId =
    data.external_conversation_id;

  if (!externalConversationId) {
    return jsonResponse(400, {
      success: false,
      error: 'Falta external_conversation_id'
    });
  }


  const channel =
    data.channel || 'web';

  const clinicCode =
    data.clinic_code || 'VALENCIA';

  const source =
    data.source || 'META';

  const campaign =
    data.campaign || null;


  try {

    // =====================================================
    // 1. RECUPERAR MEMORIA
    // =====================================================

    const memory = await getConversation({
      externalConversationId,
      channel,
      clinicCode,
      source,
      campaign
    });

// =====================================================
// DATOS DE LA PERSONA QUE RECIBIRÁ EL TRATAMIENTO
// =====================================================

if (
  memory.state === 'AWAITING_CLIENT_DATA' ||
  memory.state === 'AWAITING_PHONE'
) {

  const extracted =
    await interpretClientData(message);

  const nombre =
    extracted.nombre ||
    memory.nombre ||
    null;

  const apellidos =
    extracted.apellidos ||
    memory.apellidos ||
    null;

  const telefono =
    extracted.telefono ||
    memory.telefono ||
    null;

  const email =
    extracted.email ||
    memory.email ||
    null;


  // -----------------------------------------
  // TODAVÍA FALTA NOMBRE COMPLETO
  // -----------------------------------------

  if (!nombre || !apellidos) {

    const reply =
      'Para preparar tu reserva, ¿me indicas tu nombre y apellidos? ✨';

    await updateClientData({
      conversationId:
        memory.conversation_id,

      nombre,
      apellidos,
      telefono,
      email,

      hasOwnPhone: true,

      state:
        'AWAITING_CLIENT_DATA'
    });

    await updateConversation({
      conversationId:
        memory.conversation_id,

      state:
        'AWAITING_CLIENT_DATA',

      lastUserMessage:
        message,

      lastChloeReply:
        reply
    });

    return jsonResponse(200, {
      success: true,
      action: 'NEED_CLIENT_NAME',
      conversation_id:
        memory.conversation_id,
      reply
    });
  }


  // -----------------------------------------
  // TENEMOS NOMBRE, FALTA TELÉFONO
  // -----------------------------------------

  if (!telefono) {

    const reply =
      `Gracias, ${nombre} ✨ ¿Me facilitas un teléfono de contacto?`;

    await updateClientData({
      conversationId:
        memory.conversation_id,

      nombre,
      apellidos,
      email,

      hasOwnPhone: true,

      state:
        'AWAITING_PHONE'
    });

    await updateConversation({
      conversationId:
        memory.conversation_id,

      state:
        'AWAITING_PHONE',

      lastUserMessage:
        message,

      lastChloeReply:
        reply
    });

    return jsonResponse(200, {
      success: true,
      action: 'NEED_PHONE',
      conversation_id:
        memory.conversation_id,
      nombre,
      apellidos,
      reply
    });
  }


  // -----------------------------------------
  // YA TENEMOS DATOS MÍNIMOS
  // -----------------------------------------

  const reply =
    `Perfecto, ${nombre} ✨ Ya tengo los datos necesarios para preparar tu reserva.`;

  await updateClientData({
    conversationId:
      memory.conversation_id,

    nombre,
    apellidos,
    telefono,
    email,

    hasOwnPhone: true,

    state:
      'READY_TO_BOOK'
  });

  await updateConversation({
    conversationId:
      memory.conversation_id,

    state:
      'READY_TO_BOOK',

    lastUserMessage:
      message,

    lastChloeReply:
      reply
  });

  return jsonResponse(200, {
    success: true,
    action: 'CLIENT_DATA_COMPLETE',
    conversation_id:
      memory.conversation_id,
    nombre,
    apellidos,
    telefono,
    email,
    reply
  });
}
    // =====================================================
    // 2. SI ESTAMOS ESPERANDO ELECCIÓN DE HORARIO
    // =====================================================

    if (
      memory.state === 'OFFERING_SLOTS' &&
      Array.isArray(memory.offered_slots)
    ) {

      const selected =
        findSelectedSlot(
          message,
          memory.offered_slots
        );


      if (selected) {

        const reply =
          `Perfecto ✨ He seleccionado las ${selected.time_label}. ` +
          `Para preparar tu reserva, ¿me indicas tu nombre y apellidos?`;


        await updateConversation({

          conversationId:
            memory.conversation_id,

          selectedSlotStart:
            selected.slot_start,

          state:
            'AWAITING_CLIENT_DATA',

          lastUserMessage:
            message,

          lastChloeReply:
            reply
        });


        return jsonResponse(200, {

          success: true,

          action:
            'SLOT_SELECTED',

          conversation_id:
            memory.conversation_id,

          service_code:
            memory.service_code,

          selected_slot:
            selected,

          reply
        });
      }
    }


    // =====================================================
    // 3. INTERPRETAR MENSAJE
    // =====================================================

    const ai =
      await interpretMessage(message);


    // MEMORIA TIENE PRIORIDAD CUANDO IA NO TRAE DATO

    const serviceCode =
      data.service_code ||
      ai.service_code ||
      memory.service_code ||
      null;


    const appointmentType =
      data.appointment_type ||
      ai.appointment_type ||
      memory.appointment_type ||
      'first_visit';


    const fromDate =
      data.from_date ||
      ai.from_date ||
      memory.from_date ||
      null;


    const toDate =
      data.to_date ||
      ai.to_date ||
      memory.to_date ||
      null;


    const fromTime =
      data.from_time ||
      ai.from_time ||
      memory.from_time ||
      null;


    const toTime =
      data.to_time ||
      ai.to_time ||
      memory.to_time ||
      null;


    const maxResults =
      Number(data.max_results || 3);


    // =====================================================
    // FALTA SERVICIO
    // =====================================================

    if (!serviceCode) {

      const reply =
        'Claro ✨ ¿Qué tratamiento o qué te gustaría mejorar?';


      await updateConversation({

        conversationId:
          memory.conversation_id,

        state:
          'NEED_SERVICE',

        lastUserMessage:
          message,

        lastChloeReply:
          reply
      });


      return jsonResponse(200, {

        success: true,

        action:
          'NEED_SERVICE',

        conversation_id:
          memory.conversation_id,

        reply
      });
    }


    // =====================================================
    // FALTA FECHA
    // =====================================================

    if (!fromDate || !toDate) {

      const reply =
        'Perfecto ✨ ¿Qué día te vendría mejor para tu visita?';


      await updateConversation({

        conversationId:
          memory.conversation_id,

        serviceCode,

        appointmentType,

        state:
          'NEED_DATE',

        lastUserMessage:
          message,

        lastChloeReply:
          reply
      });


      return jsonResponse(200, {

        success: true,

        action:
          'NEED_DATE',

        conversation_id:
          memory.conversation_id,

        service_code:
          serviceCode,

        reply
      });
    }


    // =====================================================
    // 4. CONSULTAR DISPONIBILIDAD REAL
    // =====================================================

    const params =
      new URLSearchParams({

        service:
          serviceCode,

        from:
          fromDate,

        to:
          toDate,

        appointment_type:
          appointmentType,

        clinic:
          clinicCode,

        max_results:
          String(maxResults)
      });


    if (fromTime) {
      params.set(
        'time_from',
        fromTime
      );
    }


    if (toTime) {
      params.set(
        'time_to',
        toTime
      );
    }


    const availabilityUrl =
      `https://citas.onirikaclinicaestetica.com/.netlify/functions/availability?${params.toString()}`;


    const availabilityResponse =
      await fetch(
        availabilityUrl,
        {
          method: 'GET',
          headers: {
            Accept:
              'application/json'
          }
        }
      );


    const availability =
      await availabilityResponse.json();


    if (!availabilityResponse.ok) {

      return jsonResponse(502, {

        success: false,

        error:
          'No se pudo consultar disponibilidad',

        detail:
          availability
      });
    }


    const slots =
      Array.isArray(availability.slots)
        ? availability.slots
        : [];


    // =====================================================
    // SIN DISPONIBILIDAD
    // =====================================================

    if (slots.length === 0) {

      const reply =
        'En esa franja no tengo disponibilidad. ' +
        'Puedo buscarte otro horario o un día cercano ✨';


      await updateConversation({

        conversationId:
          memory.conversation_id,

        serviceCode,

        appointmentType,

        fromDate,

        toDate,

        fromTime,

        toTime,

        state:
          'NO_AVAILABILITY',

        lastUserMessage:
          message,

        lastChloeReply:
          reply
      });


      return jsonResponse(200, {

        success: true,

        action:
          'NO_AVAILABILITY',

        conversation_id:
          memory.conversation_id,

        slots: [],

        reply
      });
    }


    // =====================================================
    // 5. OFRECER HORARIOS
    // =====================================================

    const optionText =
      slots
        .map(slot => slot.time_label)
        .join(', ');


    const firstDate =
      slots[0]?.date_label ||
      'ese día';


    const reply =
      `Perfecto ✨ Para ${firstDate} tengo disponibilidad ` +
      `a las ${optionText}. ¿Cuál de estos horarios te viene mejor?`;


    // =====================================================
    // 6. GUARDAR TODO EN MEMORIA
    // =====================================================

    await updateConversation({

      conversationId:
        memory.conversation_id,

      serviceCode,

      appointmentType,

      fromDate,

      toDate,

      fromTime,

      toTime,

      offeredSlots:
        slots,

      state:
        'OFFERING_SLOTS',

      lastUserMessage:
        message,

      lastChloeReply:
        reply
    });


    return jsonResponse(200, {

      success: true,

      action:
        'OFFER_SLOTS',

      conversation_id:
        memory.conversation_id,

      service_code:
        serviceCode,

      appointment_type:
        appointmentType,

      slots,

      reply
    });


  } catch (e) {

    return jsonResponse(500, {

      success: false,

      error:
        'Error interno de CHLOE',

      detail:
        e.message
    });
  }
};
