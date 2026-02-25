const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ROTA DE SUCESSO - O QUE O CLIENTE VÊ NA TELA
app.get('/sucesso', async (req, res) => {
    const idPagamento = req.query.payment_id;
    if (!idPagamento) return res.send("Aguardando confirmação...");

    try {
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const pagamento = mpResponse.data;
        const valor = pagamento.transaction_amount;
        const senhaPadrao = `Zap@${idPagamento.toString().slice(-4)}`;
        const email = pagamento.payer?.email || "seu e-mail de compra";

        if (pagamento.status === 'approved') {
            let titulo = "";
            let instrucoes = "";

            if (valor >= 59.00) {
                // É UM REVENDEDOR
                titulo = "Sua conta de Revendedor está pronta! 🚀";
                instrucoes = `
                    <p>Você agora tem acesso ao nosso painel administrativo.</p>
                    <div style="background: #e9ecef; padding: 15px; border-radius: 8px; display: inline-block; text-align: left;">
                        <strong>URL de Login:</strong> <a href="https://control.zaplink.net/" target="_blank">control.zaplink.net</a><br>
                        <strong>E-mail:</strong> ${email}<br>
                        <strong>Senha Provisória:</strong> <span style="color: #d63384; font-weight: bold;">${senhaPadrao}</span>
                    </div>
                    <p style="color: #666; font-size: 0.9em; margin-top: 10px;">* Recomendamos alterar sua senha após o primeiro login.</p>
                `;
            } else {
                // É UM CLIENTE COMUM
                titulo = "Sua Licença foi Gerada! ✅";
                instrucoes = `
                    <p>Sua licença foi enviada para o e-mail: <strong>${email}</strong></p>
                    <p>Caso não encontre, verifique sua caixa de spam.</p>
                `;
            }

            res.send(`
                <div style="font-family: sans-serif; text-align: center; padding: 40px; line-height: 1.6;">
                    <h1 style="color: #198754;">${titulo}</h1>
                    ${instrucoes}
                    <br><br>
                    <a href="https://wasenderbrasil.me" style="background: #0d6efd; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Voltar para o site</a>
                </div>
            `);
        } else {
            res.send("O pagamento está em processamento. Por favor, atualize a página em instantes.");
        }
    } catch (e) {
        res.send("Erro ao carregar dados. Entre em contato com o suporte.");
    }
});

// WEBHOOK - O QUE ACONTECE NO BACKEND (Zaplink)
app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    let idPagamento = body.data?.id || body.id;
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

            if (valor >= 239.00) await criarAdmin(email, nome, senha, 999999);
            else if (valor >= 139.00) await criarAdmin(email, nome, senha, 50);
            else if (valor >= 59.00) await criarAdmin(email, nome, senha, 10);
            else if (valor >= 49.00) await gerarLicenca(email, nome, "VITALICIA");
            else if (valor >= 29.00) await gerarLicenca(email, nome, "ANUAL");
        }
    } catch (error) { console.error('Erro Webhook:', error.message); }
});

async function criarAdmin(email, nome, senha, cota) {
    await axios.post('https://control.zaplink.net/api/create_admin', {
        token: process.env.ZAPLINK_TOKEN,
        admin_email: email, admin_name: nome, admin_password: senha,
        admin_role: "admin", license_quota: cota, allowed_products: "waoriginal"
    });
}

async function gerarLicenca(email, nome, tipo) {
    await axios.post('https://control.zaplink.net/api/generate_license', {
        token: process.env.ZAPLINK_TOKEN,
        name: `${nome} (${tipo})`, email: email, product_id: "waoriginal"
    });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));