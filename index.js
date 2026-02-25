const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// 1. ROTA DE SUCESSO (Exibe a Chave Serial na Tela)
app.get('/sucesso', async (req, res) => {
    const idPagamento = req.query.payment_id || req.query.id;
    if (!idPagamento) return res.send("<h1>Aguardando confirmação do pagamento...</h1>");

    try {
        // 1. Busca detalhes no Mercado Pago
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;
        if (p.status === 'approved') {
            const email = (p.payer?.email || "").trim();
            const valor = p.transaction_amount;

            // Se for Revendedor (valor alto), mostramos os dados de login
            if (valor >= 59.00) {
                const senha = `Zap@${idPagamento.toString().slice(-4)}`;
                return res.send(`
                    <div style="font-family:sans-serif;text-align:center;padding:50px;">
                        <h1 style="color:#198754;">Painel de Revendedor Liberado!</h1>
                        <div style="background:#f8f9fa;padding:20px;border-radius:10px;display:inline-block;border:1px solid #ddd;">
                            <p><b>Login:</b> ${email}</p>
                            <p><b>Senha:</b> ${senha}</p>
                            <p><b>Painel:</b> <a href="https://control.zaplink.net/">Acessar Agora</a></p>
                        </div>
                    </div>
                `);
            }

            // Se for Licença, buscamos a KEY na Zaplink pelo e-mail
            // Adicionamos um pequeno delay de 2 segundos para dar tempo do webhook processar
            await new Promise(resolve => setTimeout(resolve, 2000));

            const zapResponse = await axios.post('https://control.zaplink.net/api/get_license', {
                token: process.env.ZAPLINK_TOKEN.trim(),
                email: email
            });

            // Pega a chave da resposta da Zaplink
            const licenseKey = zapResponse.data?.license_key || "Gerando chave... atualize a página";

            res.send(`
                <div style="font-family:sans-serif;text-align:center;padding:50px;line-height:1.6;">
                    <h1 style="color:#198754;">Pagamento Aprovado! ✅</h1>
                    <p style="font-size:18px;">Copie e cole sua chave de ativação abaixo:</p>
                    
                    <div style="background:#333;color:#00ff00;padding:20px;border-radius:10px;display:inline-block;font-family:monospace;font-size:24px;letter-spacing:2px;border:2px solid #000;margin:10px 0;">
                        <b>${licenseKey}</b>
                    </div>

                    <p style="color:#666;">E-mail de ativação: <b>${email}</b></p>
                    
                    <br><br>
                    <a href="https://www.wasenderbrasil.me/p/download.html?" style="background:#0d6efd;color:white;padding:12px 25px;text-decoration:none;border-radius:5px;font-weight:bold;">BAIXAR INSTALADOR</a>
                </div>
            `);
        } else {
            res.send("<h1>Pagamento em análise...</h1><p>Assim que for aprovado, sua chave aparecerá aqui.</p>");
        }
    } catch (e) { 
        res.send("<h1>Quase lá!</h1><p>Estamos gerando sua chave. Por favor, atualize a página em 10 segundos.</p>"); 
    }
});

// 2. WEBHOOK (Cria a licença no sistema)
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

        if (valor >= 239.00) await criarAdmin(email, nome, senha, 999999);
        else if (valor >= 139.00) await criarAdmin(email, nome, senha, 50);
        else if (valor >= 59.00) await criarAdmin(email, nome, senha, 10);
        else if (valor >= 49.00) await gerarLicenca(email, nome, "VITALICIA");
        else if (valor >= 0.01) await gerarLicenca(email, nome, "ANUAL");
        
    } catch (error) { console.error('Erro Webhook:', error.message); }
});

// 3. FUNÇÕES ZAPLINK
async function criarAdmin(email, nome, senha, cota) {
    try {
        await axios.post('https://control.zaplink.net/api/create_admin', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            admin_email: email, admin_name: nome, admin_password: senha,
            admin_role: "admin", license_quota: cota, allowed_products: "waoriginal"
        });
    } catch (e) { console.error("Erro Admin"); }
}

async function gerarLicenca(email, nome, tipo) {
    try {
        await axios.post('https://control.zaplink.net/api/generate_license', {
            token: process.env.ZAPLINK_TOKEN.trim(),
            name: `${nome} (${tipo})`, email: email, product_id: "waoriginal"
        });
    } catch (e) { console.error("Erro Licença"); }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sistema de Chaves Online!`));