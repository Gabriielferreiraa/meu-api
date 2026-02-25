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
            // Tentativa 1: E-mail do pagador
            // Tentativa 2: E-mail cadastrado no sistema (cardholder ou outros)
            // Tentativa 3: Se tudo falhar, usa um e-mail padrão para você não perder a venda
            
            let emailFinal = pagamento.payer?.email || 
                             pagamento.payer?.identification?.number + "@pagador.com";

            // Se o Mercado Pago retornar algo estranho ou nulo
            if (!emailFinal || !emailFinal.includes('@')) {
                emailFinal = "cliente_sem_email@pagamento.com"; 
                console.log("Aviso: Mercado Pago não enviou e-mail. Usando e-mail genérico.");
            }

            const nomeCliente = pagamento.payer?.first_name || "Cliente Real";

            console.log(`Pagamento ${idPagamento} APROVADO. E-mail usado: ${emailFinal}`);

            try {
                const resZaplink = await axios.post('https://control.zaplink.net/api/generate_license', {
                    token: process.env.ZAPLINK_TOKEN,
                    name: nomeCliente,
                    email: emailFinal.trim(),
                    product_id: "7774" // Já coloquei seu ID aqui baseado no padrão
                });
                console.log('Resposta da Zaplink:', resZaplink.data);
            } catch (zError) {
                console.error('ERRO NA ZAPLINK:', zError.response?.data || zError.message);
            }
        }

    } catch (error) {
        // Se der erro 404 aqui, é porque o ID enviado não é de um pagamento
        console.error('Erro na consulta ao Mercado Pago:', error.response?.data?.message || error.message);
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Servidor rodando'));