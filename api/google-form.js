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

    // Datos limpios provenientes del Google Form
    const lead = {
      sourceRow: data.row,
      receivedAt: data.receivedAt,

      name: getAnswer("Nombre Viajero Principal"),
      email: getAnswer("Mail de contacto"),
      whatsapp: getAnswer("Wpp de Contacto"),

      travelersText: getAnswer("Cantidad de personas que viajan"),
      travelDates: getAnswer("Fechas del viaje"),
      nights: getAnswer("Cantidad de noches"),

      quotationType: getAnswer("Que tipo de cotización buscas"),
      parkDays: getAnswer("Si buscan parques Disney o Universal"),
      carDetails: getAnswer("Solo si seleccionaste la opción de Auto"),

      documents: getAnswer(
        "Tenes Visa / Pasaporte",
        "Visa / Pasaporte"
      ),

      firstTrip: getAnswer(
        "Es su primer viaje",
        "primer viaje a Disney"
      ),

      source: getAnswer("Como nos conociste"),
      instagram: getAnswer("Instagram de Contacto"),

      comments: getAnswer(
        "requerimiento especial",
        "algo que quieras aclarar"
      ),
    };

    console.log("Lead normalizado:", lead);

    // ================================
    // 1. ANÁLISIS CON GEMINI
    // ================================

    const geminiApiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!geminiApiKey) {
      throw new Error(
        "Falta GOOGLE_GENERATIVE_AI_API_KEY"
      );
    }

    const prompt = `
Sos el motor de análisis comercial de LeadPilot AI para una agencia especializada en viajes a Disney y Orlando.

Analizá este potencial cliente y devolvé ÚNICAMENTE un objeto JSON válido.
No agregues markdown.
No agregues explicaciones fuera del JSON.

DATOS DEL LEAD:

Nombre: ${lead.name}
Email: ${lead.email}
WhatsApp: ${lead.whatsapp}
Viajeros: ${lead.travelersText}
Fechas: ${lead.travelDates}
Cantidad de noches: ${lead.nights}
Cotización buscada: ${lead.quotationType}
Parques: ${lead.parkDays}
Auto: ${lead.carDetails}
Visa/Pasaporte: ${lead.documents}
Primer viaje: ${lead.firstTrip}
Origen del lead: ${lead.source}
Instagram: ${lead.instagram}
Comentarios adicionales: ${lead.comments}

Tu objetivo es evaluar la viabilidad comercial y la intención de compra.

El score debe ser entre 0 y 100.

Prioridad:
- high: lead de alta prioridad
- medium: prioridad media
- low: baja prioridad

intentLevel:
- high
- medium
- low

Si no existe un presupuesto informado, budget debe ser 0.

Si no se pueden determinar fechas exactas, podés estimarlas si el cliente indicó claramente mes y año. Si tampoco es posible, usá string vacío.

travelers debe ser numérico. Inferilo de la descripción de viajeros. Si no puede determinarse, usar 0.

destination debe inferirse de lo que solicita el cliente.

tripType debe resumir el tipo de viaje, por ejemplo:
Familia
Pareja
Amigos
Solo
Grupo

Generá exactamente esta estructura:

{
  "score": 0,
  "budget": 0,
  "intent": "",
  "endDate": "",
  "priority": "medium",
  "tripType": "",
  "startDate": "",
  "travelers": 0,
  "nextAction": "",
  "destination": "",
  "intentLevel": "medium",
  "missingInfo": [],
  "scoreReason": "",
  "customerInfo": "",
  "scoreFactors": [
    {
      "detail": "",
      "impact": "positive",
      "points": 0,
      "criterion": ""
    }
  ],
  "suggestedResponse": ""
}

La respuesta sugerida debe estar escrita en español, ser natural, comercial y servir para enviar directamente al cliente por WhatsApp o email.
`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        geminiApiKey
      )}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      }
    );

    const geminiResult = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Error Gemini:", geminiResult);
      throw new Error("Gemini no pudo analizar el lead");
    }

    const aiText =
      geminiResult?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiText) {
      throw new Error(
        "Gemini no devolvió un análisis válido"
      );
    }

    const cleanedJson = aiText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const aiAnalysis = JSON.parse(cleanedJson);

    // Validaciones mínimas
    aiAnalysis.score = Math.max(
      0,
      Math.min(100, Number(aiAnalysis.score) || 0)
    );

    if (
      !["high", "medium", "low"].includes(
        aiAnalysis.priority
      )
    ) {
      aiAnalysis.priority = "medium";
    }

    console.log("Análisis Gemini:", aiAnalysis);

    // ================================
    // 2. GUARDAR EN SUPABASE
    // ================================

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
      throw new Error(
        "Faltan variables de Supabase"
      );
    }

    const supabaseResponse = await fetch(
      `${supabaseUrl}/rest/v1/leads`,
      {
        method: "POST",
        headers: {
          apikey: supabaseSecretKey,
          Authorization: `Bearer ${supabaseSecretKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          form_row: data.row,
          received_at:
            data.receivedAt || new Date().toISOString(),

          // Conservamos el formulario original completo
          answers: answers,

          status: "pending",

          score: aiAnalysis.score,
          priority: aiAnalysis.priority,

          // LeadPilot ya entiende esta estructura
          ai_analysis: aiAnalysis,
        }),
      }
    );

    const savedLead = await supabaseResponse.json();

    if (!supabaseResponse.ok) {
      console.error("Error Supabase:", savedLead);
      throw new Error(
        "No se pudo guardar el lead en Supabase"
      );
    }

    console.log("Lead guardado:", savedLead);

    // ================================
    // 3. RESPUESTA FINAL
    // ================================

    return res.status(200).json({
      success: true,
      message:
        "Lead recibido, analizado y guardado correctamente",
      score: aiAnalysis.score,
      priority: aiAnalysis.priority,
      analysis: aiAnalysis,
      databaseLead: savedLead[0],
    });
  } catch (error) {
    console.error("Error LeadPilot:", error);

    return res.status(500).json({
      success: false,
      message: "Error procesando el lead",
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
};
