const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
    // 1. Responder ao Mercado Pago que recebemos o sinal
    res.sendStatus(200);

    // 2. Capturar o ID do pagamento
    const { body } = req;
    const idPagamento = body.data?.id || body.id;

    // Se for apenas um teste de conexão do MP, ignoramos
    if (!idPagamento || body.action === 'opened') return;

    try {
        console.log(`Verificando pagamento: ${idPagamento}`);

        // 3. Consultar o Mercado Pago para validar o pagamento
        // Usamos o MP_ACCESS_TOKEN que você acabou de colocar no Render
        const response = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
        });

        const pagamento = response.data;

        // 4. Se o pagamento estiver aprovado, pedimos a licença à Zaplink
        if (pagamento.status === 'approved') {
            const emailCliente = pagamento.payer.email;
            const nomeCliente = pagamento.payer.first_name || "Cliente";

            console.log(`Pagamento Aprovado! Gerando licença para: ${emailCliente}`);

            await axios.post('https://control.zaplink.net/api/generate_license', {
                token: process.env.ZAPLINK_TOKEN,
                name: nomeCliente,
                email: emailCliente,
                product_id: "waoriginal" 
            });

            console.log('Licença gerada com sucesso na Zaplink.');
        }
    } catch (error) {
        console.error('Erro ao processar webhook:', error.response?.data || error.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));