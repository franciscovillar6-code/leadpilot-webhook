module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      message: "LeadPilot Webhook funcionando",
    });
  }

  if (req.method === "POST") {
    try {
      const lead = req.body;

      console.log("Nuevo lead recibido:", lead);

      return res.status(200).json({
        success: true,
        message: "Lead recibido correctamente",
        lead,
      });
    } catch (error) {
      console.error("Error:", error);

      return res.status(500).json({
        success: false,
        message: "Error procesando el lead",
      });
    }
  }

  return res.status(405).json({
    success: false,
    message: "Método no permitido",
  });
};
