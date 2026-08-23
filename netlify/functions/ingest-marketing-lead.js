exports.handler = async (event) => {

  const jsonHeaders = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };


  // =====================================================
  // 1. SOLO POST
  // =====================================================

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        ...jsonHeaders,
        Allow: 'POST'
      },
      body: JSON.stringify({
        success: false,
        error: 'Método no permitido'
      })
    };
  }


  // =====================================================
  // 2. VARIABLES INTERNAS
  // =====================================================

  const SUPABASE_URL =
    process.env.SUPABASE_URL;

  const SUPABASE_SECRET_KEY =
    process.env.SUPABASE_SECRET_KEY;


  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Configuración interna incompleta'
      })
    };
  }


  try {

    // =====================================================
    // 3. LEER JSON
    // =====================================================

    let body;

    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({
          success: false,
          error: 'JSON inválido'
        })
      };
    }


    // =====================================================
    // 4. CLAVE DE INTEGRACIÓN
    // =====================================================

    const rawAgencyKey =
      event.headers?.['x-onirika-agency-key'] ||
      event.headers?.['X-Onirika-Agency-Key'] ||
      null;


    if (!rawAgencyKey || !rawAgencyKey.trim()) {
      return {
        statusCode: 401,
        headers: jsonHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Credencial de integración requerida'
        })
      };
    }


    // =====================================================
    // 5. CLÍNICA
    // =====================================================

    const clinic_code =
      body.clinic_code?.trim() ||
      'VALENCIA';


    // =====================================================
    // 6. RESOLVER AGENCIA DESDE LA CLAVE
    // =====================================================

    const resolveUrl =
      `${SUPABASE_URL}/rest/v1/rpc/resolve_agency_by_integration_key`;


    const resolveResponse =
      await fetch(resolveUrl, {
        method: 'POST',

        headers: {
          apikey: SUPABASE_SECRET_KEY,
          Authorization:
            `Bearer ${SUPABASE_SECRET_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },

        body: JSON.stringify({
          p_raw_key: rawAgencyKey.trim(),
          p_clinic_code: clinic_code
        })
      });


    if (!resolveResponse.ok) {

      console.error(
        'Agency key resolution failed:',
        await resolveResponse.text()
      );

      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({
          success: false,
          error: 'No se pudo validar la integración'
        })
      };
    }


    const agencyData =
      await resolveResponse.json();

    const agency =
      Array.isArray(agencyData)
        ? agencyData[0]
        : agencyData;


    if (!agency?.agency_code) {
      return {
        statusCode: 401,
        headers: jsonHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Credencial de integración inválida'
        })
      };
    }


    // =====================================================
    // 7. NORMALIZAR LEAD
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


    // =====================================================
    // 8. VALIDACIONES
    // =====================================================

    if (!first_name) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Falta first_name'
        })
      };
    }


    if (!phone && !email) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({
          success: false,
          error:
            'El lead debe tener al menos phone o email'
        })
      };
    }


    if (!service_code) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Falta service_code'
        })
      };
    }


    // =====================================================
    // 9. PAYLOAD SEGURO
    //
    // IMPORTANTE:
    // agency_code NO se toma del body.
    // Lo determina exclusivamente la credencial.
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
        agency.agency_code,

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
    // 10. INGESTAR LEAD
    // =====================================================

    const ingestUrl =
      `${SUPABASE_URL}/rest/v1/rpc/ingest_marketing_lead`;


    const response =
      await fetch(ingestUrl, {
        method: 'POST',

        headers: {
          apikey: SUPABASE_SECRET_KEY,
          Authorization:
            `Bearer ${SUPABASE_SECRET_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },

        body:
          JSON.stringify(rpcPayload)
      });


    if (!response.ok) {

      const detail =
        await response.text();

      console.error(
        'ingest_marketing_lead RPC error:',
        detail
      );

      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({
          success: false,
          error: 'No se pudo registrar el lead'
        })
      };
    }


    const data =
      await response.json();

    const result =
      Array.isArray(data)
        ? data[0]
        : data;


    if (!result) {
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({
          success: false,
          error: 'No se obtuvo resultado del lead'
        })
      };
    }


    // =====================================================
    // 11. RESPUESTA
    // =====================================================

    return {
      statusCode: 200,
      headers: jsonHeaders,

      body: JSON.stringify({

        success: true,

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
      headers: jsonHeaders,
      body: JSON.stringify({
        success: false,
        error:
          'Error interno al registrar el lead'
      })
    };
  }
};
