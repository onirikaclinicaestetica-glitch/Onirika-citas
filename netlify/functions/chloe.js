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
// GUARDAR DATOS DE LA PERSONA ATENDIDA
// ========================================================= 
async function updateClientData({
  conversationId,
  nombre = null,
  apellidos = null,
  telefono = null,
  email = null,
  hasOwnPhone = null,

  referredByClienteId = null,
  contactName = null,
  contactPhone = null,
  contactEmail = null,
  relationship = null,

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
      p_referred_by_cliente_id: referredByClienteId,
p_contact_name: contactName,
p_contact_phone: contactPhone,
p_contact_email: contactEmail,
p_relationship: relationship,
      p_state: state
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

Si la persona indica que la cita es para otra persona, detecta:

booking_for_other_person = true

Ejemplos:
"Es para mi hija Lucía"
"Quiero reservar para mi madre"
"La cita es para mi marido"

relationship describe SIEMPRE quién es el contacto respecto de la persona que recibirá el tratamiento.

Ejemplos:

"La cita es para mi hija Lucía. Yo soy su madre María"
relationship = madre

"La cita es para mi hijo Lucas. Yo soy su padre Carlos"
relationship = padre

"Estoy reservando para mi madre Ana. Yo soy su hija"
relationship = hija

"Estoy reservando para mi marido"
relationship = esposa, únicamente si la persona lo expresa claramente.

Nunca inviertas la relación.

Si el mensaje no permite conocer con seguridad la relación del contacto respecto del paciente, usa "familiar".

No deduzcas madre/padre, esposo/esposa u otra relación basándote únicamente en el nombre de una persona.

El campo nombre y apellidos deben corresponder SIEMPRE a la persona que recibirá el tratamiento.

contact_name corresponde a la persona que está gestionando la cita, solo si lo dice explícitamente.

Si no está reservando para otra persona:
booking_for_other_person = false
relationship = null
contact_name = null

Nunca inventes nombres, relaciones ni datos.

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
  },

  booking_for_other_person: {
    type: 'boolean'
  },

  relationship: {
    type: ['string', 'null']
  },

  contact_name: {
    type: ['string', 'null']
  }
},

required: [
  'nombre',
  'apellidos',
  'telefono',
  'email',
  'booking_for_other_person',
  'relationship',
  'contact_name'
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
// CREAR RESERVA REAL
// =========================================================

async function createBooking({
  nombre,
  apellidos,
  telefono,
  email,
  serviceCode,
  slotStart,
  clinicCode,
    source,
  campaign,
  hasOwnPhone = true,

  referredByClienteId = null,
  contactName = null,
  contactPhone = null,
  contactEmail = null,
  relationship = null
}) {

  const response = await fetch(
    'https://citas.onirikaclinicaestetica.com/.netlify/functions/booking',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },

      body: JSON.stringify({
        name: nombre,
        last_name: apellidos,
        phone: telefono,
        email: email,

        service_code: serviceCode,
        slot_start: slotStart,

        clinic_code: clinicCode,
        source: source,
        campaign: campaign,

        has_own_phone: hasOwnPhone,

referred_by_cliente_id: referredByClienteId,
contact_name: contactName,
contact_phone: contactPhone,
contact_email: contactEmail,
relationship: relationship
      })
    }
  );

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(
      result?.error ||
      'No se pudo crear la reserva'
    );
  }

  return result;
}


// =========================================================
// FINALIZAR MEMORIA DE RESERVA
// =========================================================

async function finalizeBooking({
  conversationId,
  clienteId,
  appointmentId,
  publicCode,
  reply
}) {

  return supabaseRpc(
    'finalize_chloe_booking',
    {
      p_conversation_id: conversationId,
      p_cliente_id: clienteId,
      p_appointment_id: appointmentId,
      p_public_code: publicCode,
      p_last_chloe_reply: reply
    }
  );
}
// =========================================================
// BUSCAR CONTACTO / REFERENTE EXISTENTE
// =========================================================

async function findExistingClient({
  nombreCompleto = null,
  telefono = null,
  clinicCode = 'VALENCIA'
}) {

  const result = await supabaseRpc(
    'find_existing_client',
    {
      p_nombre_completo: nombreCompleto,
      p_telefono: telefono,
      p_clinic_code: clinicCode
    }
  );

  if (!Array.isArray(result) || result.length === 0) {
    return null;
  }

  return result[0];
}
// =========================================================
// INTERPRETAR GESTIÓN DE CITA EXISTENTE
// =========================================================

