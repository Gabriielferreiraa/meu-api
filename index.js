const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Objeto para guardar os dados na memória do servidor
const entregasTemporarias = {};

// 1. ROTA DE SUCESSO
app.get('/sucesso', async (req, res) => {
    const idPagamento = req.query.payment_id || req.query.id;
    console.log(`[LOG] Cliente acessou /sucesso com ID: ${idPagamento}`);

    if (!idPagamento) return res.send("<h1>Aguardando ID de pagamento...</h1>");

    try {
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;
        const email = (p.payer?.email || "").trim();
        const valor = p.transaction_amount;
        const senha = `Zap@${idPagamento.toString().slice(-4)}`;

        // Tenta buscar os dados salvos pelo Webhook
        let dados = entregasTemporarias[email];

        // Se não achou de primeira, espera 3 segundos e tenta de novo (caso o webhook atrase)
        if (!dados) {
            console.log(`[LOG] Dados ainda não no cache para ${email}. Aguardando...`);
            await new Promise(r => setTimeout(r, 3000));
            dados = entregasTemporarias[email];
        }

        if (p.status === 'approved') {
            // SE FOR ADMIN (VALOR >= 59)
            if (valor >= 59.00) {
                const cotaExibir = dados?.cota || "Processando cota...";
                return res.send(`
                    <div style="font-family:sans-serif;text-align:center;padding:50px;">
                        <h1 style="color:#198754;">Painel de Revendedor Liberado! 🚀</h1>
                        <div style="background:#f8f9fa;padding:30px;border-radius:15px;display:inline-block;border:2px solid #2563eb;text-align:left;">
                            <p><b>📧 Usuário:</b> ${email}</p>
                            <p><b>🔑 Senha:</b> ${senha}</p>
                            <p><b>📊 Cota:</b> <span style="color:#2563eb;font-weight:bold;">${cotaExibir} unidades</span></p>
                            <hr>
                            <p style="text-align:center;"><a href="https://control.zaplink.net/" style="background:#2563eb;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:bold;">ACESSAR PAINEL</a></p>
                        </div>
                        <p><button onclick="location.reload()">Atualizar Informações</button></p>
                    </div>
                `);
            }

            // SE FOR LICENÇA (VALOR < 59)
            const chaveExibir = dados?.chave || "Gerando chave... por favor, aguarde 5 segundos e atualize.";
            return res.send(`
                <div style="font-family:sans-serif;text-align:center;padding:50px;">
                    <h1 style="color:#198754;">Pagamento Confirmado! ✅</h1>
                    <p>Sua chave de ativação:</p>
                    <div style="background:#222;color:#0f0;padding:20px;border-radius:10px;display:inline-block;font-family:monospace;font-size:24px;margin:10px 0;">
                        <b>${chaveExibir}</b>
                    </div>
                    <p>E-mail: <b>${email}</b></p>
                    <p><button onclick="location.reload()">Clique aqui para ver a chave</button></p>
                </div>
            `);
        } else {
            res.send("<h1>Pagamento ainda em processamento...</h1><button onclick='location.reload()'>Checar novamente</button>");
        }
    } catch (e) {
        console.error("[ERRO SUCESSO]", e.message);
        res.send("<h1>Processando...</h1><p>Sua licença está sendo gerada. Atualize em instantes.</p>");
    }
});

// 2. WEBHOOK
app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    
    // Pega o ID do pagamento de qualquer lugar da notificação
    const idPagamento = body.data?.id || (body.resource ? body.resource.split('/').pop() : null);
    
    if (!idPagamento || isNaN(idPagamento)) return;

    console.log(`[WEBHOOK] Recebido ID: ${idPagamento}`);

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

            console.log(`[WEBHOOK] Pagamento Aprovado! Valor: ${valor} - Email: ${email}`);

            if (valor >= 239.00) {
                await criarAdmin(email, nome, senha, 999999);
                entregasTemporarias[email] = { cota: "Ilimitada" };
            } else if (valor >= 139.00) {
                await criarAdmin(email, nome, senha, 50);
                entregasTemporarias[email] = { cota: "50" };
            } else if (valor >= 59.00) {
                await criarAdmin(email, nome, senha, 10);
                entregasTemporarias[email] = { cota: "10" };
            } else {
                const chave = await gerarLicenca(email, nome, valor >= 49.00 ? "VITALICIA" : "ANUAL");
                entregasTemporarias[email] = { chave: chave };
            }
            console.log(`[WEBHOOK] Dados salvos na memória para ${email}`);
        }
    } catch (e) { console.error("[ERRO WEBHOOK]", e.message); }
});

// FUNÇÕES ZAPLINK
async function criarAdmin(email, nome, senha, cota) {
    try {
        const r = await axios.post('https://control.zaplink.net/api/create_admin', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            admin_email: email, admin_name: nome, admin_password: senha,
            admin_role: "admin", license_quota: cota, allowed_products: "waoriginal"
        });
        console.log(`[ZAPLINK] Admin criado: ${email}`);
    } catch (e) { console.error("[ERRO ZAPLINK ADMIN]", e.response?.data || e.message); }
}

async function gerarLicenca(email, nome, tipo) {
    try {
        const r = await axios.post('https://control.zaplink.net/api/generate_license', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            name: `${nome} (${tipo})`, email: email, product_id: "waoriginal"
        });
        console.log(`[ZAPLINK] Licença gerada para: ${email}`);
        return r.data.license_code || r.data.license_key;
    } catch (e) { 
        console.error("[ERRO ZAPLINK LICENÇA]", e.response?.data || e.message);
        return "Erro ao gerar chave automaticamente";
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));