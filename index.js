const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Rota para verificar se o servidor está online
app.get('/', (req, res) => {
    res.send('Servidor de Integração Mercado Pago -> Zaplink ATIVO e MONITORANDO!');
});

app.post('/webhook', async (req, res) => {
    // Responde 200 imediatamente para o Mercado Pago
    res.sendStatus(200);

    const { body } = req;
    
    // Captura o ID do pagamento
    let idPagamento = null;
    if (body.data && body.data.id) {
        idPagamento = body.data.id;
    } else if (body.id && (body.type === 'payment' || body.action?.includes('payment'))) {
        idPagamento = body.id;
    }

    // Ignora se for teste ou abertura de link
    if (!idPagamento || idPagamento === '123456789' || body.action === 'opened') {
        console.log("Notificação de sistema ou teste ignorada.");
        return;
    }

    try {
        console.log(`--- Iniciando processamento do pagamento: ${idPagamento} ---`);

        // Consulta o Mercado Pago
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 
                'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}`
            }
        });

        const pagamento = mpResponse.data;

        if (pagamento.status === 'approved') {
            console.log(`Pagamento ${idPagamento} APROVADO.`);

            // --- LÓGICA DE CAPTURA DE E-MAIL (Múltiplas camadas) ---
            let emailCliente = "";

            // 1. Tenta o campo padrão do pagador
            if (pagamento.payer && pagamento.payer.email && !pagamento.payer.email.includes("replacement")) {
                emailCliente = pagamento.payer.email;
            } 
            // 2. Tenta informações adicionais (comum no Checkout Pro/Pix)
            else if (pagamento.additional_info && pagamento.additional_info.payer && pagamento.additional_info.payer.email) {
                emailCliente = pagamento.additional_info.payer.email;
            }
            // 3. Tenta nos metadados (onde alguns plugins escondem o e-mail)
            else if (pagamento.metadata && (pagamento.metadata.payer_email || pagamento.metadata.email)) {
                emailCliente = pagamento.metadata.payer_email || pagamento.metadata.email;
            }

            // --- SE MESMO ASSIM FALHAR, USA O RESERVA ---
            if (!emailCliente || !emailCliente.includes('@')) {
                emailCliente = `cliente_${idPagamento}@mercadopago.com`;
                console.log("Aviso: E-mail real não localizado. Usando e-mail de reserva para gerar licença.");
            }

            const nomeCliente = pagamento.payer?.first_name || 
                               pagamento.additional_info?.payer?.first_name || 
                               "Cliente Real";

            console.log(`E-mail identificado: ${emailCliente}`);

            // Envia para a Zaplink
            try {
                const resZaplink = await axios.post('https://control.zaplink.net/api/generate_license', {
                    token: process.env.ZAPLINK_TOKEN,
                    name: nomeCliente,
                    email: emailCliente.trim(),
                    product_id: "waoriginal" // <--- Verifique se este ID está correto na sua Zaplink
                });

                if (resZaplink.data.status === true || resZaplink.data.status === 'success') {
                    console.log(`✅ SUCESSO: Licença gerada para ${emailCliente}`);
                } else {
                    console.log(`⚠️ Zaplink retornou erro:`, resZaplink.data);
                }
            } catch (zError) {
                console.error('❌ Erro na Zaplink:', zError.response?.data || zError.message);
            }

        } else {
            console.log(`Pagamento ${idPagamento} ignorado. Status: ${pagamento.status}`);
        }

    } catch (error) {
        console.error('❌ Erro ao consultar Mercado Pago:', error.response?.data || error.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});