module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      message: "LeadPilot Webhook funcionando",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Método no permitido",
    });
  }

  try {
    const data = req.body;
    const answers = data.answers || {};

    const getAnswer = (...terms) => {
      const key = Object.keys(answers).find((currentKey) => {
        const normalized = currentKey.toLowerCase();

        return terms.some((term) =>
          normalized.includes(term.toLowerCase())
        );
      });

      if (!key) return "";

      const value = answers[key];

      return Array.isArray(value)
        ? value.join(", ")
        : String(value ?? "");
    };

    // ================================
    // NORMALIZAR DATOS DEL GOOGLE FORM
    // ================================

    const lead = {
      sourceRow: data.row,
      receivedAt: data.receivedAt,

      name: getAnswer("Nombre Viajero Principal"),
      email: getAnswer("Mail de contacto"),
      whatsapp: getAnswer("Wpp de Contacto"),

      travelersText: getAnswer(
        "Cantidad de personas que viajan"
      ),

      travelDates: getAnswer(
        "Fechas del viaje"
      ),

      nights: getAnswer(
        "Cantidad de noches"
      ),

      quotationType: getAnswer(
        "Que tipo de cotización buscas"
      ),

      parkDays: getAnswer(
        "Si buscan parques Disney o Universal"
      ),

      carDetails: getAnswer(
        "Solo si seleccionaste la opción de Auto"
      ),

      documents: getAnswer(
        "Tenes Visa / Pasaporte",
        "Visa / Pasaporte"
      ),

      firstTrip: getAnswer(
        "Es su primer viaje",
        "primer viaje a Disney"
      ),

      source: getAnswer(
        "Como nos conociste"
      ),

      instagram: getAnswer(
        "Instagram de Contacto"
      ),

      comments: getAnswer(
        "requerimiento especial",
        "algo que quieras aclarar"
      ),
    };

    console.log("Lead normalizado:", lead);

    // ================================
    // GEMINI
    // ================================

    const geminiApiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!geminiApiKey) {
      throw new Error(
        "Falta GOOGLE_GENERATIVE_AI_API_KEY"
      );
    }

    const prompt = `
Sos el motor de análisis comercial de LeadPilot AI.

LeadPilot analiza potenciales clientes de una agencia especializada
en viajes a Disney, Universal, Orlando y Miami.

Analizá el siguiente lead y devolvé ÚNICAMENTE un objeto JSON válido.

NO uses markdown.
NO uses bloques de código.
NO escribas explicaciones fuera del JSON.

DATOS DEL CLIENTE

Nombre:
${lead.name}

Email:
${lead.email}

WhatsApp:
${lead.whatsapp}

Cantidad y composición de viajeros:
${lead.travelersText}

Fechas estimadas o exactas:
${lead.travelDates}

Cantidad de noches:
${lead.nights}

Tipo de cotización solicitada:
${lead.quotationType}

Cantidad de días de parques:
${lead.parkDays}

Información de alquiler de auto:
${lead.carDetails}

Visa / Pasaporte:
${lead.documents}

Primer viaje a Disney o Universal:
${lead.firstTrip}

Cómo conoció la agencia:
${lead.source}

Instagram:
${lead.instagram}

Comentarios adicionales:
${lead.comments}


OBJETIVO DEL ANÁLISIS

Evaluá:

- Calidad del lead.
- Claridad de la solicitud.
- Cercanía de la fecha del viaje.
- Cantidad de viajeros.
- Definición del destino.
- Definición del producto solicitado.
- Documentación necesaria para viajar.
- Información faltante.
- Señales concretas de intención de compra.
- Probabilidad de avanzar con una cotización.

Generá un score comercial entre 0 y 100.

PRIORIDAD

high:
Lead muy completo o con señales concretas de intención de compra.

medium:
Lead viable, pero todavía faltan datos importantes.

low:
Lead poco definido, lejano, incompleto o con baja intención aparente.


INTENT LEVEL

Debe ser uno de estos valores:

high
medium
low


PRESUPUESTO

Si el cliente no informó presupuesto:

budget = 0


FECHAS

Si existen fechas exactas:
usarlas.

Si solamente se indicó claramente mes y año:
podés usar como referencia el primer y último día de ese mes.

Si no se puede determinar:
usar "".


VIAJEROS

travelers debe ser un número.

Inferilo de la descripción del formulario.

Ejemplos:

"2 adultos y 2 niños" = 4

"2 adultos" = 2

Si no puede determinarse:
0


DESTINO

Inferilo según la cotización solicitada.

Ejemplos:

Disney World, Orlando
Universal Orlando
Orlando
Miami
Disney + Universal, Orlando


TIPO DE VIAJE

tripType debe resumirse como:

Familia
Pareja
Amigos
Solo
Grupo

si corresponde.


RESPUESTA SUG
