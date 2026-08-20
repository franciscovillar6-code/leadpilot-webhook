module.exports = async function handler(req, res) {
  // Permite comprobar desde el navegador que el webhook está activo
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

    // Busca una respuesta por una parte del nombre de la pregunta
    const getAnswer = (texto) => {
      const key = Object.keys(answers).find((k) =>
        k.toLowerCase().includes(texto.toLowerCase())
      );

      if (!key) return "";

      const value = answers[key];

      return Array.isArray(value) ? value.join(", ") : value;
    };

    // Convertimos el Google Form en un lead limpio
    const lead = {
      sourceRow: data.row,
      receivedAt: data.receivedAt,

      name: getAnswer("Nombre Viajero Principal"),
      email: getAnswer("Mail de contacto"),
      whatsapp: getAnswer("Wpp de Contacto"),

      travelers: getAnswer("Cantidad de personas que viajan"),
      travelDates: getAnswer("Fechas del viaje"),
      nights: getAnswer("Cantidad de noches"),

      quotationType: getAnswer("Que tipo de cotización buscas"),
      parkDays: getAnswer("Si buscan parques Disney o Universal"),
      carDetails: getAnswer("Solo si seleccionaste la opción de Auto"),

      documents: getAnswer("Tenes Visa / Pasaporte"),
      firstTrip: getAnswer("Es su primer viaje"),
      source: getAnswer("Como nos conociste"),
      instagram: getAnswer("Instagram de Contacto"),

      comments: getAnswer("requerimiento especial"),
    };

    console.log("Lead limpio recibido:", lead);

    return res.status(200).json({
      success: true,
      message: "Lead recibido y normalizado correctamente",
      lead,
    });
  } catch (error) {
    console.error("Error procesando lead:", error);

    return res.status(500).json({
      success: false,
      message: "Error procesando el lead",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
