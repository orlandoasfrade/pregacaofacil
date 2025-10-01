const functions = require("firebase-functions");
const mercadopago = require("mercadopago");
const admin = require("firebase-admin");

admin.initializeApp();

// Configure o Mercado Pago com seu Access Token SECRETO
mercadopago.configure({
  access_token: "APP_USR-TEST-442684176139714-091217-1f49b7fa50cb572f3db1c8ed13bb08c6-186666701",
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
        success: "https://orlandoasfrade.github.io/pregacaofacil/",
        failure: "https://orlandoasfrade.github.io/pregacaofacil/",
        pending: "https://orlandoasfrade.github.io/pregacaofacil/",
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

    // Focamos apenas em notificações do tipo 'payment'
    if (type === 'payment') {
        try {
            // Buscamos os detalhes completos do pagamento no Mercado Pago
            const payment = await mercadopago.payment.findById(data.id);
            const userId = payment.body.external_reference;
            
            // Se o pagamento foi aprovado e está associado a um usuário
            if (userId && payment.body.status === 'approved') {
                const userRef = admin.firestore().collection('users').doc(userId);
                
                // Atualizamos o documento do usuário no Firestore para ativar a assinatura
                await userRef.update({
                    subscriptionActive: true,
                    lastPaymentId: data.id,
                    planId: payment.body.preapproval_plan_id || null 
                });
                console.log(`Assinatura ativada para o usuário: ${userId}`);
            }
        } catch (error) {
            console.error('Erro ao processar notificação do Mercado Pago:', error);
            res.status(500).send('Erro interno ao processar notificação');
            return;
        }
    }
    
    // Respondemos ao Mercado Pago para confirmar que recebemos a notificação
    res.status(200).send('Notificação recebida com sucesso');
});

