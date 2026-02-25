const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// 1. ROTA DE SUCESSO (O que o cliente vê na tela)
app.get('/sucesso', async (req, res) => {
    // O Mercado Pago envia o ID na URL como payment_id
    const idPagamento = req.query.payment_id || req.query.id;

    if (!idPagamento) {
        return res.send("<h1>Aguardando confirmação...</h1><p>Se o pagamento foi aprovado, sua licença chegará por e-mail.</p>");
    }

    try {
        // Busca os dados para mostrar na tela
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;

        if (p.status === 'approved') {
            const valor = p.transaction_amount;
            const email = (p.payer?.email || "E-mail não identificado").trim();
            const nome = p.payer?.first_name || "Cliente";
            const senhaRevenda = `Zap@${idPagamento.toString().slice(-4)}`;

            let titulo = "";
            let entregaHTML = "";

            // Lógica de exibição baseada no valor (Igual ao seu webhook)
            if (valor >= 59.00) {
                // EXIBIÇÃO PARA REVENDEDOR
                titulo = "Painel de Revendedor Liberado! 🚀";
                entregaHTML = `
                    <div style="background: #f8f9fa; border: 1px solid #dee2e6; padding: 20px; border-radius: 10px; text-align: left; display: inline-block;">
                        <p><b>Nome:</b> ${nome}</p>
                        <p><b>E-mail de Acesso:</b> ${email}</p>
                        <p><b>Senha Provisória:</b> <span style="color: #d63384; font-weight: bold;">${senhaRevenda}</span></p>
                        <p><b>Link do Painel:</b> <a href="https://control.zaplink.net/" target="_blank">control.zaplink.net</a></p>
                    </div>
                    <p style="margin-top: 15px; color: #666;">Use os dados acima para gerenciar suas licenças.</p>
                `;
            } else {
                // EXIBIÇÃO PARA LICENÇA COMUM
                titulo = "Pagamento Confirmado! ✅";
                entregaHTML = `
                    <div style="background: #f8f9fa; border: 1px solid #dee2e6; padding: 20px; border-radius: 10px; display: inline-block;">
                        <p><b>Nome:</b> ${nome}</p>
                        <p><b>E-mail:</b> ${email}</p>
                        <p style="font-size: 1.2em; color: #198754;"><b>Sua licença foi gerada e enviada para o seu e-mail!</b></p>
                    </div>
                    <p style="margin-top: 15px; color: #666;">Verifique sua caixa de entrada e a pasta de Spam.</p>
                `;
            }

            res.send(`
                <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h1 style="color: #198754;">${titulo}</h1>
                    ${entregaHTML}
                    <br><br>
                    <a href="https://www.wasenderbrasil.me/p/download.html?" style="text-decoration: none; background: #0d6efd; color: white; padding: 10px 20px; border-radius: 5px;">Voltar para o site</a>
                </div>
            `);
        } else {
            res.send("<h1>Pagamento em processamento...</h1><p>Assim que for aprovado, os dados aparecerão aqui. Tente atualizar a página.</p>");
        }
    } catch (error) {
        res.send("<h1>Sucesso!</h1><p>Seu pagamento foi identificado. Verifique seu e-mail para receber os dados de acesso.</p>");
    }
});

// 2. SEU WEBHOOK (Mantido exatamente como você pediu)
app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    console.log("-----------------------------------------");
    console.log("NOTIFICAÇÃO RECEBIDA:", JSON.stringify(body));

    let idPagamento = null;
    
    if (body.data && body.data.id) {
        idPagamento = body.data.id;
    } else if (body.resource) {
        const matches = body.resource.toString().match(/\d+/g);
        if (matches) idPagamento = matches.join('');
    } else if (body.id) {
        idPagamento = body.id;
    }

    if (!idPagamento || idPagamento === '123456789') {
        console.log("Ignorado: ID inválido ou teste.");
        return;
    }

    try {
        console.log(`Buscando detalhes do pagamento: ${idPagamento}`);
        
        if (!process.env.MP_ACCESS_TOKEN) {
            console.error("ERRO: MP_ACCESS_TOKEN não configurado no Render!");
            return;
        }

        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 
                'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}`,
                'Content-Type': 'application/json'
            }
        });

        const p = mpResponse.data;
        console.log(`Status retornado pelo MP: ${p.status}`);

        if (p.status === 'approved') {
            const valor = p.transaction_amount;
            const email = (p.payer?.email || p.additional_info?.payer?.email || `cliente_${idPagamento}@mercadopago.com`).trim();
            const nome = p.payer?.first_name || "Cliente";
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            console.log(`Processando entrega: R$ ${valor} para ${email}`);

            if (valor >= 239.00) await criarAdmin(email, nome, senha, 999999);
            else if (valor >= 139.00) await criarAdmin(email, nome, senha, 50);
            else if (valor >= 59.00) await criarAdmin(email, nome, senha, 10);
            else if (valor >= 49.00) await gerarLicenca(email, nome, "VITALICIA");
            else if (valor >= 1.00) await gerarLicenca(email, nome, "ANUAL");
            
            console.log(`✅ Sucesso total para ${email}`);
        }
    } catch (error) {
        console.error('ERRO NA CHAMADA MP:', error.response?.data || error.message);
    }
});

// Funções Auxiliares (Zaplink)
async function criarAdmin(email, nome, senha, cota) {
    try {
        await axios.post('https://control.zaplink.net/api/create_admin', {
            token: process.env.ZAPLINK_TOKEN,
            admin_email: email, admin_name: nome, admin_password: senha,
            admin_role: "admin", license_quota: cota, allowed_products: "7774"
        });
    } catch (e) { console.error("Erro Zaplink Admin:", e.message); }
}

async function gerarLicenca(email, nome, tipo) {
    try {
        await axios.post('https://control.zaplink.net/api/generate_license', {
            token: process.env.ZAPLINK_TOKEN,
            name: `${nome} (${tipo})`, email: email, product_id: "7774"
        });
    } catch (e) { console.error("Erro Zaplink Licença:", e.message); }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));