const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Servidor Ativo!');
});

app.post('/webhook', async (req, res) => {
    // 1. Responde 200 imediatamente
    res.sendStatus(200);

    const body = req.body;
    console.log("Recebido do MP:", JSON.stringify(body));

    // 2. Lógica ultra-sensível para pegar o ID
    let idPagamento = null;

    if (body.data && body.data.id) {
        idPagamento = body.data.id;
    } else if (body.id && body.type === 'payment') {
        idPagamento = body.id;
    } else if (body.resource) {
        // Extrai o ID de links como /v1/payments/123456
        idPagamento = body.resource.split('/').pop();
    }

    // 3. Só ignora se for o ID de teste específico ou se não tiver ID nenhum
    if (!idPagamento || idPagamento === '123456789' || idPagamento === 123456789) {
        console.log("Ignorado: Notificação de teste ou sem ID.");
        return;
    }

    // Se chegou aqui, temos um ID!
    try {
        console.log(`Processando Pagamento Real: ${idPagamento}`);

        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const pagamento = mpResponse.data;

        if (pagamento.status === 'approved') {
            // Busca e-mail em todas as gavetas possíveis
            let emailCliente = pagamento.payer?.email || 
                               pagamento.additional_info?.payer?.email || 
                               pagamento.metadata?.email;

            if (!emailCliente || !emailCliente.includes('@')) {
                emailCliente = `cliente_${idPagamento}@mercadopago.com`;
            }

            const nomeCliente = pagamento.payer?.first_name || "Cliente Real";

            // Envia para Zaplink
            const resZaplink = await axios.post('https://control.zaplink.net/api/generate_license', {
                token: process.env.ZAPLINK_TOKEN,
                name: nomeCliente,
                email: emailCliente.trim(),
                product_id: "waoriginal" 
            });

            console.log(`✅ Finalizado para: ${emailCliente} | Status Zaplink: ${resZaplink.data.status}`);
        } else {
            console.log(`Pagamento ${idPagamento} está com status: ${pagamento.status}`);
        }

    } catch (error) {
        console.error('Erro no processamento:', error.response?.data || error.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));