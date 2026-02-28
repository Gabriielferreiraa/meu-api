const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Memória temporária para exibir os dados na tela de sucesso
const entregasTemporarias = {};

// 1. ROTA DE SUCESSO (O que o cliente vê após o pagamento)
app.get('/sucesso', async (req, res) => {
    const idPagamento = req.query.payment_id || req.query.id;
    console.log(`>>> [VISITA SUCESSO] Cliente chegou na página. ID: ${idPagamento}`);

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
                await new Promise(r => setTimeout(r, 4000)); // Espera o webhook processar
                dados = entregasTemporarias[email];
            }

            // --- TELA DE ADMIN / REVENDEDOR (VALOR >= R$ 59,00) ---
            if (valor >= 59.00) { 
                const cotaExibir = dados?.cota || "10";
                return res.send(`
                    <div style="font-family:sans-serif;text-align:center;padding:50px;line-height:1.6;">
                        <h1 style="color:#198754;">Painel de Revendedor Liberado! 🚀</h1>
                        <div style="background:#f8f9fa;padding:30px;border-radius:15px;display:inline-block;border:2px solid #2563eb;text-align:left;box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                            <p style="margin:8px 0;"><b>📧 Usuário:</b> ${email}</p>
                            <p style="margin:8px 0;"><b>🔑 Senha:</b> ${senha}</p>
                            <p style="margin:8px 0;"><b>📊 Cota de Licenças:</b> <span style="color:#2563eb;font-weight:bold;font-size:18px;">${cotaExibir} unidades</span></p>
                            <hr style="border:0;border-top:1px solid #eee;margin:15px 0;">
                            <p style="text-align:center;"><a href="https://control.zaplink.net/" style="background:#2563eb;color:white;padding:12px 25px;text-decoration:none;border-radius:5px;font-weight:bold;display:inline-block;">ACESSAR MEU PAINEL</a></p>
                        </div>
                        <p style="margin-top:20px;"><button onclick="location.reload()" style="cursor:pointer;padding:8px 15px;">Atualizar Dados</button></p>
                    </div>
                `);
            } 

            // --- TELA DE LICENÇA (SERIAL) ---
            const chaveExibir = dados?.chave || "Gerando sua chave... por favor, atualize em 5 segundos.";
            return res.send(`
                <div style="font-family:sans-serif;text-align:center;padding:50px;line-height:1.6;">
                    <h1 style="color:#198754;">Pagamento Confirmado! ✅</h1>
                    <p style="font-size:18px;">Sua chave de ativação:</p>
                    <div style="background:#222;color:#0f0;padding:20px;border-radius:10px;display:inline-block;font-family:monospace;font-size:26px;border:2px solid #000;margin:10px 0;letter-spacing:1px;">
                        <b>${chaveExibir}</b>
                    </div>
                    <p>E-mail de ativação: <b>${email}</b></p>
                    <br><br>
                    <a href="https://www.wasenderbrasil.me/p/download.html?" style="background:#0d6efd;color:white;padding:12px 25px;text-decoration:none;border-radius:5px;font-weight:bold;">BAIXAR INSTALADOR</a>
                    <p style="margin-top:20px;"><button onclick="location.reload()" style="cursor:pointer;padding:8px 15px;">Ver minha chave</button></p>
                </div>
            `);
        } else {
            res.send("<h1>Pagamento em processamento...</h1><p>Atualize a página assim que o pagamento for aprovado.</p>");
        }
    } catch (e) {
        console.log("!!! [ERRO TELA SUCESSO]:", e.message);
        res.send("<h1>Processando...</h1><p>Verifique seu e-mail ou atualize a página em instantes.</p>");
    }
});

// 2. WEBHOOK (Processamento e Filtro Anti-Mercado Livre)
app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    
    const idPagamento = body.data?.id || (body.resource ? body.resource.split('/').pop() : null);
    if (!idPagamento || isNaN(idPagamento)) return;

    console.log(`>>> [NOTIFICAÇÃO] Processando ID: ${idPagamento}`);

    try {
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;

        // --- FILTRO INTELIGENTE MERCADO LIVRE ---
        const eMercadoLivre = (p.external_reference && p.external_reference.includes('MLB')) || 
                              (p.order && p.order.type === 'mercadolibre');

        if (eMercadoLivre) {
            console.log(`!!! [FILTRO] Venda ignorada: Mercado Livre (ID: ${idPagamento})`);
            return; 
        }

        if (p.status === 'approved') {
            const valor = p.transaction_amount;
            const email = (p.payer?.email || `cliente_${idPagamento}@mercadopago.com`).trim();
            const nome = p.payer?.first_name || "Cliente";
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            console.log(`>>> [APROVADO] Valor: R$ ${valor} | Email: ${email}`);

            // --- LÓGICA DE CRIAÇÃO ---
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
                // SE VALOR >= 49.00 É VITALÍCIA (ENVIA EXPIRES_AT VAZIO)
                const isVitalicia = valor >= 49.00;
                const tipo = isVitalicia ? "VITALICIA" : "ANUAL";
                const chave = await gerarLicenca(email, nome, tipo, isVitalicia ? "" : null);
                entregasTemporarias[email] = { chave: chave };
            }
            console.log(`>>> [OK] Processo finalizado com sucesso para ${email}`);
        }
    } catch (error) { 
        console.error('!!! [ERRO WEBHOOK]:', error.message); 
    }
});

// 3. FUNÇÕES ZAPLINK (Com suporte a Vitalício)
async function criarAdmin(email, nome, senha, cota) {
    try {
        await axios.post('https://control.zaplink.net/api/create_admin', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            admin_email: email, admin_name: nome, admin_password: senha,
            admin_role: "admin", license_quota: cota, allowed_products: "waoriginal"
        });
        console.log(`[ZAPLINK] Admin ${email} criado.`);
    } catch (e) { console.error('[ZAPLINK ADMIN]', e.response?.data || e.message); }
}

async function gerarLicenca(email, nome, tipo, expiracao) {
    try {
        const dadosApi = {
            token: process.env.ZAPLINK_TOKEN.trim(),
            name: `${nome} (${tipo})`, 
            email: email, 
            product_id: "waoriginal"
        };

        // Se expiracao for "" (vitalício), adiciona ao envio para o Zaplink
        if (expiracao !== null) {
            dadosApi.expires_at = expiracao;
        }

        const res = await axios.post('https://control.zaplink.net/api/generate_license', dadosApi);
        console.log(`[ZAPLINK] Licença ${tipo} gerada para ${email}`);
        return res.data.license_code || res.data.license_key;
    } catch (e) { 
        console.error('[ZAPLINK LICENÇA]', e.response?.data || e.message);
        return "Erro na geração automática";
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sistema de Produção Online!`));