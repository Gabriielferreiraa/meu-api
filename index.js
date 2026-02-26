const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Objeto temporário para guardar as chaves geradas (limpa quando o servidor reinicia)
const chavesTemporarias = {};

// 1. ROTA DE SUCESSO (Mostra o código capturado)
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
            
            // Tenta pegar a chave que o Webhook guardou
            const chaveEncontrada = chavesTemporarias[email] || "Gerando chave... atualize a página em 5 segundos.";

            res.send(`
                <div style="font-family:sans-serif;text-align:center;padding:50px;line-height:1.6;">
                    <h1 style="color:#198754;">Pagamento Aprovado! ✅</h1>
                    <p style="font-size:18px;">Sua chave de ativação:</p>
                    
                    <div style="background:#222;color:#0f0;padding:20px;border-radius:10px;display:inline-block;font-family:monospace;font-size:24px;border:2px solid #000;margin:10px 0;">
                        <b>${chaveEncontrada}</b>
                    </div>

                    <p>E-mail de ativação: <b>${email}</b></p>
                    
                    <br><br>
                    <a href="https://www.wasenderbrasil.me/p/download.html?" style="background:#0d6efd;color:white;padding:12px 25px;text-decoration:none;border-radius:5px;font-weight:bold;">BAIXAR INSTALADOR</a>
                    <p style="margin-top:20px;"><button onclick="location.reload()" style="cursor:pointer;padding:8px 15px;border-radius:5px;border:1px solid #ccc;">Clique aqui se a chave não aparecer</button></p>
                </div>
            `);
        } else {
            res.send("<h1>Pagamento em processamento...</h1>");
        }
    } catch (e) {
        res.send("<h1>Sucesso!</h1><p>Sua licença foi gerada. Verifique seu e-mail.</p>");
    }
});

// 2. WEBHOOK (Cria a licença e guarda o código)
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
        if (p.status === 'approved') {
            const email = (p.payer?.email || `cliente_${idPagamento}@mercadopago.com`).trim();
            const nome = p.payer?.first_name || "Cliente";

            // CHAMA A ZAPLINK
            const zapRes = await axios.post('https://control.zaplink.net/api/generate_license', {
                token: process.env.ZAPLINK_TOKEN.trim(),
                name: `${nome} (Venda)`, 
                email: email, 
                product_id: "waoriginal"
            });

            // GUARDA O CÓDIGO QUE VOCÊ VIU NO LOG
            if (zapRes.data && zapRes.data.license_code) {
                chavesTemporarias[email] = zapRes.data.license_code;
                console.log(`✅ Chave capturada para ${email}: ${zapRes.data.license_code}`);
            }
        }
    } catch (error) { console.error('Erro no Webhook:', error.message); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Online e Capturando Chaves!`));