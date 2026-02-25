const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
    res.send('<h1>Servidor Ativo e Conectado!</h1>');
});

// ESTA É A PÁGINA QUE O CLIENTE VÊ
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
            const email = p.payer?.email || "seu e-mail";
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            let conteudo = valor >= 59.00 ? 
                `<h2>Sua conta de Revendedor está pronta!</h2>
                 <p><b>Painel:</b> <a href="https://control.zaplink.net/">control.zaplink.net</a></p>
                 <p><b>Login:</b> ${email}</p>
                 <p><b>Senha:</b> ${senha}</p>` :
                `<h2>Sua Licença foi Gerada! ✅</h2>
                 <p>A licença foi enviada para o e-mail: <b>${email}</b></p>
                 <p>Verifique sua caixa de entrada e spam.</p>`;

            res.send(`<div style="font-family:sans-serif;text-align:center;padding:50px;border:2px solid #28a745;border-radius:15px;max-width:500px;margin:auto;">
                ${conteudo}
                <br><a href="https://wasenderbrasil.me" style="background:#007bff;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Voltar para o site</a>
            </div>`);
        } else {
            res.send("<h1>Pagamento em análise...</h1><p>Atualize a página em instantes.</p>");
        }
    } catch (e) { res.send("<h1>Sucesso!</h1><p>Sua licença está sendo processada e chegará por e-mail.</p>"); }
});

app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    let idPagamento = null;
    if (body.data && body.data.id) idPagamento = body.data.id;
    else if (body.resource) {
        const matches = body.resource.toString().match(/\d+/g);
        if (matches) idPagamento = matches.join('');
    }

    if (!idPagamento || idPagamento === '123456789') return;

    try {
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;
        if (p.status === 'approved') {
            const valor = p.transaction_amount;
            const email = (p.payer?.email || p.additional_info?.payer?.email || `cliente_${idPagamento}@mercadopago.com`).trim();
            const nome = p.payer?.first_name || "Cliente";
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            // ENTREGA NA ZAPLINK
            if (valor >= 239.00) await enviarZaplink('create_admin', { admin_email: email, admin_name: nome, admin_password: senha, admin_role: "admin", license_quota: 999999, allowed_products: "7774" });
            else if (valor >= 139.00) await enviarZaplink('create_admin', { admin_email: email, admin_name: nome, admin_password: senha, admin_role: "admin", license_quota: 50, allowed_products: "7774" });
            else if (valor >= 59.00) await enviarZaplink('create_admin', { admin_email: email, admin_name: nome, admin_password: senha, admin_role: "admin", license_quota: 10, allowed_products: "7774" });
            else if (valor >= 49.00) await enviarZaplink('generate_license', { name: `${nome} (Vitalícia)`, email: email, product_id: "waoriginal" });
            else if (valor >= 29.00) await enviarZaplink('generate_license', { name: `${nome} (Anual)`, email: email, product_id: "waoriginal" });
            
            console.log(`✅ Sucesso para ${email}`);
        }
    } catch (error) { console.error('Erro:', error.message); }
});

async function enviarZaplink(endpoint, dados) {
    try {
        dados.token = process.env.ZAPLINK_TOKEN;
        const res = await axios.post(`https://control.zaplink.net/api/${endpoint}`, dados);
        console.log(`Resposta Zaplink (${endpoint}):`, JSON.stringify(res.data));
    } catch (e) { console.error(`Erro Zaplink (${endpoint}):`, e.response?.data || e.message); }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));