const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// 1. PÁGINA DE SUCESSO (O que o cliente vê na tela após pagar)
app.get('/sucesso', async (req, res) => {
    const idPagamento = req.query.payment_id || req.query.id;

    if (!idPagamento) {
        return res.send("<h1>Aguardando confirmação...</h1><p>Se o pagamento foi aprovado, sua licença chegará por e-mail.</p>");
    }

    try {
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;

        if (p.status === 'approved') {
            const valor = p.transaction_amount;
            const email = (p.payer?.email || "E-mail não identificado").trim();
            const nome = p.payer?.first_name || "Cliente";
            const senhaRevenda = `Zap@${idPagamento.toString().slice(-4)}`;

            let titulo = valor >= 59.00 ? "Painel de Revendedor Liberado! 🚀" : "Pagamento Confirmado! ✅";
            let entregaHTML = valor >= 59.00 ? `
                <div style="background: #f8f9fa; border: 1px solid #dee2e6; padding: 20px; border-radius: 10px; text-align: left; display: inline-block;">
                    <p><b>Nome:</b> ${nome}</p>
                    <p><b>E-mail de Acesso:</b> ${email}</p>
                    <p><b>Senha Provisória:</b> <span style="color: #d63384; font-weight: bold;">${senhaRevenda}</span></p>
                    <p><b>Link do Painel:</b> <a href="https://control.zaplink.net/" target="_blank">control.zaplink.net</a></p>
                </div>` : `
                <div style="background: #f8f9fa; border: 1px solid #dee2e6; padding: 20px; border-radius: 10px; display: inline-block;">
                    <p><b>Nome:</b> ${nome}</p>
                    <p><b>E-mail:</b> ${email}</p>
                    <p style="font-size: 1.2em; color: #198754;"><b>Sua licença foi enviada para o seu e-mail!</b></p>
                </div>`;

            res.send(`
                <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h1 style="color: #198754;">${titulo}</h1>
                    ${entregaHTML}
                    <br><br>
                    <a href="https://www.wasenderbrasil.me/p/download.html?" style="text-decoration: none; background: #0d6efd; color: white; padding: 10px 20px; border-radius: 5px; font-weight: bold;">Voltar para o site / Download</a>
                </div>
            `);
        } else {
            res.send("<h1>Pagamento em processamento...</h1><p>Atualize a página em instantes.</p>");
        }
    } catch (error) {
        res.send("<h1>Sucesso!</h1><p>Verifique seu e-mail para receber os dados de acesso.</p>");
    }
});

// 2. WEBHOOK (Processamento Automático com Filtro anti-Mercado Livre)
app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    console.log("-----------------------------------------");
    console.log("NOTIFICAÇÃO RECEBIDA:", JSON.stringify(body));

    // TRAVA 1: Ignora notificações de ordens do Mercado Livre
    if (body.topic === 'merchant_order' || body.action?.includes('order')) {
        console.log("Ignorado: Notificação de Mercado Livre (Merchant Order).");
        return;
    }

    let idPagamento = null;
    if (body.data && body.data.id) idPagamento = body.data.id;
    else if (body.resource) {
        const matches = body.resource.toString().match(/\d+/g);
        if (matches) idPagamento = matches.join('');
    } else if (body.id) idPagamento = body.id;

    if (!idPagamento || idPagamento === '123456789') return;

    try {
        console.log(`Buscando detalhes do pagamento: ${idPagamento}`);
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;

        // TRAVA 2: Filtro definitivo para ignorar vendas do Mercado Livre
        if (p.order && p.order.type === 'mercadolibre') {
            console.log("BLOQUEADO: Esta venda veio do Mercado Livre. Nenhuma licença gerada.");
            return;
        }

        if (p.status === 'approved') {
            const valor = p.transaction_amount;
            const email = (p.payer?.email || p.additional_info?.payer?.email || `cliente_${idPagamento}@mercadopago.com`).trim();
            const nome = p.payer?.first_name || "Cliente";
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            console.log(`Pagamento Aprovado: R$ ${valor} de ${email}`);

            // Lógica de Preços
            if (valor >= 239.00) await criarAdmin(email, nome, senha, 999999);
            else if (valor >= 139.00) await criarAdmin(email, nome, senha, 50);
            else if (valor >= 59.00) await criarAdmin(email, nome, senha, 10);
            else if (valor >= 49.00) await gerarLicenca(email, nome, "VITALICIA");
            else if (valor >= 29.00) await gerarLicenca(email, nome, "ANUAL");
            else if (valor >= 1.00) await gerarLicenca(email, nome, "TESTE"); // Para seus testes de R$ 1,00

            console.log(`✅ Processo concluído para ${email}`);
        }
    } catch (error) {
        console.error('ERRO NO PROCESSAMENTO:', error.message);
    }
});

// FUNÇÕES ZAPLINK
async function criarAdmin(email, nome, senha, cota) {
    try {
        await axios.post('https://control.zaplink.net/api/create_admin', {
            token: process.env.ZAPLINK_TOKEN,
            admin_email: email, admin_name: nome, admin_password: senha,
            admin_role: "admin", license_quota: cota, allowed_products: "waoriginal"
        });
        console.log(`Admin Criado: ${email}`);
    } catch (e) { console.error("Erro Zaplink Admin:", e.message); }
}

async function gerarLicenca(email, nome, tipo) {
    try {
        await axios.post('https://control.zaplink.net/api/generate_license', {
            token: process.env.ZAPLINK_TOKEN,
            name: `${nome} (${tipo})`, email: email, product_id: "waoriginal"
        });
        console.log(`Licença Gerada: ${email} (${tipo})`);
    } catch (e) { console.error("Erro Zaplink Licença:", e.message); }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Ativo na porta ${PORT}`));