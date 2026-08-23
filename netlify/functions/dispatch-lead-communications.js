exports.handler = async () => {

  const SUPABASE_URL =
    process.env.SUPABASE_URL;

  const SUPABASE_SECRET_KEY =
    process.env.SUPABASE_SECRET_KEY;

  if (
    !SUPABASE_URL ||
    !SUPABASE_SECRET_KEY
  ) {

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error:
          'Configuración de Supabase incompleta'
      })
    };
  }


  try {

    // =====================================================
    // 1. BUSCAR FOLLOW-UPS PENDIENTES Y VENCIDOS
    // =====================================================

    const now =
      new Date().toISOString();

    const queryUrl =
      `${SUPABASE_URL}/rest/v1/lead_communications` +
      `?status=eq.pending` +
      `&scheduled_for=lte.${encodeURIComponent(now)}` +
      `&channel=eq.WHATSAPP` +
      `&event_type=eq.LEAD_FOLLOWUP` +
      `&order=scheduled_for.asc` +
      `&limit=20`;


    const response =
      await fetch(
        queryUrl,
        {
          headers: {
            apikey:
              SUPABASE_SECRET_KEY,

            Authorization:
              `Bearer ${SUPABASE_SECRET_KEY}`,

            Accept:
              'application/json'
          }
        }
      );


    if (!response.ok) {

      const detail =
        await response.text();

      return {
        statusCode: 500,
        headers: {
          'Content-Type':
            'application/json'
        },
        body: JSON.stringify({
          success: false,
          error:
            'No se pudo consultar la cola de follow-ups',
          detail
        })
      };
    }


    const communications =
      await response.json();


    if (
      !Array.isArray(communications) ||
      communications.length === 0
    ) {

      return {
        statusCode: 200,
        headers: {
          'Content-Type':
            'application/json',
          'Cache-Control':
            'no-store'
        },
        body: JSON.stringify({
          success: true,
          dry_run: true,
          processed: 0,
          communications: []
        })
      };
    }


    // =====================================================
    // 2. PROCESAR EN DRY RUN
    // =====================================================

    const results = [];


    for (const communication of communications) {

      try {

        const rpcUrl =
          `${SUPABASE_URL}/rest/v1/rpc/mark_lead_communication_dry_run`;


        const markResponse =
          await fetch(
            rpcUrl,
            {
              method:
                'POST',

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
                JSON.stringify({
                  p_communication_id:
                    communication.id
                })
            }
          );


        if (!markResponse.ok) {

          const detail =
            await markResponse.text();

          results.push({
            communication_id:
              communication.id,

            success:
              false,

            error:
              detail
          });

          continue;
        }


        const marked =
          await markResponse.json();


        results.push({

          communication_id:
            communication.id,

          lead_id:
            communication.lead_id,

          sequence_step:
            communication.sequence_step,

          recipient_name:
            communication.recipient_name,

          recipient_phone:
            communication.recipient_phone,

          message_text:
            communication.message_text,

          scheduled_for:
            communication.scheduled_for,

          dry_run:
            true,

          success:
            true,

          attempt_count:
            Array.isArray(marked)
              ? marked[0]?.attempt_count
              : marked?.attempt_count

        });


      } catch (e) {

        results.push({
          communication_id:
            communication.id,

          success:
            false,

          error:
            e.message
        });
      }
    }


    // =====================================================
    // 3. DEVOLVER PREVIEW
    // =====================================================

    return {

      statusCode:
        200,

      headers: {
        'Content-Type':
          'application/json',

        'Cache-Control':
          'no-store'
      },

      body:
        JSON.stringify({

          success:
            true,

          dry_run:
            true,

          processed:
            results.filter(
              r => r.success
            ).length,

          failed:
            results.filter(
              r => !r.success
            ).length,

          communications:
            results

        })
    };


  } catch (e) {

    return {

      statusCode:
        500,

      headers: {
        'Content-Type':
          'application/json'
      },

      body:
        JSON.stringify({
          success:
            false,

          error:
            'Error interno en dispatch-lead-communications',

          detail:
            e.message
        })
    };
  }
};
