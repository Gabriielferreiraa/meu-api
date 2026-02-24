const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
    res.sendStatus(200);

    const { body } = req;
    // Pega o ID de qualquer lugar que ele venha (data.id ou id direto)
    const idPagamento = (body.data && body.data.id) ? body.data.id : body.id;

    // Ignora se não tiver ID ou se for apenas teste de abertura de link
    if (!idPagamento || idPagamento === '123456789' || body.action === 'opened') {
        console.log("Aviso de teste ou ID inválido recebido.");
        return;
    }

    try {
        console.log(`Consultando pagamento real: ${idPagamento}`);

        // Tentativa de busca direta na API de Payments
        const response = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 
                'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}`
            }
        });

        const pagamento = response.data;

        if (pagamento.status === 'approved') {
            console.log(`Pagamento ${idPagamento} APROVADO.`);
            
            await axios.post('https://control.zaplink.net/api/generate_license', {
                token: process.env.ZAPLINK_TOKEN,
                name: pagamento.payer.first_name || "Cliente",
                email: pagamento.payer.email,
                product_id: "waoriginal"
            });
            
            console.log(`Licença solicitada com sucesso para ${pagamento.payer.email}`);
        } else {
            console.log(`Pagamento encontrado, mas o status é: ${pagamento.status}`);
        }

    } catch (error) {
        // Se der erro 404 aqui, é porque o ID enviado não é de um pagamento
        console.error('Erro na consulta ao Mercado Pago:', error.response?.data?.message || error.message);
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Servidor rodando'));