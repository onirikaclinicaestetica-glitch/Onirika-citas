exports.handler = async (event) => {

  // =====================================================
  // 1. SOLO PERMITIR POST
  // =====================================================

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST'
      },
      body: JSON.stringify({
        success: false,
        error: 'Método no permitido'
      })
    };
  }


  // =====================================================
  // 2. VARIABLES DE ENTORNO
  // =====================================================

  const SUPABASE_URL =
    process.env.SUPABASE_URL;

  const SUPABASE_SECRET_KEY =
    process.env.SUPABASE_SECRET_KEY;


  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: 'Configuración de Supabase incompleta'
      })
    };
  }


  try {

    // =====================================================
    // 3. LEER BODY
    // =====================================================

    let body;

    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'JSON inválido'
        })
      };
    }


    // =====================================================
    // 4. NORMALIZAR DATOS
    // =====================================================

    const first_name =
      body.first_name?.trim();

    const last_name =
      body.last_name?.trim() || null;

    const phone =
      body.phone?.trim() || null;

    const email =
      body.email?.trim() || null;

    const service_code =
      body.service_code?.trim();

    const source =
      body.source?.trim() || 'META';

    const campaign =
      body.campaign?.trim() || null;

    const agency_code =
      body.agency_code?.trim() || null;

    const clinic_code =
      body.clinic_code?.trim() || 'VALENCIA';


    // =====================================================
    // 5. VALIDACIONES
    // =====================================================

    if (!first_name) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'Falta first_name'
        })
      };
    }


    if (!phone && !email) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'El lead debe tener al menos phone o email'
        })
      };
    }


    if (!service_code) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'Falta service_code'
        })
      };
    }


    // =====================================================
    // 6. PAYLOAD PARA SUPABASE
    // =====================================================

    const rpcPayload = {

      p_first_name:
        first_name,

      p_last_name:
        last_name,

      p_phone:
        phone,

      p_email:
        email,

      p_service_code:
        service_code,

      p_source:
        source,

      p_campaign:
        campaign,

      p_agency_code:
        agency_code,

      p_meta_campaign_id:
        body.meta_campaign_id || null,

      p_meta_adset_id:
        body.meta_adset_id || null,

      p_meta_ad_id:
        body.meta_ad_id || null,

      p_meta_lead_id:
        body.meta_lead_id || null,

      p_meta_form_id:
        body.meta_form_id || null,

      p_landing_page:
        body.landing_page || null,

      p_utm_source:
        body.utm_source || null,

      p_utm_medium:
        body.utm_medium || null,

      p_utm_campaign:
        body.utm_campaign || null,

      p_utm_content:
        body.utm_content || null,

      p_clinic_code:
        clinic_code
    };


    // =====================================================
    // 7. LLAMAR RPC
    // =====================================================

    const rpcUrl =
      `${SUPABASE_URL}/rest/v1/rpc/ingest_marketing_lead`;


    const response =
      await fetch(
        rpcUrl,
        {
          method: 'POST',

          headers: {
            apikey:
              SUPABASE_SECRET_KEY,

            Authorization:
              `Bearer ${SUPABASE_SECRET_KEY}`,

            'Content-Type':
              'application/json',

            Accept:
              'application/json'
          },

          body:
            JSON.stringify(rpcPayload)
        }
      );


    // =====================================================
    // 8. CONTROLAR ERROR SUPABASE
    // =====================================================

    if (!response.ok) {

      const detail =
        await response.text();

      console.error(
        'ingest_marketing_lead RPC error:',
        detail
      );

      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error:
            'No se pudo registrar el lead',
          detail
        })
      };
    }


    // =====================================================
    // 9. RESULTADO
    // =====================================================

    const data =
      await response.json();

    const result =
      Array.isArray(data)
        ? data[0]
        : data;


    if (!result) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error:
            'Supabase no devolvió el lead'
        })
      };
    }


    // =====================================================
    // 10. RESPUESTA PÚBLICA
    // =====================================================

    return {
      statusCode: 200,

      headers: {
        'Content-Type':
          'application/json',

        'Cache-Control':
          'no-store'
      },

      body: JSON.stringify({

        success:
          true,

        lead_id:
          result.lead_id,

        created_new:
          result.created_new,

        lead_status:
          result.lead_status,

        agency_code:
          result.agency_code,

        service_code:
          result.service_code,

        attribution_status:
          result.attribution_status,

        duplicate_of_lead_id:
          result.duplicate_of_lead_id,

        attribution_reason:
          result.attribution_reason,

        inherited_opt_out:
          result.inherited_opt_out,

        followups_created:
          result.followups_created
      })
    };


  } catch (e) {

    console.error(
      'ingest-marketing-lead error:',
      e
    );

    return {
      statusCode: 500,

      headers: {
        'Content-Type':
          'application/json'
      },

      body: JSON.stringify({
        success: false,
        error:
          'Error interno al registrar el lead'
      })
    };
  }
};
