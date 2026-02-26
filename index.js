const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Objeto para guardar os dados na memória temporária do servidor
const entregasTemporarias = {};

// 1. ROTA DE SUCESSO (O que o cliente vê)
app.get('/sucesso', async (req, res) => {
    const idPagamento = req.query.payment_id || req.query.id;
    console.log(`[LOG] Cliente na tela de sucesso. ID: ${idPagamento}`);

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

            // Espera um pouco para garantir que o Webhook já salvou os dados
            let dados = entregasTemporarias[email];
            if (!dados) {
                await new Promise(r => setTimeout(r, 3000));
                dados = entregasTemporarias[email];
            }

            // --- TELA DE ADMIN / REVENDEDOR (VALOR DE TESTE: 0.01) ---
            if (valor >= 0.01) { 
                const cotaExibir = dados?.cota || "10";
                return res.send(`
                    <div style="font-family:sans-serif;text-align:center;padding:50px;line-height:1.6;">
                        <h1 style="color:#198754;">Painel de Revendedor Liberado! 🚀</h1>
                        <div style="background:#f8f9fa;padding:30px;border-radius:15px;display:inline-block;border:2px solid #2563eb;text-align:left;box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                            <p style="margin:8px 0;"><b>📧 Usuário:</b> ${email}</p>
                            <p style="margin:8px 0;"><b>🔑 Senha:</b> ${senha}</p>
                            <p style="margin:8px 0;"><b>📊 Cota Inicial:</b> <span style="color:#2563eb;font-weight:bold;font-size:18px;">${cotaExibir} Licenças</span></p>
                            <hr style="border:0;border-top:1px solid #eee;margin:15px 0;">
                            <p style="text-align:center;"><a href="https://control.zaplink.net/" style="background:#2563eb;color:white;padding:12px 25px;text-decoration:none;border-radius:5px;font-weight:bold;display:inline-block;">ACESSAR MEU PAINEL</a></p>
                        </div>
                        <p style="margin-top:20px;color:#666;">Se os dados não aparecerem, atualize a página.</p>
                        <button onclick="location.reload()" style="cursor:pointer;padding:8px 15px;border-radius:5px;border:1px solid #ccc;background:#fff;">Atualizar Dados</button>
                    </div>
                `);
            }

            // --- TELA DE LICENÇA COMUM (CHAVE SERIAL) ---
            const chaveExibir = dados?.chave || "Gerando sua chave... por favor, atualize em 5 segundos.";
            return res.send(`
                <div style="font-family:sans-serif;text-align:center;padding:50px;line-height:1.6;">
                    <h1 style="color:#198754;">Pagamento Confirmado! ✅</h1>
                    <p style="font-size:18px;">Sua chave de ativação:</p>
                    <div style="background:#222;color:#0f0;padding:20px;border-radius:10px;display:inline-block;font-family:monospace;font-size:26px;border:2px solid #000;margin:10px 0;letter-spacing:2px;">
                        <b>${chaveExibir}</b>
                    </div>
                    <p>Ative no software com o e-mail: <b>${email}</b></p>
                    <br><br>
                    <a href="https://www.wasenderbrasil.me/p/download.html?" style="background:#0d6efd;color:white;padding:12px 25px;text-decoration:none;border-radius:5px;font-weight:bold;">BAIXAR AGORA</a>
                    <p style="margin-top:20px;"><button onclick="location.reload()" style="cursor:pointer;padding:8px 15px;">A chave não apareceu? Clique aqui</button></p>
                </div>
            `);
        } else {
            res.send("<h1>Pagamento em processamento...</h1><p>Assim que aprovado, sua licença aparecerá aqui.</p>");
        }
    } catch (e) {
        res.send("<h1>Processando seu pedido...</h1><p>Atualize a página em alguns instantes.</p>");
    }
});

// 2. WEBHOOK (Processamento em segundo plano)
app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    
    const idPagamento = body.data?.id || (body.resource ? body.resource.split('/').pop() : null);
    if (!idPagamento || isNaN(idPagamento)) return;

    console.log(`[WEBHOOK] Novo pagamento detectado: ${idPagamento}`);

    try {
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;
        if (p.status === 'approved') {
            const valor = p.transaction_amount;
            const email = (p.payer?.email || `cliente_${idPagamento}@mercadopago.com`).trim();
            const nome = p.payer?.first_name || "Cliente";
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            console.log(`[WEBHOOK] Pagamento Aprovado: R$ ${valor} para ${email}`);

            // REGRAS DE ENTREGA (VALOR DE TESTE: 0.01)
            if (valor >= 239.00) {
                await criarAdmin(email, nome, senha, 999999);
                entregasTemporarias[email] = { cota: "Ilimitada" };
            } else if (valor >= 139.00) {
                await criarAdmin(email, nome, senha, 50);
                entregasTemporarias[email] = { cota: "50" };
            } else if (valor >= 1.00) { // MUDAR PARA 59.00 APÓS O TESTE
                await criarAdmin(email, nome, senha, 10);
                entregasTemporarias[email] = { cota: "10" };
            } else if (valor >= 49.00) {
                const chave = await gerarLicenca(email, nome, "VITALICIA");
                entregasTemporarias[email] = { chave: chave };
            } else {
                const chave = await gerarLicenca(email, nome, "ANUAL");
                entregasTemporarias[email] = { chave: chave };
            }
            console.log(`[WEBHOOK] Processo finalizado com sucesso para ${email}`);
        }
    } catch (error) { console.error('[ERRO WEBHOOK]', error.message); }
});

// 3. FUNÇÕES ZAPLINK
async function criarAdmin(email, nome, senha, cota) {
    try {
        await axios.post('https://control.zaplink.net/api/create_admin', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            admin_email: email, admin_name: nome, admin_password: senha,
            admin_role: "admin", license_quota: cota, allowed_products: "waoriginal"
        });
        console.log(`[ZAPLINK] Admin ${email} criado no painel.`);
    } catch (e) { console.error('[ZAPLINK ADMIN]', e.response?.data || e.message); }
}

async function gerarLicenca(email, nome, tipo) {
    try {
        const res = await axios.post('https://control.zaplink.net/api/generate_license', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            name: `${nome} (${tipo})`, email: email, product_id: "waoriginal"
        });
        console.log(`[ZAPLINK] Licença gerada para ${email}`);
        return res.data.license_code || res.data.license_key;
    } catch (e) { 
        console.error('[ZAPLINK LICENÇA]', e.response?.data || e.message);
        return "Erro na geração automática";
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT} - Aguardando vendas!`));