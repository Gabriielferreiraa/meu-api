const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Objeto para guardar os dados gerados (Chave ou Dados de Admin)
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
            const valor = p.transaction_amount;
            const email = (p.payer?.email || "").trim();
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            // Aguarda 2.5s para o webhook processar na Zaplink
            await new Promise(resolve => setTimeout(resolve, 2500));

            const dadosEntrega = entregasTemporarias[email];

            // --- TELA PARA REVENDEDOR (ADMIN) ---
            if (valor >= 59.00) {
                const cota = dadosEntrega?.cota || "Consultar no Painel";
                return res.send(`
                    <div style="font-family:sans-serif;text-align:center;padding:50px;line-height:1.6;">
                        <h1 style="color:#198754;">Painel de Revendedor Liberado! 🚀</h1>
                        <div style="background:#f8f9fa;padding:30px;border-radius:15px;display:inline-block;border:2px solid #2563eb;text-align:left;">
                            <p style="margin:5px 0;"><b>📧 Usuário:</b> ${email}</p>
                            <p style="margin:5px 0;"><b>🔑 Senha:</b> ${senha}</p>
                            <p style="margin:5px 0;"><b>📊 Cota de Licenças:</b> <span style="color:#2563eb;font-weight:bold;font-size:18px;">${cota} unidades</span></p>
                            <hr style="border:0;border-top:1px solid #ddd;margin:15px 0;">
                            <p style="text-align:center;"><a href="https://control.zaplink.net/" style="background:#2563eb;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:bold;display:inline-block;">ACESSAR PAINEL AGORA</a></p>
                        </div>
                        <br><br><a href="https://www.wasenderbrasil.me/p/download.html?" style="color:#666;">Ir para Download do Software</a>
                    </div>
                `);
            }

            // --- TELA PARA LICENÇA (SERIAL) ---
            const chave = dadosEntrega?.chave || "Gerando chave... atualize a página (F5)";
            res.send(`
                <div style="font-family:sans-serif;text-align:center;padding:50px;line-height:1.6;">
                    <h1 style="color:#198754;">Pagamento Confirmado! ✅</h1>
                    <p style="font-size:18px;">Sua chave de ativação:</p>
                    <div style="background:#222;color:#0f0;padding:20px;border-radius:10px;display:inline-block;font-family:monospace;font-size:24px;border:2px solid #000;margin:10px 0;">
                        <b>${chave}</b>
                    </div>
                    <p>Guarde este código, ele não irá aparecer novamente!</b></p>
                    <br><a href="https://www.wasenderbrasil.me/p/download.html?" style="background:#0d6efd;color:white;padding:12px 25px;text-decoration:none;border-radius:5px;font-weight:bold;">BAIXAR INSTALADOR</a>
                    <p style="margin-top:20px;"><button onclick="location.reload()" style="cursor:pointer;padding:8px 15px;">Atualizar Página</button></p>
                </div>
            `);
        } else {
            res.send("<h1>Pagamento em processamento...</h1>");
        }
    } catch (e) { res.send("<h1>Sucesso!</h1><p>Sua licença foi processada. Verifique seu e-mail.</p>"); }
});

// 2. WEBHOOK
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
        if (p.status !== 'approved') return;

        const valor = p.transaction_amount;
        let emailOriginal = (p.payer?.email || "").trim();
        const email = (emailOriginal.includes('@')) ? emailOriginal : `cliente_${idPagamento}@mercadopago.com`;
        const nome = p.payer?.first_name || "Cliente";
        const senha = `Zap@${idPagamento.toString().slice(-4)}`;

        // LÓGICA DE VALORES E REGISTRO NA MEMÓRIA
        if (valor >= 239.00) {
            await criarAdmin(email, nome, senha, 999999);
            entregasTemporarias[email] = { cota: "Ilimitada" };
        } else if (valor >= 139.00) {
            await criarAdmin(email, nome, senha, 50);
            entregasTemporarias[email] = { cota: "50" };
        } else if (valor >= 2.00) {
            await criarAdmin(email, nome, senha, 10);
            entregasTemporarias[email] = { cota: "10" };
        } else if (valor >= 49.00) {
            const chave = await gerarLicenca(email, nome, "VITALICIA");
            entregasTemporarias[email] = { chave: chave };
        } else if (valor >= 0.01) {
            const chave = await gerarLicenca(email, nome, "ANUAL");
            entregasTemporarias[email] = { chave: chave };
        }
        
    } catch (error) { console.error('Erro Webhook:', error.message); }
});

// FUNÇÕES ZAPLINK
async function criarAdmin(email, nome, senha, cota) {
    try {
        await axios.post('https://control.zaplink.net/api/create_admin', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            admin_email: email, admin_name: nome, admin_password: senha,
            admin_role: "admin", license_quota: cota, allowed_products: "waoriginal"
        });
    } catch (e) { console.error("Erro ao criar Admin"); }
}

async function gerarLicenca(email, nome, tipo) {
    try {
        const res = await axios.post('https://control.zaplink.net/api/generate_license', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            name: `${nome} (${tipo})`, email: email, product_id: "waoriginal"
        });
        return res.data.license_code || res.data.license_key;
    } catch (e) { 
        console.error("Erro ao gerar Licença");
        return null;
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sistema Profissional Ativado!`));