const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// 1. ROTA DE SUCESSO (Busca e exibe a KEY)
app.get('/sucesso', async (req, res) => {
    const idPagamento = req.query.payment_id || req.query.id;
    if (!idPagamento) return res.send("<h1>Aguardando confirmação...</h1>");

    try {
        console.log(`[SUCESSO] Cliente chegou na tela. ID: ${idPagamento}`);
        
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;
        if (p.status === 'approved') {
            const email = (p.payer?.email || "").trim();
            const valor = p.transaction_amount;

            if (valor >= 59.00) {
                const senha = `Zap@${idPagamento.toString().slice(-4)}`;
                return res.send(`<div style="font-family:sans-serif;text-align:center;padding:50px;">
                    <h1>Painel de Revendedor!</h1>
                    <p>Login: ${email}<br>Senha: ${senha}</p>
                    <a href="https://control.zaplink.net/">Acessar Painel</a></div>`);
            }

            console.log(`[SUCESSO] Buscando licença para o e-mail: ${email}`);
            
            // Espera 3 segundos para o webhook terminar de processar
            await new Promise(resolve => setTimeout(resolve, 3000));

            // TENTATIVA DE BUSCAR A LICENÇA
            const zapResponse = await axios.post('https://control.zaplink.net/api/get_license', {
                token: process.env.ZAPLINK_TOKEN.trim(),
                email: email
            }).catch(e => {
                console.log("Erro ao chamar get_license:", e.response?.data || e.message);
                return { data: {} };
            });

            console.log("Resposta da Zaplink na Busca:", JSON.stringify(zapResponse.data));

            // Algumas APIs retornam 'license' ou 'license_key' ou dentro de um array
            const licenseKey = zapResponse.data?.license_key || zapResponse.data?.license || "Aguardando ativação...";

            if (licenseKey === "Aguardando ativação...") {
                return res.send(`
                    <div style="font-family:sans-serif;text-align:center;padding:50px;">
                        <h1>Sua chave está sendo gerada...</h1>
                        <p>Isso leva alguns segundos. Por favor, <b>atualize a página (F5)</b> em instantes.</p>
                        <button onclick="location.reload()" style="padding:10px 20px; cursor:pointer;">ATUALIZAR PÁGINA</button>
                    </div>
                `);
            }

            res.send(`
                <div style="font-family:sans-serif;text-align:center;padding:50px;">
                    <h1 style="color:#198754;">Pagamento Aprovado! ✅</h1>
                    <p>Sua chave de ativação:</p>
                    <div style="background:#222;color:#0f0;padding:20px;border-radius:10px;display:inline-block;font-family:monospace;font-size:22px;border:2px solid #000;">
                        <b>${licenseKey}</b>
                    </div>
                    <p>E-mail: ${email}</p>
                    <br><a href="https://www.wasenderbrasil.me/p/download.html?" style="background:#0d6efd;color:white;padding:12px 25px;text-decoration:none;border-radius:5px;font-weight:bold;">BAIXAR AGORA</a>
                </div>
            `);
        } else {
            res.send("<h1>Pagamento em análise...</h1>");
        }
    } catch (e) {
        console.error("Erro na rota sucesso:", e.message);
        res.send("<h1>Sucesso!</h1><p>Sua licença foi processada. Verifique seu e-mail.</p>");
    }
});

// 2. WEBHOOK (Criação) - MANTIDO IGUAL
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
        if (p.order?.type === 'mercadolibre' || p.status !== 'approved') return;

        const valor = p.transaction_amount;
        let emailOriginal = (p.payer?.email || p.additional_info?.payer?.email || "").trim();
        const email = (emailOriginal.includes('@')) ? emailOriginal : `cliente_${idPagamento}@mercadopago.com`;
        const nome = p.payer?.first_name || "Cliente";
        const senha = `Zap@${idPagamento.toString().slice(-4)}`;

        console.log(`[WEBHOOK] Criando licença para ${email}`);

        if (valor >= 239.00) await criarAdmin(email, nome, senha, 999999);
        else if (valor >= 139.00) await criarAdmin(email, nome, senha, 50);
        else if (valor >= 59.00) await criarAdmin(email, nome, senha, 10);
        else if (valor >= 49.00) await gerarLicenca(email, nome, "VITALICIA");
        else if (valor >= 0.01) await gerarLicenca(email, nome, "ANUAL");
        
    } catch (error) { console.error('Erro Webhook:', error.message); }
});

// FUNÇÕES ZAPLINK
async function criarAdmin(email, nome, senha, cota) {
    try {
        const res = await axios.post('https://control.zaplink.net/api/create_admin', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            admin_email: email, admin_name: nome, admin_password: senha,
            admin_role: "admin", license_quota: cota, allowed_products: "waoriginal"
        });
        console.log("ZAPLINK ADMIN:", res.data.message || "Criado");
    } catch (e) { console.error("Erro Admin"); }
}

async function gerarLicenca(email, nome, tipo) {
    try {
        const res = await axios.post('https://control.zaplink.net/api/generate_license', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            name: `${nome} (${tipo})`, email: email, product_id: "waoriginal"
        });
        console.log("ZAPLINK LICENÇA:", res.data.message || "Criado");
    } catch (e) { console.error("Erro Licença"); }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sistema Online!`));