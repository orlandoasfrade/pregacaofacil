const functions = require("firebase-functions");
const mercadopago = require("mercadopago");
const admin = require("firebase-admin");

admin.initializeApp();

// Configure o Mercado Pago com seu Access Token de TESTE
mercadopago.configure({
  access_token: "TEST-442684176139714-091217-1f49b7fa50cb572f3db1c8ed13bb08c6-186666701",
});

// FUNÇÃO 1: Cria o link de pagamento para o usuário
exports.createPaymentPreference = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Você precisa estar logado para assinar.");
  }
  const { planId } = data;
  const userId = context.auth.uid;
  const userEmail = context.auth.token.email;

  const preference = {
    preapproval_plan_id: planId,
    payer: { email: userEmail },
    back_urls: {
        success: "https://pregacaofacil.vercel.app/",
        failure: "https://pregacaofacil.vercel.app/",
        pending: "https://pregacaofacil.vercel.app/",
    },
    auto_return: "approved",
    external_reference: userId,
  };

  try {
    const response = await mercadopago.preapproval.create(preference);
    return { init_point: response.body.init_point };
  } catch (error) {
    console.error("Erro ao criar preferência do Mercado Pago:", error);
    throw new functions.https.HttpsError("internal", "Não foi possível criar o link de pagamento.");
  }
});

// FUNÇÃO 2: Ouve as notificações do Mercado Pago (Webhook)
exports.mercadoPagoWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    const { type, data } = req.body;

    if (type === 'payment') {
        try {
            const payment = await mercadopago.payment.findById(data.id);
            const userId = payment.body.external_reference;
            const preapprovalId = payment.body.preapproval_id; // ID da assinatura

            if (userId && payment.body.status === 'approved') {
                const userRef = admin.firestore().collection('users').doc(userId);
                await userRef.update({
                    subscriptionActive: true,
                    subscriptionId: preapprovalId, // Guardamos o ID da assinatura
                    lastPaymentId: data.id,
                });
                console.log(`Assinatura ativada para o usuário: ${userId} com subscriptionId: ${preapprovalId}`);
            }
        } catch (error) {
            console.error('Erro ao processar notificação de pagamento:', error);
            res.status(500).send('Erro interno');
            return;
        }
    }
    
    res.status(200).send('Notificação recebida');
});

