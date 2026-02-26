const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Memória temporária para exibir os dados na tela de sucesso
const entregasTemporarias = {};

// 1. ROTA DE SUCESSO (Onde o cliente vê o produto após pagar)
app.get('/sucesso', async (req, res) => {
    const idPagamento = req.query.payment_id || req.query.id;
    if (!idPagamento) return res.send("<h1>Aguardando confirmação do pagamento...</h1>");

    try {
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;
        if (p.status === 'approved') {
            const email = (p.payer?.email || "").trim();
            const valor = p.transaction_amount;
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            // Tenta pegar os dados salvos pelo Webhook (com espera de 3.5s caso o webhook atrase)
            let dados = entregasTemporarias[email];
            if (!dados) {
                await new Promise(r => setTimeout(r, 3500));
                dados = entregasTemporarias[email];
            }

            // --- TELA DE ADMIN / REVENDEDOR (VALOR >= R$ 59,00) ---
            if (valor >= 59.00) { 
                const cotaExibir = dados?.cota || "Verifique no painel";
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

            // --- TELA DE LICENÇA (SERIAL) PARA VALORES ABAIXO DE R$ 59,00 ---
            const chaveExibir = dados?.chave || "Gerando sua chave... por favor, aguarde 5 segundos e atualize a página.";
            return res.send(`
                <div style="font-family:sans-serif;text-align:center;padding:50px;line-height:1.6;">
                    <h1 style="color:#198754;">Pagamento Confirmado! ✅</h1>
                    <p style="font-size:18px;">Sua chave de ativação:</p>
                    <div style="background:#222;color:#0f0;padding:20px;border-radius:10px;display:inline-block;font-family:monospace;font-size:26px;border:2px solid #000;margin:10px 0;letter-spacing:1px;">
                        <b>${chaveExibir}</b>
                    </div>
                    <p>Ative no software com o e-mail: <b>${email}</b></p>
                    <br><br>
                    <a href="https://www.wasenderbrasil.me/p/download.html?" style="background:#0d6efd;color:white;padding:12px 25px;text-decoration:none;border-radius:5px;font-weight:bold;">BAIXAR INSTALADOR</a>
                    <p style="margin-top:20px;"><button onclick="location.reload()" style="cursor:pointer;padding:8px 15px;">Ver minha chave</button></p>
                </div>
            `);

        } else {
            res.send("<h1>Pagamento em processamento...</h1><p>Assim que o Mercado Pago aprovar, sua licença aparecerá aqui.</p>");
        }
    } catch (e) {
        res.send("<h1>Sucesso!</h1><p>Sua licença foi gerada. Caso não apareça aqui, verifique seu e-mail.</p>");
    }
});

// 2. WEBHOOK (Criação automática na Zaplink)
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
            const email = (p.payer?.email || `cliente_${idPagamento}@mercadopago.com`).trim();
            const nome = p.payer?.first_name || "Cliente";
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            // --- REGRAS DE CRIAÇÃO POR VALOR ---
            
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
                const tipo = valor >= 49.00 ? "VITALICIA" : "ANUAL";
                const chave = await gerarLicenca(email, nome, tipo);
                entregasTemporarias[email] = { chave: chave };
            }
        }
    } catch (error) { console.error('Erro no processamento do Webhook'); }
});

// 3. FUNÇÕES DE APOIO ZAPLINK
async function criarAdmin(email, nome, senha, cota) {
    try {
        await axios.post('https://control.zaplink.net/api/create_admin', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            admin_email: email, admin_name: nome, admin_password: senha,
            admin_role: "admin", license_quota: cota, allowed_products: "waoriginal"
        });
    } catch (e) { console.error("Erro Zaplink Admin"); }
}

async function gerarLicenca(email, nome, tipo) {
    try {
        const res = await axios.post('https://control.zaplink.net/api/generate_license', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            name: `${nome} (${tipo})`, email: email, product_id: "waoriginal"
        });
        return res.data.license_code || res.data.license_key;
    } catch (e) { 
        console.error("Erro Zaplink Licença");
        return "Erro na geração automática";
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor de Produção Ativado na porta ${PORT}`));