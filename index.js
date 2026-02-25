const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// 1. ROTA DE SUCESSO (O que o cliente vê na tela)
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
            const email = (p.payer?.email || "seu e-mail").trim();
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            let titulo = valor >= 59.00 ? "Painel de Revendedor Liberado! 🚀" : "Pagamento Confirmado! ✅";
            let entregaHTML = valor >= 59.00 ? 
                `<p><b>Login:</b> ${email}<br><b>Senha:</b> ${senha}<br><b>Painel:</b> <a href="https://control.zaplink.net/">Acessar Agora</a></p>` :
                `<p>Sua licença foi gerada! Verifique seu e-mail: <b>${email}</b></p>
                 <p style="color: red;"><b>Atenção:</b> Se não encontrar o e-mail, verifique a pasta de SPAM.</p>`;

            res.send(`<div style="font-family:sans-serif;text-align:center;padding:50px;">
                <h1>${titulo}</h1>${entregaHTML}
                <br><br><a href="https://www.wasenderbrasil.me/p/download.html?" style="background:#0d6efd;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Ir para Download</a>
            </div>`);
        } else {
            res.send("<h1>Pagamento em processamento...</h1>");
        }
    } catch (e) { res.send("<h1>Sucesso!</h1><p>Sua licença está sendo processada.</p>"); }
});

// 2. WEBHOOK (Processamento Automático)
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

            console.log(`Pagamento Aprovado: R$ ${valor}. Enviando para Zaplink...`);

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
        console.log("RESPOSTA ZAPLINK (Admin):", JSON.stringify(res.data));
    } catch (e) { console.error("ERRO ZAPLINK (Admin):", e.response?.data || e.message); }
}

async function gerarLicenca(email, nome, tipo) {
    try {
        // Se a Zaplink exigir o email em Base64 em algum momento, o ajuste seria aqui.
        // Por enquanto, enviamos o email normal conforme o padrão da API de geração.
        const res = await axios.post('https://control.zaplink.net/api/generate_license', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            name: `${nome} (${tipo})`, 
            email: email, 
            product_id: "waoriginal"
        });
        
        console.log(`RESPOSTA ZAPLINK (Licença para ${email}):`, JSON.stringify(res.data));
        
        if (res.data.status === true && res.data.license_key) {
            console.log(`CHAVE GERADA: ${res.data.license_key}`);
        }
    } catch (e) { 
        console.error("ERRO ZAPLINK (Licença):", e.response?.data || e.message); 
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando e pronto!`));