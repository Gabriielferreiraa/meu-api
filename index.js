const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// 1. ROTA DE SUCESSO (Mostra a Chave Serial para o Cliente)
app.get('/sucesso', async (req, res) => {
    const idPagamento = req.query.payment_id || req.query.id;
    if (!idPagamento) return res.send("<h1>Aguardando confirmação...</h1>");

    try {
        // Busca os detalhes do pagamento para pegar o e-mail
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;
        if (p.status === 'approved') {
            const email = (p.payer?.email || "").trim();
            
            // 2 segundos de espera para o webhook completar a criação na Zaplink
            await new Promise(resolve => setTimeout(resolve, 2500));

            // Busca a licença recém-criada na Zaplink para exibir o código
            const zapSearch = await axios.post('https://control.zaplink.net/api/get_license', {
                token: process.env.ZAPLINK_TOKEN.trim(),
                email: email
            });

            const chave = zapSearch.data?.license_key || zapSearch.data?.license_code || "Verifique seu e-mail";

            res.send(`
                <div style="font-family:sans-serif;text-align:center;padding:50px;line-height:1.6;">
                    <h1 style="color:#198754;">Pagamento Aprovado! ✅</h1>
                    <p style="font-size:18px;">Sua chave de ativação apareceu!</p>
                    
                    <div style="background:#222;color:#0f0;padding:20px;border-radius:10px;display:inline-block;font-family:monospace;font-size:24px;border:2px solid #000;margin:10px 0;">
                        <b>${chave}</b>
                    </div>

                    <p>Ative no programa usando o e-mail: <b>${email}</b></p>
                    
                    <br><br>
                    <a href="https://www.wasenderbrasil.me/p/download.html?" style="background:#0d6efd;color:white;padding:12px 25px;text-decoration:none;border-radius:5px;font-weight:bold;">BAIXAR INSTALADOR</a>
                    <p style="margin-top:20px;"><button onclick="location.reload()" style="cursor:pointer;padding:5px 10px;">A chave não apareceu? Clique aqui</button></p>
                </div>
            `);
        } else {
            res.send("<h1>Pagamento em processamento...</h1>");
        }
    } catch (e) {
        res.send("<h1>Sucesso!</h1><p>Sua licença foi gerada. Se a chave não apareceu aqui, verifique seu e-mail.</p>");
    }
});

// 2. WEBHOOK (Criação automática na Zaplink)
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
        let emailOriginal = (p.payer?.email || "").trim();
        const email = (emailOriginal.includes('@')) ? emailOriginal : `cliente_${idPagamento}@mercadopago.com`;
        const nome = p.payer?.first_name || "Cliente";

        // Chama a Zaplink para gerar
        if (valor >= 59.00) {
            await axios.post('https://control.zaplink.net/api/create_admin', {
                token: process.env.ZAPLINK_TOKEN.trim(),
                admin_email: email, admin_name: nome, admin_password: `Zap@${idPagamento.toString().slice(-4)}`,
                admin_role: "admin", license_quota: 10, allowed_products: "waoriginal"
            });
        } else {
            await axios.post('https://control.zaplink.net/api/generate_license', {
                token: process.env.ZAPLINK_TOKEN.trim(),
                name: `${nome} (Venda)`, email: email, product_id: "waoriginal"
            });
        }
        console.log(`✅ Licença criada no Webhook para: ${email}`);
        
    } catch (error) { console.error('Erro no Webhook:', error.message); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando!`));