const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// 1. ROTA DE SUCESSO (O que o cliente vê na tela - AGORA COM DADOS EXIBIDOS)
app.get('/sucesso', async (req, res) => {
    const idPagamento = req.query.payment_id || req.query.id;
    if (!idPagamento) return res.send("<h1>Aguardando confirmação...</h1>");

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

            let titulo = "";
            let corpoHTML = "";

            if (valor >= 59.00) {
                // TELA PARA REVENDEDOR
                titulo = "Acesso de Revendedor Liberado! 🚀";
                corpoHTML = `
                    <div style="background: #f8f9fa; border: 2px solid #dee2e6; padding: 25px; border-radius: 15px; text-align: left; display: inline-block;">
                        <p style="font-size: 18px;"><b>Seus dados de acesso:</b></p>
                        <hr>
                        <p><b>Link do Painel:</b> <a href="https://control.zaplink.net/" target="_blank">control.zaplink.net</a></p>
                        <p><b>E-mail/Usuário:</b> ${email}</p>
                        <p><b>Senha Provisória:</b> <span style="color: #d63384; font-weight: bold; font-size: 20px;">${senhaRevenda}</span></p>
                    </div>
                    <p style="color: #666; margin-top: 15px;">Guarde esses dados. Você já pode fazer login agora!</p>
                `;
            } else {
                // TELA PARA CLIENTE DE LICENÇA
                titulo = "Licença Gerada com Sucesso! ✅";
                corpoHTML = `
                    <div style="background: #e8f5e9; border: 2px solid #2e7d32; padding: 25px; border-radius: 15px; display: inline-block;">
                        <p style="font-size: 18px;">Sua licença para o e-mail <b>${email}</b> já está ativa.</p>
                        <p><b>O que fazer agora?</b></p>
                        <ol style="text-align: left; display: inline-block;">
                            <li>Abra o seu software <b>WA Sender</b>.</li>
                            <li>No campo de ativação, use o e-mail: <b>${email}</b>.</li>
                            <li>A ativação será automática via servidor.</li>
                        </ol>
                    </div>
                    <p style="color: #666; margin-top: 15px;">Uma cópia das instruções foi enviada para seu e-mail.</p>
                `;
            }

            res.send(`
                <div style="font-family: sans-serif; text-align: center; padding: 40px; line-height: 1.6;">
                    <h1 style="color: #1b5e20; font-size: 32px;">${titulo}</h1>
                    ${corpoHTML}
                    <br><br>
                    <a href="https://www.wasenderbrasil.me/p/download.html?" style="text-decoration: none; background: #0d6efd; color: white; padding: 15px 30px; border-radius: 8px; font-weight: bold; font-size: 18px; display: inline-block;">BAIXAR O PROGRAMA AGORA</a>
                    <p style="margin-top: 20px;"><a href="https://www.wasenderbrasil.me" style="color: #0d6efd;">Voltar para o site principal</a></p>
                </div>
            `);
        } else {
            res.send("<h1>Seu pagamento está em análise...</h1><p>Assim que o Mercado Pago aprovar, os dados aparecerão aqui automaticamente.</p>");
        }
    } catch (e) { 
        res.send("<h1>Pagamento Identificado!</h1><p>Sua licença está sendo processada. Caso não veja os dados aqui, verifique seu e-mail em instantes.</p>"); 
    }
});

// 2. WEBHOOK (Processamento Automático no Banco de Dados)
app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    
    if (body.topic === 'merchant_order' || body.action?.includes('order')) return;

    let idPagamento = null;
    if (body.data?.id) idPagamento = body.data.id;
    else if (body.resource) {
        const matches = body.resource.toString().match(/\d+/g);
        if (matches) idPagamento = matches.join('');
    }

    if (!idPagamento) return;

    try {
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;
        if (p.order?.type === 'mercadolibre') return;

        if (p.status === 'approved') {
            const valor = p.transaction_amount;
            let emailOriginal = (p.payer?.email || p.additional_info?.payer?.email || "").trim();
            const email = (emailOriginal.includes('@')) ? emailOriginal : `cliente_${idPagamento}@mercadopago.com`;
            const nome = p.payer?.first_name || "Cliente";
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            if (valor >= 239.00) await criarAdmin(email, nome, senha, 999999);
            else if (valor >= 139.00) await criarAdmin(email, nome, senha, 50);
            else if (valor >= 59.00) await criarAdmin(email, nome, senha, 10);
            else if (valor >= 49.00) await gerarLicenca(email, nome, "VITALICIA");
            else if (valor >= 0.01) await gerarLicenca(email, nome, "ANUAL");
        }
    } catch (error) { console.error('Erro Webhook:', error.message); }
});

// 3. FUNÇÕES ZAPLINK
async function criarAdmin(email, nome, senha, cota) {
    try {
        const res = await axios.post('https://control.zaplink.net/api/create_admin', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            admin_email: email, admin_name: nome, admin_password: senha,
            admin_role: "admin", license_quota: cota, allowed_products: "waoriginal"
        });
        console.log("ZAPLINK ADMIN:", JSON.stringify(res.data));
    } catch (e) { console.error("ERRO ADMIN:", e.response?.data || e.message); }
}

async function gerarLicenca(email, nome, tipo) {
    try {
        const res = await axios.post('https://control.zaplink.net/api/generate_license', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            name: `${nome} (${tipo})`, email: email, product_id: "waoriginal"
        });
        console.log("ZAPLINK LICENÇA:", JSON.stringify(res.data));
    } catch (e) { console.error("ERRO LICENÇA:", e.response?.data || e.message); }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando!`));