async function interpretBookedAppointmentIntent(message) {

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
`Clasifica qué quiere hacer una persona con una cita ya existente.

Devuelve únicamente una de estas intenciones:

RESCHEDULE
CANCEL
CHECK_APPOINTMENT
OTHER

Ejemplos:

"Quiero cambiar mi cita"
"¿Podemos moverla al miércoles?"
"Necesito otra hora"
=> RESCHEDULE

"Quiero cancelar"
"No podré ir"
=> CANCEL

"¿A qué hora tengo la cita?"
"¿Cuándo era mi cita?"
"Recuérdame mi cita"
=> CHECK_APPOINTMENT

"Gracias"
"Perfecto"
"Vale"
=> OTHER

No inventes información.`
          },

          {
            role: 'user',
            content: message
          }
        ],

        text: {
          format: {
            type: 'json_schema',
            name: 'booked_appointment_intent',
            strict: true,

            schema: {
              type: 'object',
              additionalProperties: false,

              properties: {
                intent: {
                  type: 'string',
                  enum: [
                    'RESCHEDULE',
                    'CANCEL',
                    'CHECK_APPOINTMENT',
                    'OTHER'
                  ]
                }
              },

              required: [
                'intent'
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
      'Error interpretando gestión de cita'
    );
  }

  const text = extractOutputText(result);

  if (!text) {
    throw new Error(
      'OpenAI no devolvió intención de gestión de cita'
    );
  }

  return JSON.parse(text);
}
// =========================================================
// INTERPRETAR PREFERENCIA DE REPROGRAMACIÓN
// =========================================================

async function interpretReschedulePreference(message) {

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no configurada');
  }

  const nowMadrid = new Date().toLocaleDateString(
    'en-CA',
    {
      timeZone: 'Europe/Madrid'
    }
  );

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
`Interpreta únicamente la nueva preferencia de fecha y horario
para reprogramar una cita en Valencia, España.

Fecha actual en Valencia:
${nowMadrid}

Devuelve fechas en formato YYYY-MM-DD.
Devuelve horas en formato HH:MM.

Reglas:

- Si dice un día concreto como "miércoles",
  usa el próximo miércoles futuro.

- Si dice "mañana", calcula mañana
  respecto de la fecha actual indicada.

- "por la mañana":
  from_time = "10:00"
  to_time = "14:00"

- "por la tarde":
  from_time = "16:00"
  to_time = "20:00"

- Si da una hora concreta, por ejemplo "a las 18",
  from_time = "18:00"
  to_time = "18:00"

- Si solo da fecha y no franja,
  las horas deben ser null.

- Si solo da franja pero no fecha,
  las fechas deben ser null.

- from_date y to_date deben ser el mismo día
  cuando la persona pide un día concreto.

No inventes una fecha ni una hora que la persona no haya indicado
o que no pueda deducirse claramente.`
          },

          {
            role: 'user',
            content: message
          }
        ],

        text: {
          format: {
            type: 'json_schema',
            name: 'reschedule_preference',
            strict: true,

            schema: {
              type: 'object',
              additionalProperties: false,

              properties: {
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
      'Error interpretando nueva fecha de cita'
    );
  }

  const text = extractOutputText(result);

  if (!text) {
    throw new Error(
      'OpenAI no devolvió preferencia de reprogramación'
    );
  }

  return JSON.parse(text);
}
// =========================================================
// REPROGRAMAR CITA EXISTENTE
// =========================================================

async function reprogramAppointment({
  appointmentId,
  newStart,
  clinicCode = 'VALENCIA'
}) {

  const result = await supabaseRpc(
    'reprogram_appointment',
    {
      p_appointment_id:
        appointmentId,

      p_new_start:
        newStart,

      p_clinic_code:
        clinicCode
    }
  );

  if (
    !Array.isArray(result) ||
    result.length === 0
  ) {
    throw new Error(
      'No se pudo reprogramar la cita'
    );
  }

  return result[0];
}
// =========================================================
// CANCELAR CITA EXISTENTE
// =========================================================

async function cancelAppointment({
  appointmentId,
  clinicCode = 'VALENCIA',
  reason = null
}) {

  const result = await supabaseRpc(
    'cancel_appointment',
    {
      p_appointment_id: appointmentId,
      p_clinic_code: clinicCode,
      p_reason: reason
    }
  );

  if (
    !Array.isArray(result) ||
    result.length === 0
  ) {
    throw new Error(
      'No se pudo cancelar la cita'
    );
  }

  return result[0];
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
// CITA YA CONFIRMADA
// =====================================================

if (memory.state === 'BOOKED') {
  const bookedIntent =
    await interpretBookedAppointmentIntent(message);

  if (bookedIntent.intent === 'RESCHEDULE') {

    const reply =
      'Claro ✨ Podemos cambiar tu cita. ¿Qué día u horario te vendría mejor?';

    await updateConversation({
      conversationId:
        memory.conversation_id,

      state:
        'AWAITING_RESCHEDULE_PREFERENCE',

      lastUserMessage:
        message,

      lastChloeReply:
        reply
    });

    return jsonResponse(200, {
      success: true,
      action: 'NEED_RESCHEDULE_PREFERENCE',
      conversation_id:
        memory.conversation_id,
      appointment_id:
        memory.booked_appointment_id,
      service_code:
        memory.service_code,
      reply
    });
  }
  // =====================================================
// SOLICITUD DE CANCELACIÓN
// =====================================================

if (bookedIntent.intent === 'CANCEL') {

  const reply =
    'Claro ✨ Antes de hacerlo, necesito confirmarlo contigo. ¿Confirmas que deseas cancelar tu cita?';

  await updateConversation({
    conversationId: memory.conversation_id,
    state: 'AWAITING_CANCEL_CONFIRMATION',
    lastUserMessage: message,
    lastChloeReply: reply
  });

  return jsonResponse(200, {
    success: true,
    action: 'CONFIRM_CANCELLATION',
    conversation_id: memory.conversation_id,
    appointment_id: memory.booked_appointment_id,
    service_code: memory.service_code,
    reply
  });
}
// =====================================================
// CONSULTAR CITA CONFIRMADA
// =====================================================

if (bookedIntent.intent === 'CHECK_APPOINTMENT') {

  if (!memory.booked_appointment_id) {
    throw new Error(
      'No existe una cita asociada a esta conversación'
    );
  }

  const detailsResult = await supabaseRpc(
    'get_appointment_details',
    {
      p_appointment_id:
        memory.booked_appointment_id,

      p_clinic_code:
        memory.clinic_code ||
        'VALENCIA'
    }
  );

  if (
    !Array.isArray(detailsResult) ||
    detailsResult.length === 0
  ) {
    throw new Error(
      'No se pudieron recuperar los detalles de la cita'
    );
  }

  const details =
    detailsResult[0];

  const date = new Date(
    details.starts_at
  );

  const dateLabel =
    new Intl.DateTimeFormat(
      'es-ES',
      {
        timeZone:
          'Europe/Madrid',
        weekday:
          'long',
        day:
          'numeric',
        month:
          'long',
        year:
          'numeric'
      }
    ).format(date);

  const timeLabel =
    new Intl.DateTimeFormat(
      'es-ES',
      {
        timeZone:
          'Europe/Madrid',
        hour:
          '2-digit',
        minute:
          '2-digit',
        hour12:
          false
      }
    ).format(date);

  const oaeUrl =
    memory.public_code
      ? `https://citas.onirikaclinicaestetica.com/?id=${memory.public_code}`
      : null;

  const reply =
    `Claro ✨ Tu cita es el ${dateLabel} a las ${timeLabel}, ` +
    `para ${details.service_name}` +
    `${details.especialista ? ` con ${details.especialista}` : ''}. ` +
    `Te dejo también todos los detalles de tu experiencia.`;

  await updateConversation({
    conversationId:
      memory.conversation_id,

    state:
      'BOOKED',

    lastUserMessage:
      message,

    lastChloeReply:
      reply
  });

  return jsonResponse(200, {
    success: true,

    action:
      'APPOINTMENT_DETAILS',

    conversation_id:
      memory.conversation_id,

    appointment_id:
      details.appointment_id,

    service_code:
      details.service_code,

    service_name:
      details.service_name,

    specialist:
      details.especialista,

    starts_at:
      details.starts_at,

    ends_at:
      details.ends_at,

    status:
      details.status,

    public_code:
      memory.public_code,

    oae_url:
      oaeUrl,

    reply
  });
}
// =========================================================
// CANCELACIÓN — ESPERANDO CONFIRMACIÓN
// =========================================================

if (
  memory.state ===
  'AWAITING_CANCEL_CONFIRMATION'
) {

  const normalized =
    String(message || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const confirmed =
    [
      'si',
      'confirmo',
      'si confirmo',
      'si, confirmo',
      'cancelala',
      'cancelalo',
      'cancelar'
    ].includes(normalized);

  const rejected =
    [
      'no',
      'mejor no',
      'no gracias',
      'mantener',
      'mantenla',
      'dejala'
    ].includes(normalized);

  if (rejected) {

    const reply =
      'Perfecto ✨ Mantengo tu cita tal como está.';

    await updateConversation({
      conversationId: memory.conversation_id,
      state: 'BOOKED',
      lastUserMessage: message,
      lastChloeReply: reply
    });

    return jsonResponse(200, {
      success: true,
      action: 'CANCELLATION_ABORTED',
      conversation_id: memory.conversation_id,
      appointment_id: memory.booked_appointment_id,
      reply
    });
  }

  if (!confirmed) {

    const reply =
      'Para asegurarme ✨ ¿Confirmas que deseas cancelar tu cita? Puedes responder “sí” o “no”.';

    await updateConversation({
      conversationId: memory.conversation_id,
      state: 'AWAITING_CANCEL_CONFIRMATION',
      lastUserMessage: message,
      lastChloeReply: reply
    });

    return jsonResponse(200, {
      success: true,
      action: 'NEED_CANCELLATION_CONFIRMATION',
      conversation_id: memory.conversation_id,
      reply
    });
  }

  if (!memory.booked_appointment_id) {
    throw new Error(
      'No existe una cita asociada a esta conversación'
    );
  }

  const cancelled =
    await cancelAppointment({
      appointmentId: memory.booked_appointment_id,
      clinicCode: memory.clinic_code || 'VALENCIA',
      reason: 'Cancelación solicitada por cliente mediante CHLOE'
    });

  const reply =
    'Listo ✨ Tu cita ha quedado cancelada. Cuando quieras volver a reservar, estaré encantada de ayudarte.';

  await updateConversation({
    conversationId: memory.conversation_id,
    state: 'CANCELLED',
    lastUserMessage: message,
    lastChloeReply: reply
  });

  return jsonResponse(200, {
    success: true,
    action: 'APPOINTMENT_CANCELLED',
    conversation_id: memory.conversation_id,
    appointment_id: memory.booked_appointment_id,
    service_name: cancelled.service_name,
    specialist: cancelled.especialista,
    status: cancelled.status,
    public_code: memory.public_code,
    reply
  });
}
    // =========================================================
// REPROGRAMACIÓN — BUSCAR NUEVOS HORARIOS
// =========================================================

if (
  memory.state ===
  'AWAITING_RESCHEDULE_PREFERENCE'
) {

  const preference =
    await interpretReschedulePreference(message);

  const fromDate =
    preference.from_date;

  const toDate =
    preference.to_date;

  const fromTime =
    preference.from_time;

  const toTime =
    preference.to_time;


  // -----------------------------------------
  // NECESITAMOS AL MENOS UNA FECHA
  // -----------------------------------------

  if (!fromDate) {

    const reply =
      'Claro ✨ ¿Qué día te vendría mejor para tu nueva cita?';

    await updateConversation({
      conversationId:
        memory.conversation_id,

      state:
        'AWAITING_RESCHEDULE_PREFERENCE',

      lastUserMessage:
        message,

      lastChloeReply:
        reply
    });

    return jsonResponse(200, {
      success: true,
      action:
        'NEED_RESCHEDULE_DATE',

      conversation_id:
        memory.conversation_id,

      reply
    });
  }


  // -----------------------------------------
  // CONSULTAR DISPONIBILIDAD REAL
  // -----------------------------------------

  const params =
    new URLSearchParams({
      service:
        memory.service_code,

      from:
        fromDate,

      to:
        toDate || fromDate,

      appointment_type:
        memory.appointment_type ||
        'first_visit',

      clinic:
        memory.clinic_code ||
        'VALENCIA',

      max_results:
        '3'
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
    Array.isArray(
      availability.slots
    )
      ? availability.slots
      : [];


  // -----------------------------------------
  // SIN DISPONIBILIDAD
  // -----------------------------------------

  if (slots.length === 0) {

    const reply =
      'En esa franja no tengo disponibilidad. ' +
      '¿Quieres que busquemos otro horario o un día cercano? ✨';

    await updateConversation({
      conversationId:
        memory.conversation_id,

      state:
        'AWAITING_RESCHEDULE_PREFERENCE',

      lastUserMessage:
        message,

      lastChloeReply:
        reply
    });

    return jsonResponse(200, {
      success: true,

      action:
        'NO_RESCHEDULE_SLOTS',

      conversation_id:
        memory.conversation_id,

      reply
    });
  }


  // -----------------------------------------
  // OFRECER NUEVOS HORARIOS
  // -----------------------------------------

  const slotLabels =
    slots
      .map(slot =>
        slot.time_label
      )
      .filter(Boolean);


  const reply =
    `Perfecto ✨ Tengo estas opciones para cambiar tu cita: ${slotLabels.join(', ')}. ¿Cuál prefieres?`;


  await updateConversation({
    conversationId:
      memory.conversation_id,

    serviceCode:
      memory.service_code,

    appointmentType:
      memory.appointment_type ||
      'first_visit',

    fromDate,

    toDate:
      toDate || fromDate,

    fromTime,

    toTime,

    offeredSlots:
      slots,

    state:
      'OFFERING_RESCHEDULE_SLOTS',

    lastUserMessage:
      message,

    lastChloeReply:
      reply
  });


  return jsonResponse(200, {
    success: true,

    action:
      'OFFER_RESCHEDULE_SLOTS',

    conversation_id:
      memory.conversation_id,

    appointment_id:
      memory.booked_appointment_id,

    service_code:
      memory.service_code,

    slots,

    reply
  });
}
    // =====================================================
// DATOS DE LA PERSONA QUE RECIBIRÁ EL TRATAMIENTO
// =====================================================

if (
  memory.state === 'AWAITING_CLIENT_DATA' ||
  memory.state === 'AWAITING_PHONE'
) {

  const extracted =
    await interpretClientData(message);
const bookingForOtherPerson =
  extracted.booking_for_other_person === true;

const relationship =
  extracted.relationship ||
  memory.relationship ||
  null;

const contactName =
  extracted.contact_name ||
  memory.contact_name ||
  null;
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
const hasOwnPhone =
  bookingForOtherPerson
    ? false
    : (
        memory.has_own_phone !== null &&
        memory.has_own_phone !== undefined
          ? memory.has_own_phone
          : true
      );

const contactPhone =
  bookingForOtherPerson
    ? (
        extracted.telefono ||
        memory.contact_phone ||
        memory.telefono ||
        null
      )
    : null;
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

      hasOwnPhone,

contactName,
contactPhone,
relationship,

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

      hasOwnPhone,

contactName,
contactPhone,
relationship,

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
// YA TENEMOS DATOS MÍNIMOS:
// CREAR LA RESERVA REAL
// -----------------------------------------

if (!memory.selected_slot_start) {
  throw new Error(
    'No existe un horario seleccionado para esta conversación'
  );
}

if (!memory.service_code) {
  throw new Error(
    'No existe un tratamiento seleccionado para esta conversación'
  );
}

// -----------------------------------------
// SI ES UN FAMILIAR, BUSCAR REFERENTE
// EXISTENTE EN MASTER CRM
// -----------------------------------------

let referredByClienteId =
  memory.referred_by_cliente_id || null;

if (
  hasOwnPhone === false &&
  !referredByClienteId &&
  (contactName || contactPhone)
) {

  const existingContact =
    await findExistingClient({

      nombreCompleto:
        contactName || null,

      telefono:
        contactPhone || null,

      clinicCode:
        memory.clinic_code || 'VALENCIA'
    });

  if (existingContact) {
    referredByClienteId =
      existingContact.cliente_id;
  }
}
// Primero guardar los datos definitivos

await updateClientData({
  conversationId:
    memory.conversation_id,

  nombre,
  apellidos,
  telefono,
  email,

 hasOwnPhone,
referredByClienteId,
contactName,
contactPhone,
relationship,

  state:
    'READY_TO_BOOK'
});


// Crear cita real

const booking = await createBooking({

  nombre,
  apellidos,
  telefono,
  email,

  serviceCode:
    memory.service_code,

  slotStart:
    memory.selected_slot_start,

  clinicCode:
    memory.clinic_code || 'VALENCIA',

  source:
    memory.source || 'META',

  campaign:
  memory.campaign || null,

hasOwnPhone,

referredByClienteId,

contactName:
  contactName || memory.contact_name || null,

contactPhone:
  contactPhone || memory.contact_phone || null,

contactEmail:
  memory.contact_email || null,

relationship:
  relationship || memory.relationship || null
});


const reply =
  `Perfecto, ${nombre} ✨ Tu cita ha quedado confirmada ` +
  `para ${booking.date_label} a las ${booking.time_label}. ` +
  `Te atenderá ${booking.specialist}. ` +
  `Aquí tienes todos los detalles de tu experiencia: ${booking.oae_url}`;


// Vincular conversación con cita real

await finalizeBooking({

  conversationId:
    memory.conversation_id,

  clienteId:
    booking.cliente_id,

  appointmentId:
    booking.appointment_id,

  publicCode:
    booking.public_code,

  reply
});


return jsonResponse(200, {

  success: true,

  action:
    'BOOKING_CONFIRMED',

  conversation_id:
    memory.conversation_id,

  cliente_id:
    booking.cliente_id,

  appointment_id:
    booking.appointment_id,

  specialist:
    booking.specialist,

  service_name:
    booking.service_name,

  date_label:
    booking.date_label,

  time_label:
    booking.time_label,

  public_code:
    booking.public_code,

  oae_url:
    booking.oae_url,

  reply
});
}
    // =====================================================
    // 2. SI ESTAMOS ESPERANDO ELECCIÓN DE HORARIO
    // =====================================================
// =========================================================
// REPROGRAMACIÓN — ELECCIÓN DE NUEVO HORARIO
// =========================================================

if (
  memory.state ===
    'OFFERING_RESCHEDULE_SLOTS' &&
  Array.isArray(memory.offered_slots)
) {

  const selected =
    findSelectedSlot(
      message,
      memory.offered_slots
    );


  // -----------------------------------------
  // NO IDENTIFICAMOS LA OPCIÓN
  // -----------------------------------------

  if (!selected) {

    const options =
      memory.offered_slots
        .map(slot =>
          slot.time_label
        )
        .filter(Boolean)
        .join(', ');

    const reply =
      `No he podido identificar cuál horario prefieres ✨ ` +
      `Las opciones disponibles son: ${options}.`;

    await updateConversation({
      conversationId:
        memory.conversation_id,

      state:
        'OFFERING_RESCHEDULE_SLOTS',

      lastUserMessage:
        message,

      lastChloeReply:
        reply
    });

    return jsonResponse(200, {
      success: true,

      action:
        'NEED_RESCHEDULE_SLOT_SELECTION',

      conversation_id:
        memory.conversation_id,

      slots:
        memory.offered_slots,

      reply
    });
  }


  // -----------------------------------------
  // COMPROBAR QUE TENEMOS CITA ORIGINAL
  // -----------------------------------------

  if (!memory.booked_appointment_id) {

    throw new Error(
      'No existe una cita asociada a esta conversación'
    );
  }


  // -----------------------------------------
  // REPROGRAMAR LA MISMA CITA
  // -----------------------------------------

  const rescheduled =
    await reprogramAppointment({

      appointmentId:
        memory.booked_appointment_id,

      newStart:
        selected.slot_start,

      clinicCode:
        memory.clinic_code ||
        'VALENCIA'
    });


  // -----------------------------------------
  // CONSTRUIR CONFIRMACIÓN
  // -----------------------------------------

  const dateLabel =
    selected.date_label ||
    '';

  const timeLabel =
    selected.time_label ||
    '';

  const reply =
    `Perfecto ✨ Tu cita ha sido reprogramada` +
    `${dateLabel ? ` para ${dateLabel}` : ''}` +
    `${timeLabel ? ` a las ${timeLabel}` : ''}. ` +
    `Te atenderá ${rescheduled.especialista}.`;


  // -----------------------------------------
  // VOLVER A ESTADO BOOKED
  // Mantiene appointment_id y public_code
  // -----------------------------------------

  await updateConversation({
    conversationId:
      memory.conversation_id,

    selectedSlotStart:
      selected.slot_start,

    state:
      'BOOKED',

    lastUserMessage:
      message,

    lastChloeReply:
      reply
  });


  const oaeUrl =
    memory.public_code
      ? `https://citas.onirikaclinicaestetica.com/?id=${memory.public_code}`
      : null;


  return jsonResponse(200, {
    success: true,

    action:
      'APPOINTMENT_RESCHEDULED',

    conversation_id:
      memory.conversation_id,

    appointment_id:
      memory.booked_appointment_id,

    specialist:
      rescheduled.especialista,

    service_name:
      rescheduled.service_name,

    starts_at:
      rescheduled.starts_at,

    ends_at:
      rescheduled.ends_at,

    public_code:
      memory.public_code,

    oae_url:
      oaeUrl,

    reply
  });
}
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
