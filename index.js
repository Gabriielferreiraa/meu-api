const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Rota principal para evitar o erro "Cannot GET /"
app.get('/', (req, res) => {
    res.send('Servidor de Integração Mercado Pago -> Zaplink está ATIVO!');
});

app.post('/webhook', async (req, res) => {
    // 1. Responde imediatamente ao Mercado Pago para evitar reenvios desnecessários
    res.sendStatus(200);

    const { body } = req;
    console.log("Nova notificação recebida:", JSON.stringify(body));

    // 2. Tenta encontrar o ID do pagamento em diferentes formatos
    let idPagamento = null;
    if (body.data && body.data.id) {
        idPagamento = body.data.id;
    } else if (body.resource) {
        // Alguns webhooks enviam o link do recurso, extraímos o número final
        idPagamento = body.resource.split('/').pop();
    } else if (body.id && body.type === 'payment') {
        idPagamento = body.id;
    }

    // 3. Filtra notificações inúteis (testes ou apenas abertura de link)
    if (!idPagamento || idPagamento === '123456789' || body.action === 'opened') {
        console.log("Notificação ignorada: Teste, ID inválido ou apenas abertura de link.");
        return;
    }

    try {
        console.log(`Consultando detalhes do pagamento: ${idPagamento}`);

        // 4. Busca os dados reais do pagamento no Mercado Pago
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 
                'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}`
            }
        });

        const pagamento = mpResponse.data;

        // 5. Verifica se o pagamento está aprovado
        if (pagamento.status === 'approved') {
            console.log(`Pagamento ${idPagamento} aprovado! Processando licença...`);

            // 6. Tenta extrair o e-mail do cliente (com várias alternativas)
            let emailCliente = pagamento.payer?.email || 
                               pagamento.external_reference || 
                               (pagamento.metadata && pagamento.metadata.email);

            // Se ainda assim não tiver e-mail, cria um baseado no ID para não travar
            if (!emailCliente || !emailCliente.includes('@')) {
                emailCliente = `cliente_${idPagamento}@mercadopago.com`;
                console.log("Aviso: E-mail não encontrado, usando e-mail gerado.");
            }

            const nomeCliente = pagamento.payer?.first_name || "Cliente";

            // 7. Envia para a Zaplink
            try {
                const resZaplink = await axios.post('https://control.zaplink.net/api/generate_license', {
                    token: process.env.ZAPLINK_TOKEN,
                    name: nomeCliente,
                    email: emailCliente.trim(),
                    product_id: "waoriginal" // <--- CERTIFIQUE-SE QUE ESTE É O SEU ID NA ZAPLINK
                });

                console.log('Resposta da Zaplink:', resZaplink.data);
                
                if (resZaplink.data.status === true || resZaplink.data.status === 'success') {
                    console.log(`Sucesso! Licença enviada para ${emailCliente}`);
                }
            } catch (zError) {
                console.error('Erro ao chamar Zaplink:', zError.response?.data || zError.message);
            }

        } else {
            console.log(`Pagamento ${idPagamento} ainda não está aprovado. Status atual: ${pagamento.status}`);
        }

    } catch (error) {
        console.error('Erro ao consultar Mercado Pago:', error.response?.data?.message || error.message);
    }
});

// Configuração da porta para o Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});