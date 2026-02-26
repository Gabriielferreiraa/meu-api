const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const entregasTemporarias = {};

// 1. ROTA DE SUCESSO
app.get('/sucesso', async (req, res) => {
    const idPagamento = req.query.payment_id || req.query.id;
    if (!idPagamento) return res.send("<h1>Aguardando confirmação...</h1>");

    try {
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;
        if (p.status === 'approved') {
            const email = (p.payer?.email || "").trim();
            const valor = p.transaction_amount;
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            let dados = entregasTemporarias[email];
            if (!dados) {
                await new Promise(r => setTimeout(r, 3500));
                dados = entregasTemporarias[email];
            }

            // --- LÓGICA DE EXIBIÇÃO NA TELA ---
            
            // SE PAGOU R$ 1.00 (SIMULANDO REVENDA/ADMIN)
            if (valor >= 1.00) { 
                const cotaExibir = dados?.cota || "10";
                return res.send(`
                    <div style="font-family:sans-serif;text-align:center;padding:50px;">
                        <h1 style="color:#198754;">Painel de Revendedor Liberado! 🚀</h1>
                        <div style="background:#f8f9fa;padding:30px;border-radius:15px;display:inline-block;border:2px solid #2563eb;text-align:left;">
                            <p><b>📧 Usuário:</b> ${email}</p>
                            <p><b>🔑 Senha:</b> ${senha}</p>
                            <p><b>📊 Cota:</b> <span style="color:#2563eb;font-weight:bold;">${cotaExibir} Licenças</span></p>
                            <hr>
                            <p style="text-align:center;"><a href="https://control.zaplink.net/" style="background:#2563eb;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:bold;">ACESSAR PAINEL</a></p>
                        </div>
                    </div>
                `);
            } 

            // SE PAGOU R$ 0.50 (SIMULANDO LICENÇA ANUAL)
            const chaveExibir = dados?.chave || "Gerando chave... atualize a página.";
            return res.send(`
                <div style="font-family:sans-serif;text-align:center;padding:50px;">
                    <h1 style="color:#198754;">Pagamento Confirmado! ✅</h1>
                    <p>Sua chave de ativação:</p>
                    <div style="background:#222;color:#0f0;padding:20px;border-radius:10px;display:inline-block;font-family:monospace;font-size:24px;margin:10px 0;">
                        <b>${chaveExibir}</b>
                    </div>
                    <p>E-mail: <b>${email}</b></p>
                    <button onclick="location.reload()" style="padding:10px;cursor:pointer;">Ver Chave</button>
                </div>
            `);

        } else {
            res.send("<h1>Pagamento em processamento...</h1>");
        }
    } catch (e) { res.send("<h1>Processando...</h1>"); }
});

// 2. WEBHOOK
app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    const idPagamento = body.data?.id || (body.resource ? body.resource.split('/').pop() : null);
    if (!idPagamento || isNaN(idPagamento)) return;

    try {
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;
        if (p.status === 'approved') {
            const valor = p.transaction_amount;
            const email = (p.payer?.email || "").trim();
            const nome = p.payer?.first_name || "Cliente";
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            // --- REGRAS DE CRIAÇÃO PARA TESTE ---
            
            if (valor >= 1.00) { 
                // Qualquer valor de 1.00 ou mais cria ADMIN
                await criarAdmin(email, nome, senha, 10);
                entregasTemporarias[email] = { cota: "10" };
            } else if (valor >= 0.50) {
                // Valor de 0.50 cria LICENÇA
                const chave = await gerarLicenca(email, nome, "ANUAL (TESTE)");
                entregasTemporarias[email] = { chave: chave };
            }
        }
    } catch (error) { console.error('Erro Webhook'); }
});

async function criarAdmin(email, nome, senha, cota) {
    try {
        await axios.post('https://control.zaplink.net/api/create_admin', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            admin_email: email, admin_name: nome, admin_password: senha,
            admin_role: "admin", license_quota: cota, allowed_products: "waoriginal"
        });
    } catch (e) { console.log("Erro Admin"); }
}

async function gerarLicenca(email, nome, tipo) {
    try {
        const res = await axios.post('https://control.zaplink.net/api/generate_license', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            name: `${nome} (${tipo})`, email: email, product_id: "waoriginal"
        });
        return res.data.license_code || res.data.license_key;
    } catch (e) { return "Erro na geração"; }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Testes de R$ 0,50 e R$ 1,00 ativos!`));